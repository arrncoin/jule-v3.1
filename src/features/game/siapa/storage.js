// games/siapa/storage.js
// Persistent Storage & Statistics for SIAPA Survival Game
// Uses SQLite with fallback to atomic JSON persistence
const fs = require("fs");
const path = require("path");
const dbInstance = require("../../../data/database");
const { getWritablePath } = require("../../../core/utils/paths");

const DATA_DIR = getWritablePath("data");
const BACKUP_JSON_PATH = path.join(DATA_DIR, "siapa_stats.json");

class SiapaStorage {
    constructor() {
        this.db = dbInstance ? dbInstance.db : null;
        this.memoryStore = new Map(); // Fallback map if SQLite is not available
        this.init();
    }

    init() {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }

            // Inisialisasi SQLite jika db tersedia
            if (this.db) {
                this.db.exec(`
                    CREATE TABLE IF NOT EXISTS siapa_players (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                        display_name TEXT,
                        total_points INTEGER NOT NULL DEFAULT 0,
                        games_played INTEGER NOT NULL DEFAULT 0,
                        wins INTEGER NOT NULL DEFAULT 0,
                        top3 INTEGER NOT NULL DEFAULT 0,
                        best_rank INTEGER NOT NULL DEFAULT 999999,
                        total_survival_rounds INTEGER NOT NULL DEFAULT 0,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_siapa_points ON siapa_players(total_points DESC);
                    CREATE INDEX IF NOT EXISTS idx_siapa_wins ON siapa_players(wins DESC);

                    CREATE TABLE IF NOT EXISTS siapa_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        total_players INTEGER NOT NULL,
                        total_rounds INTEGER NOT NULL,
                        winner_username TEXT,
                        runner_up_username TEXT,
                        created_at TEXT NOT NULL
                    );
                `);
            }

            // Muat data backup JSON jika ada
            this.loadBackup();
        } catch (err) {
            console.error("⚠️ [SIAPA STORAGE] Init warning:", err.message);
        }
    }

    loadBackup() {
        try {
            if (fs.existsSync(BACKUP_JSON_PATH)) {
                const raw = fs.readFileSync(BACKUP_JSON_PATH, "utf8");
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        if (item && item.username) {
                            this.memoryStore.set(item.username.toLowerCase(), item);
                        }
                    }
                }
            }
        } catch (_) {}
    }

    saveBackup() {
        try {
            // Ambil semua dari DB atau memoryStore dan simpan ke JSON
            const all = this.getAllPlayers();
            fs.writeFileSync(BACKUP_JSON_PATH, JSON.stringify(all, null, 2), "utf8");
        } catch (_) {}
    }

    /**
     * Ambil data statistik satu pemain
     * @param {string} rawUsername
     */
    getPlayerStats(rawUsername) {
        if (!rawUsername) return null;
        const cleanName = String(rawUsername).replace(/^@/, "").trim();
        const lowerName = cleanName.toLowerCase();

        if (this.db) {
            try {
                const stmt = this.db.prepare(`
                    SELECT * FROM siapa_players WHERE LOWER(username) = ? LIMIT 1
                `);
                const row = stmt.get(lowerName);
                if (row) {
                    return {
                        username: row.username,
                        displayName: row.display_name || row.username,
                        totalPoints: row.total_points,
                        gamesPlayed: row.games_played,
                        wins: row.wins,
                        top3: row.top3,
                        bestRank: row.best_rank === 999999 ? "-" : row.best_rank,
                        totalSurvivalRounds: row.total_survival_rounds
                    };
                }
            } catch (err) {
                console.error("⚠️ [SIAPA STORAGE] Error getPlayerStats SQLite:", err.message);
            }
        }

        const mem = this.memoryStore.get(lowerName);
        if (mem) {
            return {
                username: mem.username,
                displayName: mem.displayName || mem.username,
                totalPoints: mem.totalPoints || 0,
                gamesPlayed: mem.gamesPlayed || 0,
                wins: mem.wins || 0,
                top3: mem.top3 || 0,
                bestRank: mem.bestRank === 999999 ? "-" : mem.bestRank,
                totalSurvivalRounds: mem.totalSurvivalRounds || 0
            };
        }

        return {
            username: cleanName,
            displayName: cleanName,
            totalPoints: 0,
            gamesPlayed: 0,
            wins: 0,
            top3: 0,
            bestRank: "-",
            totalSurvivalRounds: 0
        };
    }

    /**
     * Pastikan user terdaftar di database
     * @param {string} rawUsername
     * @param {string} [displayName]
     */
    ensurePlayer(rawUsername, displayName) {
        if (!rawUsername) return;
        const cleanName = String(rawUsername).replace(/^@/, "").trim();
        const lowerName = cleanName.toLowerCase();
        const display = displayName || cleanName;
        const now = new Date().toISOString();

        if (this.db) {
            try {
                const checkStmt = this.db.prepare(`SELECT id FROM siapa_players WHERE LOWER(username) = ?`);
                const exists = checkStmt.get(lowerName);
                if (!exists) {
                    const insertStmt = this.db.prepare(`
                        INSERT INTO siapa_players (username, display_name, total_points, games_played, wins, top3, best_rank, total_survival_rounds, created_at, updated_at)
                        VALUES (?, ?, 0, 0, 0, 0, 999999, 0, ?, ?)
                    `);
                    insertStmt.run(cleanName, display, now, now);
                }
            } catch (err) {
                console.error("⚠️ [SIAPA STORAGE] ensurePlayer error:", err.message);
            }
        }

        if (!this.memoryStore.has(lowerName)) {
            this.memoryStore.set(lowerName, {
                username: cleanName,
                displayName: display,
                totalPoints: 0,
                gamesPlayed: 0,
                wins: 0,
                top3: 0,
                bestRank: 999999,
                totalSurvivalRounds: 0,
                createdAt: now,
                updatedAt: now
            });
        }
    }

    /**
     * Tambah poin pemain secara persisten
     * @param {string} rawUsername
     * @param {number} points
     */
    addPoints(rawUsername, points) {
        const pts = Number(points) || 0;
        if (!rawUsername || pts <= 0) return;
        const cleanName = String(rawUsername).replace(/^@/, "").trim();
        const lowerName = cleanName.toLowerCase();
        const now = new Date().toISOString();

        this.ensurePlayer(cleanName);

        if (this.db) {
            try {
                const stmt = this.db.prepare(`
                    UPDATE siapa_players
                    SET total_points = total_points + ?, updated_at = ?
                    WHERE LOWER(username) = ?
                `);
                stmt.run(pts, now, lowerName);
            } catch (err) {
                console.error("⚠️ [SIAPA STORAGE] addPoints error:", err.message);
            }
        }

        const mem = this.memoryStore.get(lowerName);
        if (mem) {
            mem.totalPoints = (mem.totalPoints || 0) + pts;
            mem.updatedAt = now;
        }
        this.saveBackup();
    }

    /**
     * Catat hasil akhir game SIAPA untuk seluruh partisipan
     * @param {Object} gameSummary
     */
    recordGameResult(gameSummary) {
        if (!gameSummary || !Array.isArray(gameSummary.players)) return;
        const now = new Date().toISOString();
        const totalRounds = gameSummary.totalRounds || 1;

        for (const p of gameSummary.players) {
            const cleanName = String(p.username).replace(/^@/, "").trim();
            const lowerName = cleanName.toLowerCase();
            this.ensurePlayer(cleanName);

            const isWin = p.rank === 1 ? 1 : 0;
            const isTop3 = p.rank <= 3 ? 1 : 0;
            const roundsSurvived = p.round || 0;
            const finalRank = p.rank || 999999;
            const awardedPoints = p.points || 0;

            if (this.db) {
                try {
                    const stmt = this.db.prepare(`
                        UPDATE siapa_players
                        SET total_points = total_points + ?,
                            games_played = games_played + 1,
                            wins = wins + ?,
                            top3 = top3 + ?,
                            best_rank = MIN(best_rank, ?),
                            total_survival_rounds = total_survival_rounds + ?,
                            updated_at = ?
                        WHERE LOWER(username) = ?
                    `);
                    stmt.run(awardedPoints, isWin, isTop3, finalRank, roundsSurvived, now, lowerName);
                } catch (err) {
                    console.error("⚠️ [SIAPA STORAGE] recordGameResult SQLite error:", err.message);
                }
            }

            const mem = this.memoryStore.get(lowerName);
            if (mem) {
                mem.totalPoints = (mem.totalPoints || 0) + awardedPoints;
                mem.gamesPlayed = (mem.gamesPlayed || 0) + 1;
                mem.wins = (mem.wins || 0) + isWin;
                mem.top3 = (mem.top3 || 0) + isTop3;
                mem.bestRank = Math.min(mem.bestRank || 999999, finalRank);
                mem.totalSurvivalRounds = (mem.totalSurvivalRounds || 0) + roundsSurvived;
                mem.updatedAt = now;
            }
        }

        // Catat ke riwayat
        if (this.db) {
            try {
                const histStmt = this.db.prepare(`
                    INSERT INTO siapa_history (total_players, total_rounds, winner_username, runner_up_username, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `);
                histStmt.run(
                    gameSummary.players.length,
                    totalRounds,
                    gameSummary.winner ? gameSummary.winner.username : null,
                    gameSummary.runnerUp ? gameSummary.runnerUp.username : null,
                    now
                );
            } catch (_) {}
        }

        this.saveBackup();
    }

    /**
     * Ambil Leaderboard teratas khusus game SIAPA
     * @param {number} limit
     * @param {"total_points"|"wins"|"total_survival_rounds"} sortBy
     */
    getLeaderboard(limit = 10, sortBy = "total_points") {
        const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
        let validSort = "total_points";
        if (sortBy === "wins") validSort = "wins";
        if (sortBy === "total_survival_rounds") validSort = "total_survival_rounds";

        if (this.db) {
            try {
                const stmt = this.db.prepare(`
                    SELECT username, display_name, total_points, games_played, wins, top3, best_rank, total_survival_rounds
                    FROM siapa_players
                    WHERE total_points > 0 OR wins > 0 OR games_played > 0
                    ORDER BY ${validSort} DESC, wins DESC, best_rank ASC
                    LIMIT ?
                `);
                const rows = stmt.all(safeLimit);
                return rows.map((r, i) => ({
                    rank: i + 1,
                    username: r.username,
                    displayName: r.display_name || r.username,
                    totalPoints: r.total_points,
                    gamesPlayed: r.games_played,
                    wins: r.wins,
                    top3: r.top3,
                    bestRank: r.best_rank === 999999 ? "-" : r.best_rank,
                    totalSurvivalRounds: r.total_survival_rounds
                }));
            } catch (err) {
                console.error("⚠️ [SIAPA STORAGE] getLeaderboard error:", err.message);
            }
        }

        // Fallback memory
        const list = Array.from(this.memoryStore.values());
        list.sort((a, b) => (b[validSort] || 0) - (a[validSort] || 0));
        return list.slice(0, safeLimit).map((r, i) => ({
            rank: i + 1,
            username: r.username,
            displayName: r.displayName || r.username,
            totalPoints: r.totalPoints || 0,
            gamesPlayed: r.gamesPlayed || 0,
            wins: r.wins || 0,
            top3: r.top3 || 0,
            bestRank: r.bestRank === 999999 ? "-" : r.bestRank,
            totalSurvivalRounds: r.totalSurvivalRounds || 0
        }));
    }

    getAllPlayers() {
        if (this.db) {
            try {
                const stmt = this.db.prepare(`SELECT * FROM siapa_players`);
                return stmt.all();
            } catch (_) {}
        }
        return Array.from(this.memoryStore.values());
    }
}

module.exports = new SiapaStorage();
