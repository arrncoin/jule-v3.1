// src/api/controllers/botController.js
// Handles /api/bot/* endpoints and /api/health
const botManager = require("../../app/botManager");
const logger = require("../../core/logger/logger");
const licenseManager = require("../../core/licensing/licenseManager");
const youtubeService = require("../../integrations/youtube/youtubeService");
const tiktokService = require("../../integrations/tiktok/tiktokService");
const audioEngine = require("../../features/audio");
const { errMsg } = require("../../core/utils/helpers");

module.exports = {
    getStatus(req, res) {
        res.json(botManager.getStatus());
    },

    getHealth(req, res) {
        const license = licenseManager ? licenseManager.getStatus() : { valid: false, isUnlocked: false };
        res.json({
            status: "ok",
            botRunning: botManager.isRunning(),
            license: {
                valid: license.valid,
                tier: license.tier,
                remainingDays: license.remainingDays,
                expiresAt: license.expiresAt,
                isUnlocked: license.isUnlocked
            },
            platforms: [
                { name: "youtube", connected: youtubeService.isConnected },
                { name: "tiktok", connected: tiktokService.isConnected }
            ]
        });
    },

    getLogs(req, res) {
        res.json({ logs: logger.getLogs() });
    },

    clearLogs(req, res) {
        const category = req.body && req.body.category;
        const remainingLogs = logger.clearLogs(category);
        res.json({ success: true, logs: remainingLogs });
    },

    startBot(req, res) {
        const result = botManager.start();
        if (!result.success && result.reason) {
            return res.status(403).json(result);
        }
        res.json(result);
    },

    stopBot(req, res) {
        const result = botManager.stop();
        res.json(result);
    },

    testTTS(req, res) {
        try {
            const sampleText = req.body?.text || "Halo streamer! Sistem suara Kak Jule aktif dan siap merespons obrolan live.";
            audioEngine.speak(sampleText, true);
            logger.bot(`[TEST SUARA] ${sampleText}`);
            res.json({ success: true, message: "Suara tes sedang diputar." });
        } catch (err) {
            res.status(500).json({ success: false, reason: errMsg(err) });
        }
    },

    simulateChat(req, res) {
        const { authorName, message } = req.body || {};
        const result = botManager.simulateChat(authorName, message);
        if (!result.success) {
            return res.status(400).json(result);
        }
        res.json(result);
    }
};
