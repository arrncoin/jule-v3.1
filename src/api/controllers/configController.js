// src/api/controllers/configController.js
// Handles /api/config GET and POST
const config = require("../../config");
const logger = require("../../core/logger/logger");
const youtubeService = require("../../integrations/youtube/youtubeService");
const tiktokService = require("../../integrations/tiktok/tiktokService");
const tiktokViewer = require("../../integrations/tiktok/tiktokViewer");
const { invalidateCache } = require("../../integrations/youtube/youtubeStats");
const botManager = require("../../app/botManager");
const { errMsg } = require("../../core/utils/helpers");

module.exports = {
    getConfig(req, res) {
        res.json(config.toPublicJSON());
    },

    saveConfig(req, res) {
        const body = req.body || {};
        const geminiKey = typeof body.geminiApiKey === "string" ? body.geminiApiKey.trim() : (typeof body.geminiKey === "string" ? body.geminiKey.trim() : "");
        
        const ytLiveId = typeof body.ytChannelLiveId === "string" 
            ? body.ytChannelLiveId.trim() 
            : (typeof body.channelId === "string" ? body.channelId.trim() : (typeof body.ytChannelId === "string" ? body.ytChannelId.trim() : null));

        const ytOwnerId = typeof body.ytChannelLiveOwner === "string" 
            ? body.ytChannelLiveOwner.trim() 
            : (typeof body.ytOwnerId === "string" ? body.ytOwnerId.trim() : null);

        const youtubeApiKey = typeof body.youtubeApiKey === "string" 
            ? body.youtubeApiKey.trim() 
            : (typeof body.ytApiKey === "string" ? body.ytApiKey.trim() : null);

        const ytSubscribersCount = body.ytSubscribersCount !== undefined ? String(body.ytSubscribersCount).trim() : null;
        const ytTotalViews = body.ytTotalViews !== undefined ? String(body.ytTotalViews).trim() : null;
        const ytTotalVideos = body.ytTotalVideos !== undefined ? String(body.ytTotalVideos).trim() : null;
        const ytTargetGoal = body.ytTargetGoal !== undefined ? String(body.ytTargetGoal).trim() : null;

        const tiktokUsername = typeof body.tiktokUsername === "string" ? body.tiktokUsername.trim() : (typeof body.tiktokUser === "string" ? body.tiktokUser.trim() : null);
        const tiktoolsApiKey = typeof body.tiktoolsApiKey === "string" ? body.tiktoolsApiKey.trim() : (typeof body.tiktoolsKey === "string" ? body.tiktoolsKey.trim() : null);
        const model = typeof body.model === "string" ? body.model.trim() : (typeof body.geminiModel === "string" ? body.geminiModel.trim() : null);
        const voiceSpeed = typeof body.voiceSpeed === "string" ? body.voiceSpeed.trim() : null;
        const audioMode = typeof body.audioMode === "string" ? body.audioMode.trim() : null;

        if (geminiKey) {
            config.saveConfigVariable("GEMINI_API_KEY", geminiKey);
        }
        if (ytLiveId !== null) {
            config.saveConfigVariable("YT_CHANNEL_LIVE_ID", ytLiveId);
        }
        if (ytOwnerId !== null) {
            config.saveConfigVariable("YT_CHANNEL_LIVE_OWNER", ytOwnerId);
        }
        if (youtubeApiKey !== null) {
            config.saveConfigVariable("YOUTUBE_API_KEY", youtubeApiKey);
        }
        if (ytSubscribersCount !== null) {
            config.saveConfigVariable("YT_SUBSCRIBERS_COUNT", ytSubscribersCount);
        }
        if (ytTotalViews !== null) {
            config.saveConfigVariable("YT_TOTAL_VIEWS", ytTotalViews);
        }
        if (ytTotalVideos !== null) {
            config.saveConfigVariable("YT_TOTAL_VIDEOS", ytTotalVideos);
        }
        if (ytTargetGoal !== null) {
            config.saveConfigVariable("YT_TARGET_GOAL", ytTargetGoal);
        }
        if (tiktokUsername !== null) {
            config.saveConfigVariable("TIKTOK_USERNAME", tiktokUsername);
        }
        if (tiktoolsApiKey !== null) {
            config.saveConfigVariable("TIKTOOLS_API_KEY", tiktoolsApiKey);
        }
        if (model) {
            config.saveConfigVariable("GEMINI_MODEL", model);
        }
        if (voiceSpeed) {
            config.saveConfigVariable("VOICE_SPEED", voiceSpeed);
        }
        if (audioMode) {
            config.saveConfigVariable("AUDIO_PROVIDER", audioMode);
        }

        // Apply to live platforms
        youtubeService.setup();
        tiktokService.setup();

        if (botManager.isRunning()) {
            youtubeService.connect();
            tiktokService.connect();
        }

        // Refresh tiktokViewer
        try {
            tiktokViewer.stop();
            if (process.env.TIKTOK_USERNAME && process.env.TIKTOOLS_API_KEY) {
                tiktokViewer.start();
            }
        } catch (err) {
            console.warn("⚠️ Gagal restart tiktokViewer:", errMsg(err));
        }

        // Refresh AI clients
        try {
            const aiController = require("../../integrations/gemini/index");
            if (aiController && typeof aiController.reloadConfig === "function") {
                aiController.reloadConfig();
            }
        } catch (_) {}
        try {
            const generator = require("../../integrations/gemini/generator");
            if (generator && typeof generator.reloadConfig === "function") {
                generator.reloadConfig();
            }
        } catch (_) {}

        // Invalidate YouTube stats cache
        try {
            invalidateCache();
        } catch (_) {}

        const currentYtLive = config.ytChannelLiveId || "Kosong";
        const currentYtOwner = config.ytChannelLiveOwner || "Sama dg Sumber";
        const currentTt = config.tiktokUsername || "Kosong";
        logger.info(`⚙️ Konfigurasi diperbarui & diterapkan! (Sumber Live: ${currentYtLive} | Pengelola: ${currentYtOwner} | TikTok: ${currentTt})`);

        res.json({
            success: true,
            message: "Konfigurasi Kak Jule berhasil disimpan dan langsung diterapkan!",
            config: config.toPublicJSON()
        });
    }
};
