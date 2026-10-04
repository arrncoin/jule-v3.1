// core/points/pointManager.js
// Centralized Persistent Interaction Points & Leaderboard Manager
const EventEmitter = require("events");
const db = require("../db/database");
const pointRules = require("./pointRules");

class PointManager extends EventEmitter {
    constructor() {
        super();
        // Cooldown memory store: key = `${platform}:${platformUserId}:${source}` -> timestamp (ms)
        this.cooldowns = new Map();
    }

    /**
     * Normalisasi input user menjadi format standar { platform, platformUserId, username, displayName }
     */
    normalizeUser(userInput) {
        if (!userInput) return null;

        // Jika input berupa string username biasa
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

        // Jika input adalah object (misal chatItem, author, atau parsed user)
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
                platform = "youtube"; // Default platform
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

    /**
     * Pengecekan Anti-Spam / Cooldown berdasarkan user dan source
     * @param {string|object} user 
     * @param {string} source 
     * @returns {boolean}
     */
    canReceivePoints(user, source = "chat") {
        const normalized = this.normalizeUser(user);
        if (!normalized) return false;

        const cooldownTime = pointRules.COOLDOWNS_MS[source.toLowerCase()];
        if (!cooldownTime || cooldownTime <= 0) {
            return true; // Sumber poin tidak memiliki batasan cooldown
        }

        const key = `${normalized.platform}:${normalized.platformUserId}:${source.toLowerCase()}`;
        const lastTime = this.cooldowns.get(key) || 0;
        const now = Date.now();

        if (now - lastTime < cooldownTime) {
            return false; // Sedang cooldown
        }

        return true;
    }

    /**
     * Catat timestamp pemakaian cooldown
     */
    recordCooldown(normalizedUser, source) {
        if (!normalizedUser || !source) return;
        const key = `${normalizedUser.platform}:${normalizedUser.platformUserId}:${source.toLowerCase()}`;
        this.cooldowns.set(key, Date.now());

        // Bersihkan memori setiap kali ukuran map terlalu besar
        if (this.cooldowns.size > 20000) {
            const now = Date.now();
            for (const [k, time] of this.cooldowns.entries()) {
                if (now - time > 60000) {
                    this.cooldowns.delete(k);
                }
            }
        }
    }

    /**
     * Tambah Poin User secara Atomik & Permanen
     * @param {string|object} user - User penerima poin
     * @param {number} amount - Jumlah poin
     * @param {string} source - Sumber poin (e.g. 'tebak_kata', 'chat', 'subscribe')
     * @param {string} description - Keterangan transaksi
     * @param {string} [eventId] - ID event unik opsional untuk mencegah duplikasi
     */
    addPoints(user, amount, source = "manual", description = "", eventId = null) {
        try {
            // 1. Validasi amount
            const numAmount = Number(amount);
            if (!Number.isFinite(numAmount) || isNaN(numAmount)) {
                console.warn(`⚠️ [POINTS] Invalid amount ignored: ${amount}`);
                return null;
            }

            if (numAmount <= 0) {
                console.warn(`⚠️ [POINTS] Non-positive points ignored for standard event: ${numAmount}`);
                return null;
            }

            // 2. Validasi & Normalisasi user
            const normalized = this.normalizeUser(user);
            if (!normalized || !normalized.platformUserId) {
                console.warn("⚠️ [POINTS] addPoints gagal: user atau platformUserId kosong.");
                return null;
            }

            // 3. Cek anti-duplikasi jika ada eventId
            if (eventId && db.isEventProcessed(eventId)) {
                console.log(`ℹ️ [POINTS] Event ${eventId} sudah pernah diproses, diabaikan.`);
                return null;
            }

            // 4. Pastikan record user ada di SQLite
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

            // 5. Hitung level baru
            const oldPoints = dbUser.points || 0;
            const newTotalPoints = oldPoints + numAmount;
            const oldLevel = dbUser.level || 1;
            const newLevel = pointRules.calculateLevel(newTotalPoints);

            // 6. Simpan transaksi & poin baru ke SQLite secara atomik
            const updated = db.applyPoints(
                dbUser.id,
                numAmount,
                newLevel,
                source,
                description,
                eventId
            );

            if (!updated) {
                console.error("❌ [POINTS ERROR] Gagal mengupdate poin ke database.");
                return null;
            }

            // Catat cooldown
            this.recordCooldown(normalized, source);

            // 7. Cek ranking terkini
            const currentRank = db.getUserRank(newTotalPoints);

            // Logging standar
            console.log(`[POINTS] ${normalized.username} +${numAmount} | source=${source} | total=${newTotalPoints}`);

            // Cek apakah event ini penting untuk notifikasi overlay
            const isImportant =
                numAmount >= pointRules.NOTIFICATION.MIN_POINTS_THRESHOLD ||
                pointRules.NOTIFICATION.IMPORTANT_SOURCES.includes(source.toLowerCase());

            const eventPayload = {
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

            // Emit event realtime
            this.emit("point_added", eventPayload);

            if (newLevel > oldLevel) {
                console.log(`⭐ [LEVEL UP] ${normalized.username} naik ke Level ${newLevel}!`);
                this.emit("level_up", {
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

    /**
     * Ambil data poin & level user saat ini
     */
    getPoints(user) {
        try {
            const normalized = this.normalizeUser(user);
            if (!normalized) return { points: 0, level: 1, rank: 1 };

            let found = db.findUser(normalized.platform, normalized.platformUserId, normalized.username);
            if (!found) {
                // Pastikan user langsung diinisialisasi di SQLite agar tersinkronisasi
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
            console.error("❌ [POINTS ERROR] getPoints error:", err.message);
            return { points: 0, level: 1, rank: 1 };
        }
    }

    /**
     * Ambil ranking user
     */
    getRank(user) {
        const data = this.getPoints(user);
        return data.rank;
    }

    /**
     * Ambil top leaderboard
     */
    getLeaderboard(limit = 10) {
        return db.getLeaderboard(limit);
    }

    /**
     * Ambil riwayat transaksi user
     */
    getTransactionHistory(user, limit = 20) {
        try {
            const normalized = this.normalizeUser(user);
            if (!normalized) return [];

            const found = db.findUser(normalized.platform, normalized.platformUserId);
            if (!found) return [];

            return db.getUserTransactions(found.id, limit);
        } catch (err) {
            console.error("❌ [POINTS ERROR] getTransactionHistory error:", err.message);
            return [];
        }
    }
}

module.exports = new PointManager();
