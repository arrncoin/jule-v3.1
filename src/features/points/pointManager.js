// src/features/points/pointManager.js
// Centralized Persistent Interaction Points & Leaderboard Manager
const EventEmitter = require("events");
const db = require("../../data/database");
const pointRules = require("./pointRules");
const eventBus = require("../../core/events/eventBus");

class PointManager extends EventEmitter {
    constructor() {
        super();
        this.cooldowns = new Map();
    }

    normalizeUser(userInput) {
        if (!userInput) return null;

        if (typeof userInput === "string") {
            const trimmed = userInput.replace(/^@/, "").trim();
            if (!trimmed) return null;
            return {
                platform: "youtube",
                platformUserId: trimmed,
                username: trimmed,
                displayName: trimmed
            };
        }

        let platform = (userInput.platform || "").toLowerCase();
        let author = userInput.author || userInput;

        let platformUserId =
            author.channelId ||
            author.uniqueId ||
            author.platform_user_id ||
            author.platformUserId ||
            author.id ||
            author.name ||
            author.username;

        let username =
            author.name ||
            author.username ||
            author.nickname ||
            author.uniqueId ||
            String(platformUserId || "Unknown");

        let displayName =
            author.displayName ||
            author.display_name ||
            author.nickname ||
            username;

        if (!platform) {
            if (author.channelId) {
                platform = "youtube";
            } else if (author.uniqueId) {
                platform = "tiktok";
            } else {
                platform = "youtube";
            }
        }

        if (!platformUserId) return null;

        const lowId = String(platformUserId).trim().toLowerCase();
        if (lowId === "pengguna tiktok" || lowId === "penguna tiktok" || lowId === "unknown" || lowId === "0") {
            return null;
        }

        return {
            platform: String(platform).trim().toLowerCase(),
            platformUserId: String(platformUserId).trim(),
            username: String(username).trim(),
            displayName: String(displayName).trim()
        };
    }

    canReceivePoints(user, source = "chat") {
        const normalized = this.normalizeUser(user);
        if (!normalized) return false;

        const cooldownTime = pointRules.COOLDOWNS_MS[source.toLowerCase()];
        if (!cooldownTime || cooldownTime <= 0) {
            return true;
        }

        const key = `${normalized.platform}:${normalized.platformUserId}:${source.toLowerCase()}`;
        const lastTime = this.cooldowns.get(key) || 0;
        const now = Date.now();

        if (now - lastTime < cooldownTime) {
            return false;
        }

        return true;
    }

    recordCooldown(normalizedUser, source) {
        if (!normalizedUser || !source) return;
        const key = `${normalizedUser.platform}:${normalizedUser.platformUserId}:${source.toLowerCase()}`;
        this.cooldowns.set(key, Date.now());

        if (this.cooldowns.size > 20000) {
            const now = Date.now();
            for (const [k, time] of this.cooldowns.entries()) {
                if (now - time > 60000) {
                    this.cooldowns.delete(k);
                }
            }
        }
    }

    addPoints(user, amount, source = "manual", description = "", eventId = null) {
        try {
            const numAmount = Number(amount);
            if (!Number.isFinite(numAmount) || isNaN(numAmount)) {
                console.warn(`⚠️ [POINTS] Invalid amount ignored: ${amount}`);
                return null;
            }

            if (numAmount <= 0) {
                console.warn(`⚠️ [POINTS] Non-positive points ignored for standard event: ${numAmount}`);
                return null;
            }

            const normalized = this.normalizeUser(user);
            if (!normalized || !normalized.platformUserId) {
                console.warn("⚠️ [POINTS] addPoints gagal: user atau platformUserId kosong.");
                return null;
            }

            if (eventId && db.isEventProcessed(eventId)) {
                console.log(`ℹ️ [POINTS] Event ${eventId} sudah pernah diproses, diabaikan.`);
                return null;
            }

            const dbUser = db.upsertUser(
                normalized.platform,
                normalized.platformUserId,
                normalized.username,
                normalized.displayName
            );

            if (!dbUser) {
                console.error("❌ [POINTS ERROR] Gagal upsert user ke database.");
                return null;
            }

            const oldPoints = dbUser.points || 0;
            const newTotalPoints = oldPoints + numAmount;
            const oldLevel = dbUser.level || 1;
            const newLevel = pointRules.calculateLevel(newTotalPoints);

            const updated = db.applyPoints(
                dbUser.id,
                numAmount,
                source,
                description,
                eventId
            );

            if (!updated) {
                console.error("❌ [POINTS ERROR] Gagal mencatat transaksi poin ke database.");
                return null;
            }

            this.recordCooldown(normalized, source);

            console.log(`[POINTS] ${normalized.username} +${numAmount} | source=${source} | total=${newTotalPoints}`);

            const currentRank = db.getUserRank(newTotalPoints);
            const isImportant =
                numAmount >= (pointRules.NOTIFICATION.MIN_POINTS_THRESHOLD || 3) ||
                (pointRules.NOTIFICATION.IMPORTANT_SOURCES || []).includes(source.toLowerCase());

            const eventPayload = {
                id: updated.id,
                user: {
                    id: updated.id,
                    platform: updated.platform,
                    platformUserId: updated.platform_user_id,
                    username: updated.username,
                    displayName: updated.display_name
                },
                amount: numAmount,
                source,
                description,
                points: newTotalPoints,
                totalPoints: newTotalPoints,
                level: newLevel,
                oldLevel,
                rank: currentRank,
                isImportant,
                timestamp: Date.now()
            };

            this.emit("point_added", eventPayload);
            eventBus.emit("point_added", eventPayload);

            if (newLevel > oldLevel) {
                console.log(`⭐ [LEVEL UP] ${normalized.username} naik ke Level ${newLevel}!`);
                this.emit("level_up", {
                    ...eventPayload,
                    level: newLevel,
                    oldLevel
                });
                eventBus.emit("level_up", {
                    ...eventPayload,
                    level: newLevel,
                    oldLevel
                });
            }

            return eventPayload;
        } catch (err) {
            console.error("❌ [POINTS ERROR] Error pada addPoints:", err.message);
            return null;
        }
    }

    getPoints(user) {
        try {
            const normalized = this.normalizeUser(user);
            if (!normalized) return { points: 0, level: 1, rank: 1 };

            let found = db.findUser(normalized.platform, normalized.platformUserId, normalized.username);
            if (!found) {
                found = db.upsertUser(normalized.platform, normalized.platformUserId, normalized.username, normalized.displayName);
            }

            if (!found) {
                return {
                    points: 0,
                    level: 1,
                    rank: db.getUserRank(0),
                    username: normalized.username,
                    displayName: normalized.displayName,
                    platform: normalized.platform
                };
            }

            const rank = db.getUserRank(found.points);
            return {
                id: found.id,
                platform: found.platform,
                platformUserId: found.platform_user_id,
                username: found.username,
                displayName: found.display_name || found.username,
                points: found.points,
                level: found.level,
                rank
            };
        } catch (err) {
            console.error("❌ [POINTS ERROR] Error pada getPoints:", err.message);
            return { points: 0, level: 1, rank: 1 };
        }
    }

    getUserRank(points) {
        return db.getUserRank(points);
    }

    getLeaderboard(limit = 10) {
        return db.getLeaderboard(limit);
    }

    getUserTransactions(userId, limit = 20) {
        return db.getUserTransactions(userId, limit);
    }
}

const pointManager = new PointManager();
module.exports = pointManager;
