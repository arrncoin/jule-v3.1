// src/api/controllers/statsController.js
// Handles /api/sub-stats, /api/tiktok/viewers, and /state/tiktok.json
const tiktokViewer = require("../../integrations/tiktok/tiktokViewer");
const { getYouTubeStats } = require("../../integrations/youtube/youtubeStats");
const youtubeService = require("../../integrations/youtube/youtubeService");
const config = require("../../config");

module.exports = {
    async getSubStats(req, res) {
        res.set({
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Access-Control-Allow-Origin": "*"
        });

        const ttState = tiktokViewer.getState();
        let ytStats = {
            subscribers: config.ytSubscribersCount ? Number(config.ytSubscribersCount) : 0,
            views: config.ytTotalViews ? Number(config.ytTotalViews) : 0,
            videos: config.ytTotalVideos ? Number(config.ytTotalVideos) : 0,
            targetGoal: config.ytTargetGoal ? Number(config.ytTargetGoal) : 1000,
            percentage: 0,
            channelTitle: config.ytChannelLiveOwner || config.ytChannelLiveId || "Belum Dikonfigurasi",
            isConfigured: Boolean(config.ytChannelLiveId || config.youtubeApiKey)
        };

        const knownVideoId = youtubeService.activeVideoId || null;
        try {
            ytStats = await getYouTubeStats(null, null, knownVideoId);
        } catch (_) {}

        const ytLiveActive = Boolean(ytStats.isLive || youtubeService.isConnected || youtubeService.isLiveOnline);
        const activeVideoId = ytStats.activeVideoId || youtubeService.activeVideoId || null;
        const viewerCount = Number(ytStats.viewerCount || youtubeService.viewerCount || 0);

        if (activeVideoId && !youtubeService.activeVideoId) {
            youtubeService.activeVideoId = activeVideoId;
        }
        youtubeService.viewerCount = viewerCount;
        youtubeService.isLiveOnline = ytLiveActive;

        const isYtConfigured = Boolean(
            (config.ytChannelLiveId && config.ytChannelLiveId.trim()) ||
            ytStats.channelId ||
            ytStats.subscribers > 0 ||
            ytStats.views > 0
        );

        const ytState = {
            isLive: ytLiveActive,
            viewerCount: viewerCount,
            activeVideoId: activeVideoId,
            liveTitle: ytStats.liveTitle || null,
            channelTitle: ytStats.channelTitle,
            subscribers: ytStats.subscribers,
            views: ytStats.views,
            videos: ytStats.videos,
            targetGoal: ytStats.targetGoal,
            percentage: ytStats.percentage,
            isConfigured: isYtConfigured
        };

        res.json({
            success: true,
            tiktok: ttState,
            youtube: ytState,
            channelConfig: {
                channelId: (config.ytChannelLiveId || ytStats.channelId || "").trim(),
                apiKey: config.youtubeApiKey,
                tiktokUsername: config.tiktokUsername,
                isConfigured: isYtConfigured
            },
            channel: {
                subscribers: ytStats.subscribers,
                views: ytStats.views,
                videos: ytStats.videos,
                targetGoal: ytStats.targetGoal,
                percentage: ytStats.percentage,
                channelTitle: ytStats.channelTitle,
                isConfigured: isYtConfigured
            },
            updatedAt: Date.now()
        });
    },

    getTikTokState(req, res) {
        res.set({
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Access-Control-Allow-Origin": "*"
        });
        res.json(tiktokViewer.getState());
    }
};
