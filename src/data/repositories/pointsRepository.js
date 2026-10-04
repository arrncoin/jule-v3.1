// src/data/repositories/pointsRepository.js
// Repository for point transactions and leaderboards
const { getConnection } = require("../database/connection");

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

class PointsRepository {
    get db() {
        return getConnection();
    }

    isEventProcessed(eventId) {
        try {
            if (!this.db || !eventId) return false;
            const stmt = this.db.prepare(`SELECT id FROM point_transactions WHERE event_id = ? LIMIT 1`);
            const row = stmt.get(eventId);
            return Boolean(row);
        } catch (err) {
            console.error("❌ [DATABASE ERROR] isEventProcessed error:", err.message);
            return false;
        }
    }

    applyPoints(userId, amount, source, description, eventId = null) {
        try {
            if (!this.db) return null;
            const now = new Date().toISOString();
            const numAmount = Number(amount);

            const getUserStmt = this.db.prepare(`SELECT * FROM users WHERE id = ?`);
            const user = getUserStmt.get(Number(userId));
            if (!user) {
                console.error(`❌ [DATABASE ERROR] User ID ${userId} tidak ditemukan.`);
                return null;
            }

            const newPoints = user.points + numAmount;
            const newLevel = calculateLevel(newPoints);

            const txStmt = this.db.prepare(`
                INSERT INTO point_transactions (user_id, points, source, description, event_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            txStmt.run(userId, numAmount, source, description || "", eventId, now);

            const updateUserStmt = this.db.prepare(`
                UPDATE users 
                SET points = ?, level = ?, updated_at = ?
                WHERE id = ?
            `);
            updateUserStmt.run(newPoints, newLevel, now, userId);

            return {
                ...user,
                points: newPoints,
                level: newLevel,
                updated_at: now
            };
        } catch (err) {
            console.error("❌ [DATABASE ERROR] applyPoints error:", err.message);
            return null;
        }
    }

    getLeaderboard(limit = 10) {
        try {
            if (!this.db) return [];
            const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
            const stmt = this.db.prepare(`
                SELECT id, platform, platform_user_id, username, display_name, points, level
                FROM users
                WHERE points > 0
                ORDER BY points DESC, updated_at DESC
                LIMIT ?
            `);
            const rows = stmt.all(safeLimit);
            return rows.map((r, idx) => ({
                rank: idx + 1,
                id: r.id,
                platform: r.platform,
                platform_user_id: r.platform_user_id,
                username: r.username,
                displayName: r.display_name || r.username,
                points: r.points,
                level: r.level
            }));
        } catch (err) {
            console.error("❌ [DATABASE ERROR] getLeaderboard error:", err.message);
            return [];
        }
    }

    getUserTransactions(userId, limit = 20) {
        try {
            if (!this.db) return [];
            const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
            const stmt = this.db.prepare(`
                SELECT id, points, source, description, event_id, created_at
                FROM point_transactions
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT ?
            `);
            return stmt.all(Number(userId), safeLimit);
        } catch (err) {
            console.error("❌ [DATABASE ERROR] getUserTransactions error:", err.message);
            return [];
        }
    }
}

module.exports = new PointsRepository();
