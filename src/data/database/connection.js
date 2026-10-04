// src/data/database/connection.js
// SQLite database connection and initialization with Electron / Node < 22 safe fallback
const path = require("path");
const fs = require("fs");
const { getWritablePath, getAppRootPath } = require("../../core/utils/paths");

let DatabaseSyncClass = null;
try {
    const sqliteMod = require("node:sqlite");
    if (sqliteMod && typeof sqliteMod.DatabaseSync === "function") {
        DatabaseSyncClass = sqliteMod.DatabaseSync;
    }
} catch (_) {
    // node:sqlite is not available in Electron runtime / Node < 22.5
}

if (!DatabaseSyncClass) {
    const { FallbackDatabaseSync } = require("./fallbackDb");
    DatabaseSyncClass = FallbackDatabaseSync;
}

let dbInstance = null;
let dbFilePath = null;

function resolveDatabasePath() {
    if (process.env.SQLITE_DB_PATH) {
        return process.env.SQLITE_DB_PATH;
    }

    const writableDb = getWritablePath(path.join("data", "jule.db"));
    const localDb = getAppRootPath(path.join("data", "jule.db"));

    if (fs.existsSync(writableDb)) {
        return writableDb;
    }
    if (fs.existsSync(localDb)) {
        return localDb;
    }

    return localDb;
}

function getConnection() {
    if (dbInstance) return dbInstance;

    try {
        dbFilePath = resolveDatabasePath();
        const dir = path.dirname(dbFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        dbInstance = new DatabaseSyncClass(dbFilePath);

        // Optimasi performa dan integritas database SQLite
        dbInstance.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                platform_user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                display_name TEXT,
                points INTEGER NOT NULL DEFAULT 0,
                level INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(platform, platform_user_id)
            );

            CREATE TABLE IF NOT EXISTS point_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                points INTEGER NOT NULL,
                source TEXT NOT NULL,
                description TEXT,
                event_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

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

            CREATE TABLE IF NOT EXISTS siapa_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_players INTEGER NOT NULL,
                total_rounds INTEGER NOT NULL,
                winner_username TEXT,
                runner_up_username TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_users_platform_user ON users(platform, platform_user_id);
            CREATE INDEX IF NOT EXISTS idx_users_points ON users(points DESC);
            CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON point_transactions(user_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_event_id ON point_transactions(event_id);
        `);

        const isFallback = DatabaseSyncClass && DatabaseSyncClass.name === "FallbackDatabaseSync";
        if (isFallback) {
            console.log(`🗄️ [DATABASE] Storage siap (Electron/Node fallback): ${path.relative(process.cwd(), dbFilePath) || dbFilePath}`);
        } else {
            console.log(`🗄️ [DATABASE] SQLite siap: ${path.relative(process.cwd(), dbFilePath) || dbFilePath}`);
        }
    } catch (err) {
        console.error("❌ [DATABASE ERROR] Gagal inisialisasi SQLite database:", err.message);
    }

    return dbInstance;
}

module.exports = {
    getConnection,
    getDbPath: () => dbFilePath
};
