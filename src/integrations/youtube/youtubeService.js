// src/integrations/youtube/youtubeService.js
// Dedicated YouTube Live Chat Integration Service
const EventEmitter = require("events");
const { LiveChat } = require("./youtubeChatClient");
const config = require("../../config");
const logger = require("../../core/logger/logger");
const pointManager = require("../../features/points/pointManager");
const pointRules = require("../../features/points/pointRules");
const { errMsg, isOfflineLikeError } = require("../../core/utils/helpers");
const { RETRY_INTERVAL_MS, TOLERANSI_DELAY_MS } = require("../../core/constants");

class YouTubeService extends EventEmitter {
    constructor() {
        super();
        this.liveChat = null;
        this.isConnected = false;
        this.isStarting = false;
        this.isLiveOnline = false;
        this.activeVideoId = null;
        this.viewerCount = 0;
        this.lastError = null;
        this.retryTimeout = null;
        this.onChatHandler = null;
        this.startTime = Date.now();
        this.botStartedAt = null;
    }

    setChatHandler(handler) {
        this.onChatHandler = handler;
    }

    setStartTime(time) {
        this.botStartedAt = time;
    }

    setup() {
        const channelId = config.ytChannelLiveId;
        const ownerId = config.ytChannelLiveOwner;
        const apiKey = config.youtubeApiKey;

        this.disconnect();

        if (!channelId) {
            console.log("⚠️ YT_CHANNEL_LIVE_ID kosong, konektor YouTube tidak aktif.");
            return false;
        }

        try {
            this.liveChat = new LiveChat({
                channelId,
                apiKey: apiKey || undefined,
                liveId: this.activeVideoId || undefined
            });

            this.liveChat.on("start", (liveId) => {
                this.activeVideoId = liveId;
                this.lastError = null;
                this.isConnected = true;
                this.isStarting = false;
                this.isLiveOnline = true;
                console.log(`📡 [YOUTUBE] Live Chat tersambung ke siaran YouTube! (Video ID: ${liveId})`);
                logger.youtube(`📡 [YOUTUBE] Tersambung ke siaran live! (Video ID: ${liveId})`);
                this.emit("connected", { liveId });
            });

            this.liveChat.on("chat", (chatItem) => {
                const chatTimestamp = new Date(chatItem.timestamp).getTime();
                const now = Date.now();
                const refTime = this.botStartedAt || this.startTime;

                if (refTime && chatTimestamp < (refTime - 60000)) return;
                if (now - chatTimestamp > TOLERANSI_DELAY_MS) return;

                const message = Array.isArray(chatItem.message)
                    ? chatItem.message.map((m) => m.text || m.emojiText || "").join("")
                    : (chatItem.message || "");

                // Handle Super Chat
                if (chatItem.isSuperChat || chatItem.purchaseAmount) {
                    try {
                        const authorName = chatItem.author?.name || "Viewer YouTube";
                        const channelId = chatItem.author?.channelId || authorName;
                        const pts = pointRules.POINTS.GIFT || 50;
                        pointManager.addPoints(
                            { platform: "youtube", platformUserId: channelId, username: authorName, displayName: authorName },
                            pts,
                            "gift",
                            `Super Chat YouTube: ${chatItem.purchaseAmount || "Donasi"}`
                        );
                        logger.chat(`🎁 Super Chat dari ${authorName} (${chatItem.purchaseAmount || "Donasi"}) (+${pts} poin)!`, { platform: "youtube", author: authorName });
                    } catch (_) {}
                }

                if (!message) return;

                const payload = {
                    platform: "youtube",
                    author: {
                        name: chatItem.author.name,
                        channelId: chatItem.author.channelId,
                        isOwner: chatItem.author.isOwner,
                    },
                    cleanMessage: message,
                    timestamp: chatTimestamp,
                };

                this.emit("chat", payload);
                if (typeof this.onChatHandler === "function") {
                    this.onChatHandler(payload);
                }
            });

            this.liveChat.on("end", () => {
                console.log("🔚 [YOUTUBE] Live stream berakhir, menunggu live berikutnya...");
                this.activeVideoId = null;
                this.isConnected = false;
                this.isStarting = false;
                this.isLiveOnline = false;
                this.emit("disconnected");
                this.scheduleRetry();
            });

            this.liveChat.on("error", (err) => {
                const message = errMsg(err);
                if (isOfflineLikeError(message)) {
                    console.log("😴 [YOUTUBE] Live stream belum online atau terputus, menunggu host...");
                } else {
                    console.warn("⚠️ [YOUTUBE] Koneksi Terputus:", message);
                }
                this.lastError = message;
                this.isConnected = false;
                this.isStarting = false;
                this.isLiveOnline = false;
                try { this.liveChat.stop(); } catch (_) {}
                this.emit("error", err);
                this.scheduleRetry();
            });

            console.log(`✅ [YOUTUBE] Konektor YouTube terpasang (Sumber Live: ${channelId} | Pengelola: ${ownerId || "Sama dengan Sumber"})`);
            return true;
        } catch (err) {
            console.error("❌ Gagal menginisialisasi YouTube connector:", errMsg(err));
            return false;
        }
    }

    async connect() {
        if (!this.liveChat) {
            const ok = this.setup();
            if (!ok) return;
        }

        if (this.isStarting || this.isConnected) return;

        try {
            this.isStarting = true;
            console.log("🔄 [YOUTUBE] Mencari Live Stream...");
            logger.info("🔄 [YOUTUBE] Menghubungkan ke live stream...");

            if (this.activeVideoId && !this.liveChat.liveId) {
                this.liveChat.liveId = this.activeVideoId;
            }

            const ok = await this.liveChat.start();
            if (!ok) {
                throw (this.liveChat.lastError || new Error("Live belum online atau tidak ditemukan di channel."));
            }

            this.isConnected = true;
            this.isStarting = false;
            this.isLiveOnline = true;

            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("🚀 KAK JULE V3.1 - YOUTUBE ONLINE");
            console.log(`📡 Start Time: ${new Date().toLocaleTimeString()}`);
            console.log("⚡ Mode: responsive");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            logger.info("🟢 [YOUTUBE] Terhubung ke live stream!");
        } catch (err) {
            this.isStarting = false;
            this.isConnected = false;
            this.isLiveOnline = false;
            try { this.liveChat.stop(); } catch (_) {}

            const message = errMsg(err);
            if (isOfflineLikeError(message)) {
                console.log("😴 [YOUTUBE] Live belum mulai, nunggu host...");
                logger.warn("😴 [YOUTUBE] Live stream belum aktif/online.");
            } else {
                console.error("❌ [YOUTUBE] Error:", message);
                logger.error(`❌ [YOUTUBE] Error: ${message}`);
            }

            this.scheduleRetry();
        }
    }

    disconnect() {
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
        try {
            if (this.liveChat && typeof this.liveChat.stop === "function") {
                this.liveChat.stop();
            }
        } catch (_) {}
        this.isConnected = false;
        this.isStarting = false;
        this.isLiveOnline = false;
    }

    scheduleRetry() {
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
        this.retryTimeout = setTimeout(() => {
            this.retryTimeout = null;
            this.connect();
        }, RETRY_INTERVAL_MS);
    }

    getStatus() {
        const ytLiveId = config.ytChannelLiveId;
        const ytOwnerId = config.ytChannelLiveOwner;

        return {
            configured: Boolean(ytLiveId),
            channelId: ytLiveId,
            liveChannelId: ytLiveId,
            ownerChannelId: ytOwnerId,
            activeVideoId: this.activeVideoId,
            lastError: this.lastError,
            connected: this.isConnected,
            starting: this.isStarting,
            isLive: Boolean(this.isLiveOnline || this.isConnected),
            viewerCount: this.viewerCount || 0,
        };
    }
}

module.exports = new YouTubeService();
