// src/app/botManager.js
// Central Bot Orchestrator & Multi-platform Coordinator
const EventEmitter = require("events");
const config = require("../config");
const logger = require("../core/logger/logger");
const context = require("../core/state/context");
const overlayState = require("../core/state/overlayState");
const licenseManager = require("../core/licensing/licenseManager");
const chatHandler = require("../features/chat/router");
const youtubeService = require("../integrations/youtube/youtubeService");
const tiktokService = require("../integrations/tiktok/tiktokService");
const tiktokViewer = require("../integrations/tiktok/tiktokViewer");
const { errMsg } = require("../core/utils/helpers");

class BotManager extends EventEmitter {
    constructor() {
        super();
        this.botRunning = false;
        this.botStartedAt = null;
        this.startTime = Date.now();

        // Wire incoming chat handler for platforms
        this.handleIncomingChat = this.handleIncomingChat.bind(this);
        youtubeService.setChatHandler(this.handleIncomingChat);
        tiktokService.setChatHandler(this.handleIncomingChat);
    }

    isRunning() {
        return this.botRunning;
    }

    getStartedAt() {
        return this.botStartedAt;
    }

    getUptimeSeconds() {
        if (!this.botRunning || !this.botStartedAt) return 0;
        return Math.floor((Date.now() - this.botStartedAt) / 1000);
    }

    handleIncomingChat(chatItem) {
        try {
            if (!chatItem || !chatItem.cleanMessage) return;

            const authorName = chatItem.author && chatItem.author.name ? chatItem.author.name : "Unknown";
            console.log(`💬[${chatItem.platform}] ${authorName}: ${chatItem.cleanMessage}`);
            logger.chat(`${authorName}: ${chatItem.cleanMessage}`, { platform: chatItem.platform, author: authorName });

            chatHandler.process(chatItem, this.startTime).then((reply) => {
                if (reply) {
                    logger.bot(`Kak Jule: ${reply}`);
                }
            }).catch((err) => {
                console.error(`❌ [${chatItem.platform}] Chat Handler Error:`, errMsg(err));
                logger.error(`[${chatItem.platform}] Error: ${errMsg(err)}`);
            });
        } catch (err) {
            console.error(`❌ [${chatItem.platform || "unknown"}] Error Chat Processing:`, errMsg(err));
        }
    }

    simulateChat(authorName, message) {
        if (!message || !message.trim()) {
            return { success: false, reason: "Pesan obrolan tidak boleh kosong." };
        }
        const clean = message.trim();
        const name = authorName ? authorName.trim() : "Streamer";
        const chatItem = {
            platform: "simulasi",
            author: {
                name,
                isOwner: true,
                isAdmin: true,
                isChatOwner: true
            },
            cleanMessage: clean,
            timestamp: Date.now()
        };
        this.handleIncomingChat(chatItem);
        return { success: true, message: "Pesan simulasi berhasil dikirim ke router bot." };
    }

    initPlatforms() {
        youtubeService.setup();
        tiktokService.setup();
    }

    start() {
        const license = licenseManager.getStatus();
        if (!license.isUnlocked) {
            return {
                success: false,
                reason: "Aplikasi terkunci: Silakan masukkan dan aktifkan kode lisensi langganan terlebih dahulu."
            };
        }

        if (this.botRunning) {
            return { success: true, message: "Bot sudah aktif berjalan." };
        }

        this.botRunning = true;
        this.botStartedAt = Date.now();
        youtubeService.setStartTime(this.botStartedAt);
        context.updateStatus({ isActive: true });
        logger.info("▶️ Bot Kak Jule dijalankan oleh streamer.");

        try {
            tiktokViewer.start();
        } catch (_) {}

        youtubeService.connect();
        tiktokService.connect();

        this.emit("started", { startedAt: this.botStartedAt });

        return {
            success: true,
            message: "Bot Kak Jule berhasil dijalankan!",
            status: { running: true, startedAt: this.botStartedAt }
        };
    }

    stop() {
        this.botRunning = false;
        this.botStartedAt = null;
        context.updateStatus({ isActive: false, isGameActive: false });
        logger.warn("⏹️ Bot Kak Jule dihentikan (Standby).");

        try {
            tiktokViewer.stop();
        } catch (_) {}

        // 1. Hentikan Game Tebak Kata & batalkan antrean persiapan soal
        try {
            const quiz = require("../features/quiz");
            if (quiz && typeof quiz.stop === "function") {
                quiz.stop();
            }
        } catch (err) {
            console.error("❌ Error saat menghentikan game tebak kata:", err.message);
        }
        try {
            const gameCmd = require("../features/commands/game");
            if (gameCmd && typeof gameCmd.cancelPreparation === "function") {
                gameCmd.cancelPreparation();
            }
        } catch (_) {}

        // 2. Hentikan Game Puzzle Paz jika aktif
        try {
            const paz = require("../features/quiz/paz");
            if (paz && typeof paz.stop === "function") {
                paz.stop({ reason: "bot_stopped", silent: true });
            }
        } catch (_) {}

        // 3. Hentikan Pembacaan Cerita
        try {
            const story = require("../features/story");
            if (story && typeof story.stop === "function") {
                story.stop();
            }
        } catch (err) {
            console.error("❌ Error saat menghentikan cerita:", err.message);
        }

        // 4. Hentikan Voting Live
        try {
            const voting = require("../features/voting");
            if (voting && typeof voting.stop === "function") {
                voting.stop();
            }
        } catch (err) {
            console.error("❌ Error saat menghentikan voting:", err.message);
        }

        // 5. Bersihkan seluruh antrean audio & hentikan pemutaran TTS yang tersisa
        try {
            const audio = require("../features/audio");
            if (audio && typeof audio.stop === "function") {
                audio.stop();
            }
        } catch (err) {
            console.error("❌ Error saat membersihkan antrean audio:", err.message);
        }

        // 6. Reset Mode Overlay Layar OBS ke Standby Dashboard
        overlayState.reset("dashboard", "Bot Kak Jule dalam mode Standby.");

        // 7. Putuskan koneksi live platform
        youtubeService.disconnect();
        tiktokService.disconnect();

        this.emit("stopped");

        return {
            success: true,
            message: "Bot Kak Jule dan seluruh aktivitas soal/game berhasil dihentikan.",
            status: { running: false }
        };
    }

    getStatus() {
        const license = licenseManager.getStatus();
        return {
            status: "ok",
            running: this.botRunning,
            startedAt: this.botStartedAt,
            uptimeSeconds: this.getUptimeSeconds(),
            license,
            platforms: {
                youtube: youtubeService.getStatus(),
                tiktok: tiktokService.getStatus()
            }
        };
    }
}

const botManager = new BotManager();
module.exports = botManager;
