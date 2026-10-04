// src/data/database/fallbackDb.js
// High-compatibility pure-JavaScript database engine that mirrors the node:sqlite DatabaseSync API.
// Used when node:sqlite is not available (e.g. Electron desktop runtime / Node.js < 22.5).
const fs = require("fs");
const path = require("path");

class FallbackStatement {
    constructor(db, sql) {
        this.db = db;
        this.sql = sql.trim();
        this.trimmedSql = this.sql.replace(/\s+/g, " ");
    }

    run(...params) {
        return this.db._executeRun(this.sql, params);
    }

    get(...params) {
        const rows = this.db._executeQuery(this.sql, params);
        return rows.length > 0 ? rows[0] : undefined;
    }

    all(...params) {
        return this.db._executeQuery(this.sql, params);
    }
}

class FallbackDatabaseSync {
    constructor(dbFilePath) {
        this.dbFilePath = dbFilePath;
        this.storageFilePath = dbFilePath.endsWith(".json")
            ? dbFilePath
            : `${dbFilePath}.json`;

        this.tables = {
            users: [],
            point_transactions: [],
            siapa_players: [],
            siapa_history: []
        };

        this.counters = {
            users: 0,
            point_transactions: 0,
            siapa_players: 0,
            siapa_history: 0
        };

        this._loadFromDisk();
    }

    exec(sql) {
        const statements = sql
            .split(";")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        for (const stmt of statements) {
            this._executeRun(stmt, []);
        }
    }

    prepare(sql) {
        return new FallbackStatement(this, sql);
    }

    _loadFromDisk() {
        try {
            const dir = path.dirname(this.storageFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (fs.existsSync(this.storageFilePath)) {
                const raw = fs.readFileSync(this.storageFilePath, "utf8");
                const data = JSON.parse(raw);
                if (data && typeof data === "object") {
                    for (const tbl of Object.keys(this.tables)) {
                        if (Array.isArray(data[tbl])) {
                            this.tables[tbl] = data[tbl];
                            let maxId = 0;
                            for (const row of this.tables[tbl]) {
                                if (row && typeof row.id === "number" && row.id > maxId) {
                                    maxId = row.id;
                                }
                            }
                            this.counters[tbl] = maxId;
                        }
                    }
                }
            }
        } catch (err) {
            console.warn("⚠️ [FALLBACK DB] Gagal membaca data disk:", err.message);
        }
    }

    _saveToDisk() {
        try {
            const dir = path.dirname(this.storageFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const tmpFile = `${this.storageFilePath}.tmp`;
            const payload = JSON.stringify(this.tables, null, 2);
            fs.writeFileSync(tmpFile, payload, "utf8");
            fs.renameSync(tmpFile, this.storageFilePath);
        } catch (err) {
            console.error("❌ [FALLBACK DB] Gagal menyimpan ke disk:", err.message);
        }
    }

    _getTable(name) {
        const tblName = String(name || "").toLowerCase().trim();
        if (!this.tables[tblName]) {
            this.tables[tblName] = [];
            this.counters[tblName] = 0;
        }
        return this.tables[tblName];
    }

    _getNextId(name) {
        const tblName = String(name || "").toLowerCase().trim();
        if (!this.counters[tblName]) this.counters[tblName] = 0;
        this.counters[tblName] += 1;
        return this.counters[tblName];
    }

    _executeRun(rawSql, params = []) {
        const sql = rawSql.trim().replace(/\s+/g, " ");

        // Ignore pragmas and index creations
        if (/^PRAGMA/i.test(sql) || /^CREATE INDEX/i.test(sql)) {
            return { changes: 0, lastInsertRowid: 0 };
        }

        // CREATE TABLE
        if (/^CREATE TABLE/i.test(sql)) {
            const match = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?([a-zA-Z0-9_]+)/i);
            if (match) {
                const tableName = match[1].toLowerCase();
                this._getTable(tableName);
            }
            return { changes: 0, lastInsertRowid: 0 };
        }

        // INSERT INTO
        if (/^INSERT INTO/i.test(sql)) {
            return this._handleInsert(sql, params);
        }

        // UPDATE
        if (/^UPDATE/i.test(sql)) {
            return this._handleUpdate(sql, params);
        }

        // DELETE
        if (/^DELETE FROM/i.test(sql)) {
            return this._handleDelete(sql, params);
        }

        return { changes: 0, lastInsertRowid: 0 };
    }

    _handleInsert(sql, params) {
        const tableMatch = sql.match(/INSERT INTO ([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(.*)/i);
        if (!tableMatch) {
            return { changes: 0, lastInsertRowid: 0 };
        }

        const tableName = tableMatch[1].toLowerCase();
        const columns = tableMatch[2].split(",").map((c) => c.trim());
        const rawValues = tableMatch[3].split(",").map((v) => v.trim());
        const extraClause = tableMatch[4] || "";
        const table = this._getTable(tableName);

        const newRow = {};
        let pIdx = 0;
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const rawVal = rawValues[i] !== undefined ? rawValues[i] : "?";
            if (rawVal === "?") {
                newRow[col] = params[pIdx++];
            } else if (/^[0-9]+$/.test(rawVal)) {
                newRow[col] = Number(rawVal);
            } else if (/^null$/i.test(rawVal)) {
                newRow[col] = null;
            } else {
                newRow[col] = rawVal.replace(/^['"]|['"]$/g, "");
            }
        }

        if (newRow.points !== undefined && newRow.points !== null) {
            newRow.points = Number(newRow.points);
        }
        if (newRow.level !== undefined && newRow.level !== null) {
            newRow.level = Number(newRow.level);
        }
        if (newRow.total_points !== undefined && newRow.total_points !== null) {
            newRow.total_points = Number(newRow.total_points);
        }

        // Check ON CONFLICT
        if (/ON CONFLICT/i.test(extraClause)) {
            if (tableName === "users") {
                const existingIndex = table.findIndex(
                    (u) =>
                        String(u.platform).toLowerCase() === String(newRow.platform).toLowerCase() &&
                        String(u.platform_user_id).toLowerCase() === String(newRow.platform_user_id).toLowerCase()
                );
                if (existingIndex !== -1) {
                    const existing = table[existingIndex];
                    if (newRow.points !== undefined && Number(newRow.points) > Number(existing.points || 0)) {
                        existing.points = Number(newRow.points);
                    }
                    if (newRow.level !== undefined && Number(newRow.level) > Number(existing.level || 1)) {
                        existing.level = Number(newRow.level);
                    }
                    if (newRow.display_name) {
                        existing.display_name = newRow.display_name;
                    }
                    existing.updated_at = newRow.updated_at || new Date().toISOString();
                    this._saveToDisk();
                    return { changes: 1, lastInsertRowid: existing.id };
                }
            }
        }

        // Ensure primary key id
        if (newRow.id === undefined || newRow.id === null) {
            newRow.id = this._getNextId(tableName);
        } else {
            const numId = Number(newRow.id);
            if (numId > this.counters[tableName]) {
                this.counters[tableName] = numId;
            }
        }

        table.push(newRow);
        this._saveToDisk();
        return { changes: 1, lastInsertRowid: newRow.id };
    }

    _handleUpdate(sql, params) {
        const updateMatch = sql.match(/UPDATE ([a-zA-Z0-9_]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
        if (!updateMatch) return { changes: 0, lastInsertRowid: 0 };

        const tableName = updateMatch[1].toLowerCase();
        const setClause = updateMatch[2];
        const whereClause = updateMatch[3] || "";
        const table = this._getTable(tableName);

        const setAssignments = setClause.split(",").map((s) => s.trim());
        let paramIndex = 0;
        const setMap = {};

        for (const assign of setAssignments) {
            const m = assign.match(/([a-zA-Z0-9_]+)\s*=\s*(.*)/);
            if (m) {
                const col = m[1];
                const expr = m[2].trim();
                if (expr === "?") {
                    setMap[col] = params[paramIndex++];
                } else if (/^[0-9]+$/.test(expr)) {
                    setMap[col] = Number(expr);
                } else {
                    setMap[col] = expr.replace(/^['"]|['"]$/g, "");
                }
            }
        }

        const whereParams = params.slice(paramIndex);
        let changes = 0;

        for (const row of table) {
            if (this._matchesWhere(tableName, row, whereClause, whereParams)) {
                for (const [col, val] of Object.entries(setMap)) {
                    if (typeof val === "string" && (col === "points" || col === "total_points" || col === "wins" || col === "level")) {
                        row[col] = Number(val);
                    } else if (typeof val === "number" && (col === "points" || col === "total_points" || col === "wins" || col === "level")) {
                        row[col] = val;
                    } else {
                        row[col] = val;
                    }
                }
                changes++;
            }
        }

        if (changes > 0) {
            this._saveToDisk();
        }

        return { changes, lastInsertRowid: 0 };
    }

    _handleDelete(sql, params) {
        const deleteMatch = sql.match(/DELETE FROM ([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
        if (!deleteMatch) return { changes: 0, lastInsertRowid: 0 };

        const tableName = deleteMatch[1].toLowerCase();
        const whereClause = deleteMatch[2] || "";
        const table = this._getTable(tableName);

        const initialLength = table.length;
        const remaining = table.filter((row) => !this._matchesWhere(tableName, row, whereClause, params));
        this.tables[tableName] = remaining;

        const changes = initialLength - remaining.length;
        if (changes > 0) {
            this._saveToDisk();
        }

        return { changes, lastInsertRowid: 0 };
    }

    _executeQuery(rawSql, params = []) {
        const sql = rawSql.trim().replace(/\s+/g, " ");

        // COUNT(*) queries
        if (/SELECT COUNT\(\*\)\s+(?:as\s+rank_count\s+)?FROM users WHERE points > \?/i.test(sql)) {
            const threshold = Number(params[0] || 0);
            const users = this._getTable("users");
            const count = users.filter((u) => Number(u.points || 0) > threshold).length;
            return [{ rank_count: count }];
        }

        // Duplicate users detection query
        if (/GROUP BY platform, LOWER\(username\) HAVING cnt > 1/i.test(sql)) {
            const users = this._getTable("users");
            const map = new Map();
            for (const u of users) {
                const key = `${String(u.platform).toLowerCase()}::${String(u.username || "").toLowerCase()}`;
                if (!map.has(key)) {
                    map.set(key, { platform: u.platform, lower_name: String(u.username || "").toLowerCase(), cnt: 0 });
                }
                map.get(key).cnt += 1;
            }
            return Array.from(map.values()).filter((item) => item.cnt > 1);
        }

        // Duplicate rows fetch
        if (/SELECT \* FROM users WHERE platform = \? AND LOWER\(username\) = \?/i.test(sql)) {
            const platform = String(params[0] || "").toLowerCase();
            const lowerName = String(params[1] || "").toLowerCase();
            const users = this._getTable("users");
            const rows = users.filter(
                (u) =>
                    String(u.platform).toLowerCase() === platform &&
                    String(u.username || "").toLowerCase() === lowerName
            );
            rows.sort((a, b) => {
                const aIsChannel = a.platform_user_id !== a.username && String(a.platform_user_id).length > 10 ? 1 : 0;
                const bIsChannel = b.platform_user_id !== b.username && String(b.platform_user_id).length > 10 ? 1 : 0;
                if (bIsChannel !== aIsChannel) return bIsChannel - aIsChannel;
                if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
                return (a.id || 0) - (b.id || 0);
            });
            return rows;
        }

        // Standard SELECT parsing
        const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(.+?))?(?:\s+LIMIT\s+(.+?))?$/i);
        if (!selectMatch) {
            return [];
        }

        const fieldsStr = selectMatch[1].trim();
        const tableName = selectMatch[2].toLowerCase().trim();
        const whereClause = selectMatch[3] ? selectMatch[3].trim() : "";
        const orderByClause = selectMatch[4] ? selectMatch[4].trim() : "";
        let limitClause = selectMatch[5] ? selectMatch[5].trim() : "";

        const table = this._getTable(tableName);

        // Find how many ? are in whereClause
        const whereQuestionMarks = (whereClause.match(/\?/g) || []).length;
        const whereParams = params.slice(0, whereQuestionMarks);
        let remainingParams = params.slice(whereQuestionMarks);

        let rows = table.filter((row) => this._matchesWhere(tableName, row, whereClause, whereParams));

        // ORDER BY
        if (orderByClause) {
            if (/points DESC/i.test(orderByClause) || /total_points DESC/i.test(orderByClause)) {
                rows.sort((a, b) => {
                    const diff = Number(b.points || b.total_points || 0) - Number(a.points || a.total_points || 0);
                    if (diff !== 0) return diff;
                    return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
                });
            } else if (/wins DESC/i.test(orderByClause)) {
                rows.sort((a, b) => Number(b.wins || 0) - Number(a.wins || 0));
            } else if (/id DESC/i.test(orderByClause)) {
                rows.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
            }
        }

        // LIMIT
        if (limitClause) {
            let limitVal = 1000;
            if (limitClause === "?") {
                limitVal = Number(remainingParams.shift() || 1000);
            } else {
                limitVal = Number(limitClause) || 1000;
            }
            rows = rows.slice(0, limitVal);
        }

        // Field projection
        if (fieldsStr === "*" || fieldsStr.includes("*")) {
            return rows.map((r) => ({ ...r }));
        }

        const requestedFields = fieldsStr.split(",").map((f) => f.trim().split(/\s+as\s+/i)[0].trim());
        return rows.map((r) => {
            const obj = {};
            for (const f of requestedFields) {
                obj[f] = r[f];
            }
            return obj;
        });
    }

    _matchesWhere(tableName, row, whereClause, params) {
        if (!whereClause) return true;

        // Simple matchers
        // 1. id = ?
        if (/^id = \?$/i.test(whereClause)) {
            return Number(row.id) === Number(params[0]);
        }
        if (/^user_id = \?$/i.test(whereClause)) {
            return Number(row.user_id) === Number(params[0]);
        }
        if (/^event_id = \?$/i.test(whereClause)) {
            return String(row.event_id || "") === String(params[0] || "");
        }
        if (/^LOWER\(username\) = \?$/i.test(whereClause)) {
            return String(row.username || "").toLowerCase() === String(params[0] || "").toLowerCase();
        }

        // 2. Exact platform and platform_user_id
        if (/platform = \? AND platform_user_id = \?/i.test(whereClause)) {
            const p = String(params[0] || "").toLowerCase();
            const uid = String(params[1] || "").toLowerCase();
            return (
                String(row.platform || "").toLowerCase() === p &&
                String(row.platform_user_id || "").toLowerCase() === uid
            );
        }

        // 3. User multi-field fuzzy lookup
        if (tableName === "users" && whereClause.includes("REPLACE(LOWER")) {
            let pTarget = null;
            let checkList = params;

            if (/platform = \?/i.test(whereClause)) {
                pTarget = String(params[0] || "").toLowerCase();
                checkList = params.slice(1);
            }

            if (pTarget && String(row.platform || "").toLowerCase() !== pTarget) {
                return false;
            }

            const cleanUid = String(row.platform_user_id || "").toLowerCase().replace(/@/g, "").trim();
            const cleanUser = String(row.username || "").toLowerCase().replace(/@/g, "").trim();
            const cleanDisplay = String(row.display_name || "").toLowerCase().replace(/@/g, "").trim();

            for (const param of checkList) {
                const target = String(param || "").toLowerCase().replace(/@/g, "").trim();
                if (!target) continue;
                if (cleanUid === target || cleanUser === target || cleanDisplay === target) {
                    return true;
                }
            }
            return false;
        }

        // 4. points > 0
        if (/points > 0/i.test(whereClause)) {
            return Number(row.points || 0) > 0;
        }

        // 5. UPDATE point_transactions SET user_id = ? WHERE user_id = ?
        if (/^user_id = \?$/i.test(whereClause) && params.length >= 1) {
            return Number(row.user_id) === Number(params[params.length - 1]);
        }

        // 6. LIKE queries (e.g. dummy cleanups)
        if (whereClause.includes("LIKE")) {
            return true;
        }

        return true;
    }
}

module.exports = {
    FallbackDatabaseSync,
    FallbackStatement
};
