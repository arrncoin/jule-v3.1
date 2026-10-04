// src/integrations/tiktok/tiktokService.js
// Dedicated TikTok Live Chat Integration Service
const EventEmitter = require("events");
const { TikTokLive } = require("@tiktool/live");
const tiktokViewer = require("./tiktokViewer");
const config = require("../../config");
const logger = require("../../core/logger/logger");
const pointManager = require("../../features/points/pointManager");
const pointRules = require("../../features/points/pointRules");
const { errMsg } = require("../../core/utils/helpers");
const { RETRY_INTERVAL_MS, TIKTOK_STARTUP_GRACE_MS } = require("../../core/constants");

/**
 * Helper untuk mengekstrak identitas penonton TikTok secara akurat dari berbagai format library
 * (@tiktool/live, tiktok-live-connector, dan Webcast protobuf event)
 */
function extractTikTokUser(data) {
    if (!data || typeof data !== "object") return null;

    const user = data.user || data.sender || data.userDetails || data.author || {};

    let uniqueId =
        data.uniqueId ||
        user.uniqueId ||
        data.displayId ||
        user.displayId ||
        data.userId ||
        user.id ||
        user.userId ||
        data.secUid ||
        user.secUid ||
        "";

    let nickname =
        data.nickname ||
        user.nickname ||
        data.displayName ||
        user.displayName ||
        data.name ||
        user.name ||
        "";

    if (typeof uniqueId === "string") {
        uniqueId = uniqueId.replace(/^@/, "").trim();
    } else if (typeof uniqueId === "number") {
        uniqueId = String(uniqueId);
    } else {
        uniqueId = "";
    }

    if (typeof nickname === "string") {
        nickname = nickname.trim();
    } else if (typeof nickname === "number") {
        nickname = String(nickname);
    } else {
        nickname = "";
    }

    const isDummy = (val) => {
        if (!val) return true;
        const low = String(val).trim().toLowerCase();
        return (
            low === "0" ||
            low === "null" ||
            low === "undefined" ||
            low === "unknown" ||
            low === "pengguna tiktok" ||
            low === "penguna tiktok"
        );
    };

    if (isDummy(uniqueId)) uniqueId = "";
    if (isDummy(nickname)) nickname = "";

    // Isi fallback timbal balik jika salah satu ada
    if (!uniqueId && nickname) uniqueId = nickname;
    if (!nickname && uniqueId) nickname = uniqueId;

    // Jika tidak ada nama/ID akun penonton yang valid (misal event like agregat dari room)
    if (!uniqueId && !nickname) {
        return null;
    }

    const badges = data.userBadges || data.level || user.level || user.badges || null;

    return {
        uniqueId,
        username: uniqueId,
        displayName: nickname || uniqueId,
        level: badges
    };
}

class TikTokService extends EventEmitter {
    constructor() {
        super();
        this.tiktokLive = null;
        this.tiktokReady = false;
        this.isConnected = false;
        this.isStarting = false;
        this.retryTimeout = null;
        this.onChatHandler = null;
    }

    setChatHandler(handler) {
        this.onChatHandler = handler;
    }

    setup() {
        const username = config.tiktokUsername;
        const apiKey = config.tiktoolsApiKey;

        this.disconnect();

        if (!username) {
            console.log("⚠️ TIKTOK_USERNAME kosong, konektor TikTok tidak aktif.");
            return false;
        }

        try {
            this.tiktokLive = new TikTokLive({
                uniqueId: username,
                apiKey: apiKey || "dummy_key"
            });

            this.tiktokLive.on("connected", () => {
                console.log(`✅ [TIKTOK] Terhubung ke siaran live @${username}`);
                logger.tiktok(`✅ [TIKTOK] Terhubung ke siaran live @${username}`);
                this.isConnected = true;
                this.isStarting = false;
                tiktokViewer.writeState({ isLive: true });
                this.emit("connected");
            });

            this.tiktokLive.on("roomUserSeq", (data) => {
                const count = Number(data?.viewerCount ?? data?.memberCount ?? 0);
                tiktokViewer.writeState({ isLive: true, viewerCount: count });
                this.emit("viewers", count);
            });

            this.tiktokLive.on("streamEnd", () => {
                console.log("🔚 [TIKTOK] Siaran live telah berakhir.");
                tiktokViewer.writeState({ isLive: false, viewerCount: 0 });
                this.isConnected = false;
                this.isStarting = false;
                this.emit("streamEnd");
            });

            this.tiktokLive.on("chat", (data) => {
                if (!this.tiktokReady) return;

                const user = extractTikTokUser(data);
                if (!user) return;

                const payload = {
                    platform: "tiktok",
                    author: {
                        name: user.displayName,
                        uniqueId: user.uniqueId,
                        level: user.level,
                    },
                    cleanMessage: data.comment || data.message || "",
                    timestamp: Date.now(),
                };

                this.emit("chat", payload);
                if (typeof this.onChatHandler === "function") {
                    this.onChatHandler(payload);
                }
            });

            this.tiktokLive.on("gift", (data) => {
                try {
                    const user = extractTikTokUser(data);
                    if (!user) {
                        return;
                    }

                    const giftName = data.giftName || data.giftDetails?.giftName || "Hadiah";
                    const repeatCount = Number(data.repeatCount || 1);
                    const diamondCount = Number(data.diamondCount || 1);
                    const pts = Math.max(20, diamondCount * 5);

                    pointManager.addPoints(
                        {
                            platform: "tiktok",
                            platformUserId: user.uniqueId,
                            username: user.username,
                            displayName: user.displayName
                        },
                        pts,
                        "gift",
                        `Kirim gift TikTok: ${giftName} x${repeatCount}`
                    );
                    logger.chat(`🎁 ${user.displayName} (@${user.uniqueId}) mengirim ${giftName} (+${pts} poin)!`, {
                        platform: "tiktok",
                        author: user.displayName
                    });
                } catch (e) {
                    console.warn("⚠️ Error processing TikTok gift event:", e.message);
                }
            });

            this.tiktokLive.on("like", (data) => {
                if (!this.tiktokReady) return;
                try {
                    const user = extractTikTokUser(data);
                    if (!user) {
                        // Jangan catat jika like berasal dari sistem room anonim tanpa akun penonton
                        return;
                    }

                    const userObj = {
                        platform: "tiktok",
                        platformUserId: user.uniqueId,
                        username: user.username,
                        displayName: user.displayName
                    };

                    if (pointManager.canReceivePoints(userObj, "like")) {
                        pointManager.addPoints(userObj, pointRules.POINTS.LIKE || 1, "like", "Like siaran live TikTok");
                    }
                } catch (e) {
                    console.warn("⚠️ Error processing TikTok like event:", e.message);
                }
            });

            this.tiktokLive.on("follow", (data) => {
                if (!this.tiktokReady) return;
                try {
                    const user = extractTikTokUser(data);
                    if (!user) return;

                    const userObj = {
                        platform: "tiktok",
                        platformUserId: user.uniqueId,
                        username: user.username,
                        displayName: user.displayName
                    };

                    pointManager.addPoints(userObj, pointRules.POINTS.FOLLOW || 50, "follow", "Follow akun TikTok live");
                    logger.chat(`🌟 ${user.displayName} (@${user.uniqueId}) mem-follow live (+50 poin)!`, {
                        platform: "tiktok",
                        author: user.displayName
                    });
                } catch (e) {
                    console.warn("⚠️ Error processing TikTok follow event:", e.message);
                }
            });

            this.tiktokLive.on("share", (data) => {
                if (!this.tiktokReady) return;
                try {
                    const user = extractTikTokUser(data);
                    if (!user) return;

                    const userObj = {
                        platform: "tiktok",
                        platformUserId: user.uniqueId,
                        username: user.username,
                        displayName: user.displayName
                    };

                    if (pointManager.canReceivePoints(userObj, "share")) {
                        pointManager.addPoints(userObj, pointRules.POINTS.SHARE || 10, "share", "Bagikan siaran live TikTok");
                        logger.chat(`🔁 ${user.displayName} (@${user.uniqueId}) membagikan siaran live (+10 poin)!`, {
                            platform: "tiktok",
                            author: user.displayName
                        });
                    }
                } catch (e) {
                    console.warn("⚠️ Error processing TikTok share event:", e.message);
                }
            });

            this.tiktokLive.on("disconnected", () => {
                console.log("🔚 [TIKTOK] Live terputus atau ditutup.");
                this.tiktokReady = false;
                this.isConnected = false;
                this.isStarting = false;
                tiktokViewer.writeState({ isLive: false, viewerCount: 0 });
                this.emit("disconnected");
                this.scheduleRetry();
            });

            this.tiktokLive.on("error", (err) => {
                console.error("⚠️ [TIKTOK] SDK Error:", errMsg(err));
                this.tiktokReady = false;
                this.isConnected = false;
                this.isStarting = false;
                tiktokViewer.writeState({ isLive: false, viewerCount: 0 });
                try {
                    if (this.tiktokLive && typeof this.tiktokLive.disconnect === "function") {
                        this.tiktokLive.disconnect();
                    }
                } catch (_) {}
                this.emit("error", err);
                this.scheduleRetry();
            });

            console.log(`✅ [TIKTOK] Konektor TikTok terpasang untuk Akun: @${username}`);
            return true;
        } catch (err) {
            console.error("❌ Gagal menginisialisasi TikTok connector:", errMsg(err));
            return false;
        }
    }

    async connect() {
        if (!this.tiktokLive) {
            const ok = this.setup();
            if (!ok) return;
        }

        if (this.isStarting || this.isConnected) return;

        try {
            this.isStarting = true;
            this.tiktokReady = false;
            console.log("🔄 [TIKTOK] Menghubungkan ke live stream TikTok...");
            logger.info("🔄 [TIKTOK] Menghubungkan ke live stream...");

            await this.tiktokLive.connect();
            setTimeout(() => {
                this.tiktokReady = true;
            }, TIKTOK_STARTUP_GRACE_MS);

            this.isConnected = true;
            this.isStarting = false;
            logger.info("🟢 [TIKTOK] Terhubung ke siaran TikTok!");
        } catch (err) {
            this.isStarting = false;
            this.isConnected = false;
            this.tiktokReady = false;
            tiktokViewer.writeState({ isLive: false, viewerCount: 0 });
            try {
                if (this.tiktokLive && typeof this.tiktokLive.disconnect === "function") {
                    this.tiktokLive.disconnect();
                }
            } catch (_) {}

            console.error("❌ [TIKTOK] Gagal menghubungkan:", errMsg(err));
            this.scheduleRetry();
        }
    }

    disconnect() {
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
        this.tiktokReady = false;
        tiktokViewer.writeState({ isLive: false, viewerCount: 0 });
        try {
            if (this.tiktokLive && typeof this.tiktokLive.disconnect === "function") {
                this.tiktokLive.disconnect();
            }
        } catch (_) {}
        this.isConnected = false;
        this.isStarting = false;
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
        const ttUser = config.tiktokUsername;
        const ttKey = config.tiktoolsApiKey;

        return {
            configured: Boolean(ttUser),
            username: ttUser,
            hasApiKey: Boolean(ttKey),
            connected: this.isConnected,
            starting: this.isStarting,
            isLive: Boolean((tiktokViewer && tiktokViewer.getState().isLive) || this.isConnected),
            viewerCount: tiktokViewer ? (tiktokViewer.getState().viewerCount || 0) : 0,
        };
    }
}

module.exports = new TikTokService();
