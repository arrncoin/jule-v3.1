// src/data/repositories/userRepository.js
// Repository for user records and historical sync
const path = require("path");
const fs = require("fs");
const { getConnection } = require("../database/connection");
const { getAppRootPath, getWritablePath } = require("../../core/utils/paths");

function calculateLevel(pts) {
    if (pts >= 60000) return 20;
    if (pts >= 35000) return 15;
    if (pts >= 23000) return 12;
    if (pts >= 17000) return 11;
    if (pts >= 12000) return 10;
    if (pts >= 8000) return 9;
    if (pts >= 5500) return 8;
    if (pts >= 3500) return 7;
    if (pts >= 2000) return 6;
    if (pts >= 1000) return 5;
    if (pts >= 500) return 4;
    if (pts >= 250) return 3;
    if (pts >= 100) return 2;
    return 1;
}

class UserRepository {
    get db() {
        return getConnection();
    }

    findExactUser(platform, platformUserId) {
        try {
            if (!this.db || !platformUserId) return null;
            const stmt = this.db.prepare(`
                SELECT * FROM users 
                WHERE platform = ? AND platform_user_id = ?
                LIMIT 1
            `);
            const row = stmt.get(platform, String(platformUserId).trim());
            return row || null;
        } catch (err) {
            console.error("❌ [DATABASE ERROR] findExactUser error:", err.message);
            return null;
        }
    }

    findUser(platform, platformUserId, username = null) {
        try {
            if (!this.db || (!platformUserId && !username)) return null;
            const rawUid = String(platformUserId || "").trim();
            const rawUsername = String(username || rawUid).trim();
            const cleanNoAtUid = rawUid.replace(/^@+/, "").trim();
            const cleanNoAtUser = rawUsername.replace(/^@+/, "").trim();
            const targetPlatform = platform ? String(platform).trim().toLowerCase() : null;

            // 1. Coba match pada platform yang sama jika platform ditentukan
            if (targetPlatform) {
                const stmtPlatform = this.db.prepare(`
                    SELECT * FROM users 
                    WHERE platform = ? AND (
                        REPLACE(LOWER(platform_user_id), '@', '') = LOWER(?)
                        OR REPLACE(LOWER(platform_user_id), '@', '') = LOWER(?)
                        OR REPLACE(LOWER(username), '@', '') = LOWER(?)
                        OR REPLACE(LOWER(username), '@', '') = LOWER(?)
                        OR REPLACE(LOWER(display_name), '@', '') = LOWER(?)
                        OR REPLACE(LOWER(display_name), '@', '') = LOWER(?)
                    )
                    ORDER BY points DESC
                    LIMIT 1
                `);
                const row = stmtPlatform.get(targetPlatform, cleanNoAtUid, cleanNoAtUser, cleanNoAtUid, cleanNoAtUser, cleanNoAtUid, cleanNoAtUser);
                if (row) return row;
                return null;
            }

            // 2. Fallback: pencarian lintas platform HANYA jika platform tidak dispesifikasikan
            const stmtCross = this.db.prepare(`
                SELECT * FROM users 
                WHERE (
                    REPLACE(LOWER(platform_user_id), '@', '') = LOWER(?)
                    OR REPLACE(LOWER(platform_user_id), '@', '') = LOWER(?)
                    OR REPLACE(LOWER(username), '@', '') = LOWER(?)
                    OR REPLACE(LOWER(username), '@', '') = LOWER(?)
                    OR REPLACE(LOWER(display_name), '@', '') = LOWER(?)
                    OR REPLACE(LOWER(display_name), '@', '') = LOWER(?)
                )
                ORDER BY points DESC
                LIMIT 1
            `);
            const row = stmtCross.get(cleanNoAtUid, cleanNoAtUser, cleanNoAtUid, cleanNoAtUser, cleanNoAtUid, cleanNoAtUser);
            if (row) return row;

            return null;
        } catch (err) {
            console.error("❌ [DATABASE ERROR] findUser error:", err.message);
            return null;
        }
    }

    findUserById(id) {
        try {
            if (!this.db) return null;
            const stmt = this.db.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`);
            const row = stmt.get(Number(id));
            return row || null;
        } catch (err) {
            console.error("❌ [DATABASE ERROR] findUserById error:", err.message);
            return null;
        }
    }

    upsertUser(platform, platformUserId, username, displayName) {
        try {
            if (!this.db) return null;
            const now = new Date().toISOString();
            const rawUid = String(platformUserId || username || "anonymous").trim();
            const cleanUid = rawUid.replace(/^@+/, "").trim() || rawUid;
            const rawUsername = String(username || cleanUid).trim();
            const cleanUsername = rawUsername.replace(/^@+/, "").trim();
            const cleanDisplayName = displayName ? String(displayName).replace(/^@+/, "").trim() : cleanUsername;
            const targetPlatform = platform || "youtube";

            // 1. Cek user eksisting pada platform yang sama
            let existing = this.findUser(targetPlatform, rawUid, rawUsername);

            if (existing) {
                if (cleanUid !== cleanUsername && (existing.platform_user_id === existing.username || existing.platform_user_id === cleanUsername)) {
                    try {
                        const updateUidStmt = this.db.prepare(`UPDATE users SET platform_user_id = ?, updated_at = ? WHERE id = ?`);
                        updateUidStmt.run(rawUid, now, existing.id);
                        existing.platform_user_id = rawUid;
                    } catch (_) {}
                }

                if (cleanUsername && (existing.username !== cleanUsername || existing.display_name !== cleanDisplayName)) {
                    try {
                        const updateStmt = this.db.prepare(`
                            UPDATE users 
                            SET username = ?, display_name = ?, updated_at = ?
                            WHERE id = ?
                        `);
                        updateStmt.run(cleanUsername, cleanDisplayName, now, existing.id);
                        existing.username = cleanUsername;
                        existing.display_name = cleanDisplayName;
                    } catch (_) {}
                }
                return existing;
            }

            // 2. Buat user baru
            const insertStmt = this.db.prepare(`
                INSERT INTO users (platform, platform_user_id, username, display_name, points, level, created_at, updated_at)
                VALUES (?, ?, ?, ?, 0, 1, ?, ?)
            `);
            const info = insertStmt.run(targetPlatform, rawUid, cleanUsername, cleanDisplayName, now, now);
            return this.findUserById(info.lastInsertRowid);
        } catch (err) {
            console.error("❌ [DATABASE ERROR] upsertUser error:", err.message);
            return null;
        }
    }

    getUserRank(points = 0) {
        try {
            if (!this.db) return 1;
            const stmt = this.db.prepare(`SELECT COUNT(*) as rank_count FROM users WHERE points > ?`);
            const result = stmt.get(Number(points || 0));
            return (result?.rank_count || 0) + 1;
        } catch (err) {
            console.error("❌ [DATABASE ERROR] getUserRank error:", err.message);
            return 1;
        }
    }

    deduplicateAndMigrate() {
        if (!this.db) return;
        try {
            const findDuplicates = this.db.prepare(`
                SELECT platform, LOWER(username) as lower_name, COUNT(*) as cnt
                FROM users
                GROUP BY platform, LOWER(username)
                HAVING cnt > 1
            `);
            const dupes = findDuplicates.all();

            for (const item of dupes) {
                const getRows = this.db.prepare(`
                    SELECT * FROM users
                    WHERE platform = ? AND LOWER(username) = ?
                    ORDER BY 
                        CASE WHEN platform_user_id != username AND LENGTH(platform_user_id) > 10 THEN 1 ELSE 0 END DESC,
                        points DESC,
                        id ASC
                `);
                const rows = getRows.all(item.platform, item.lower_name);
                if (rows.length <= 1) continue;

                const primary = rows[0];
                let totalPoints = primary.points;

                for (let i = 1; i < rows.length; i++) {
                    const secondary = rows[i];
                    totalPoints += secondary.points;

                    try {
                        const moveTx = this.db.prepare(`UPDATE point_transactions SET user_id = ? WHERE user_id = ?`);
                        moveTx.run(primary.id, secondary.id);
                    } catch (_) {}

                    try {
                        const delRow = this.db.prepare(`DELETE FROM users WHERE id = ?`);
                        delRow.run(secondary.id);
                    } catch (_) {}
                }

                const updatePrimary = this.db.prepare(`UPDATE users SET points = ?, level = ?, updated_at = ? WHERE id = ?`);
                updatePrimary.run(totalPoints, calculateLevel(totalPoints), new Date().toISOString(), primary.id);
            }
        } catch (err) {
            console.warn("⚠️ [DATABASE] Gagal deduplikasi user lama:", err.message);
        }
    }

    syncHistoricalData() {
        if (!this.db) return;
        try {
            const now = new Date().toISOString();
            let syncedUsersCount = 0;
            let totalAddedPoints = 0;

            const memoryPaths = [
                getAppRootPath("core/memory.json"),
                getAppRootPath("memory.json"),
                getWritablePath("core/memory.json"),
                getWritablePath("memory.json")
            ];

            let memoryData = null;
            for (const p of memoryPaths) {
                if (fs.existsSync(p)) {
                    try {
                        const raw = fs.readFileSync(p, "utf8");
                        memoryData = JSON.parse(raw);
                        break;
                    } catch (_) {}
                }
            }

            if (memoryData && typeof memoryData === "object") {
                const upsertHistorical = this.db.prepare(`
                    INSERT INTO users (platform, platform_user_id, username, display_name, points, level, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(platform, platform_user_id) DO UPDATE SET
                        points = CASE WHEN users.points < excluded.points THEN excluded.points ELSE users.points END,
                        level = CASE WHEN users.points < excluded.points THEN excluded.level ELSE users.level END,
                        display_name = COALESCE(excluded.display_name, users.display_name),
                        updated_at = excluded.updated_at
                `);

                const insertTx = this.db.prepare(`
                    INSERT INTO point_transactions (user_id, points, source, description, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `);

                for (const [rawKey, history] of Object.entries(memoryData)) {
                    const rawName = String(rawKey || "").trim();
                    const cleanUsername = rawName.replace(/^@+/, "").trim();
                    if (!cleanUsername) continue;

                    const interactions = Array.isArray(history) ? history.length : 1;
                    const isStreamerHost = cleanUsername.toLowerCase() === "kridopratomo";
                    const targetPoints = isStreamerHost 
                        ? Math.max(50, interactions * 5) 
                        : Math.max(1, interactions);
                    const targetLevel = calculateLevel(targetPoints);

                    try {
                        const platform = "youtube";
                        const uid = isStreamerHost ? "UC_krido_123" : cleanUsername;

                        upsertHistorical.run(
                            platform,
                            uid,
                            cleanUsername,
                            cleanUsername,
                            targetPoints,
                            targetLevel,
                            now,
                            now
                        );

                        const userRow = this.findUser(platform, uid, cleanUsername);
                        if (userRow && targetPoints > 0) {
                            const checkTx = this.db.prepare(`SELECT id FROM point_transactions WHERE user_id = ? LIMIT 1`);
                            if (!checkTx.get(userRow.id)) {
                                insertTx.run(
                                    userRow.id,
                                    targetPoints,
                                    "historical_sync",
                                    `Akumulasi interaksi live chat (${interactions} interaksi)`,
                                    now
                                );
                            }
                        }

                        syncedUsersCount++;
                        totalAddedPoints += targetPoints;
                    } catch (_) {}
                }
            }

            if (syncedUsersCount > 0) {
                console.log(`✨ [DATABASE] Sinkronisasi interaksi historis: ${syncedUsersCount} penonton aktif disinkronkan (+${totalAddedPoints} poin total).`);
            }
        } catch (err) {
            console.warn("⚠️ [DATABASE] Gagal sinkronisasi data historis:", err.message);
        }
    }
}

module.exports = new UserRepository();
