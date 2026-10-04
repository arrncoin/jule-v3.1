// src/core/constants/index.js
// Centralized System Constants

module.exports = {
    PORT: 3000,
    MAX_LOGS: 150,
    RETRY_INTERVAL_MS: 5000,
    TOLERANSI_DELAY_MS: 5 * 60 * 1000, // 5 menit
    TIKTOK_STARTUP_GRACE_MS: 2000,

    LOG_LEVELS: {
        INFO: "info",
        CHAT: "chat",
        BOT: "bot",
        WARN: "warn",
        ERROR: "error",
        YOUTUBE: "youtube",
        TIKTOK: "tiktok"
    },

    LOG_TAGS: {
        BOOT: "[BOOT]",
        CHAT: "[CHAT]",
        POINTS: "[POINTS]",
        GAME: "[GAME]",
        AUDIO: "[AUDIO]",
        TTS: "[TTS]",
        YOUTUBE: "[YOUTUBE]",
        TIKTOK: "[TIKTOK]",
        GEMINI: "[GEMINI]",
        DATABASE: "[DATABASE]",
        OVERLAY: "[OVERLAY]",
        ERROR: "[ERROR]"
    },

    MEDALS: ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"],

    OFFLINE_HINTS: [
        "not found",
        "404",
        "offline",
        "not live",
        "not currently live",
        "user not found",
        "room not found",
        "live has ended",
        "belum online",
        "tidak ditemukan",
        "belum mulai",
        "live belum online",
        "live belum mulai",
        "belum live",
        "tidak ada live",
        "stream is offline",
        "stream not found",
        "channel not found",
        "chat is disabled",
        "chat dinonaktifkan",
        "disabled for this live stream",
    ]
};
