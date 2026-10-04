// src/features/points/pointRules.js
// Centralized Point Configuration for Kak Jule Bot

module.exports = {
    // Point values for various interaction sources
    POINTS: {
        CHAT: 1,
        LIKE: 1,
        SHARE: 10,
        FOLLOW: 50,
        SUBSCRIBE: 100,
        GIFT: 20,
        VOTE: 2,
        TEBAK_KATA_WIN_1: 5,
        TEBAK_KATA_WIN_2: 3,
        TEBAK_KATA_WIN_3: 1,
        PAZ_WIN: 3,
        SIAPA_JOIN: 10,
        SIAPA_SURVIVE_ROUND: 20,
        SIAPA_WIN_1: 1000,
        SIAPA_WIN_2: 500,
        SIAPA_WIN_3: 300
    },

    // Anti-spam cooldowns (in milliseconds)
    COOLDOWNS_MS: {
        chat: 1500,
        like: 3 * 1000,
        share: 10 * 1000,
        vote: 5 * 1000
    },

    // Minimum point amount or sources that trigger live overlay banner/notification
    NOTIFICATION: {
        MIN_POINTS_THRESHOLD: 3,
        IMPORTANT_SOURCES: ["tebak_kata", "paz", "siapa", "subscribe", "follow", "gift", "superchat", "manual", "vote"]
    },

    // Level progression thresholds
    LEVEL_THRESHOLDS: [
        { level: 1, minPoints: 0 },
        { level: 2, minPoints: 100 },
        { level: 3, minPoints: 250 },
        { level: 4, minPoints: 500 },
        { level: 5, minPoints: 1000 },
        { level: 6, minPoints: 2000 },
        { level: 7, minPoints: 3500 },
        { level: 8, minPoints: 5500 },
        { level: 9, minPoints: 8000 },
        { level: 10, minPoints: 12000 },
        { level: 11, minPoints: 17000 },
        { level: 12, minPoints: 23000 },
        { level: 15, minPoints: 35000 },
        { level: 20, minPoints: 60000 }
    ],

    calculateLevel(points = 0) {
        const pts = Math.max(0, Number(points) || 0);
        let level = 1;
        for (const item of this.LEVEL_THRESHOLDS) {
            if (pts >= item.minPoints) {
                level = item.level;
            } else {
                break;
            }
        }
        return level;
    }
};
