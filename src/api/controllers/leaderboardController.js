// src/api/controllers/leaderboardController.js
// Handles leaderboard API, user lookup, SSE stream, and manual points
const path = require("path");
const db = require("../../data/database");
const pointManager = require("../../features/points/pointManager");
const { getAppRootPath } = require("../../core/utils/paths");

const sseClients = new Set();

// Register SSE notification broadcast on point addition
pointManager.on("point_added", (payload) => {
    if (sseClients.size === 0) return;

    const topLeaderboard = pointManager.getLeaderboard(10);
    const message = JSON.stringify({
        event: "point_added",
        notification: payload,
        leaderboard: topLeaderboard
    });

    for (const client of sseClients) {
        try {
            client.write(`event: point_added\ndata: ${message}\n\n`);
        } catch (_) {
            sseClients.delete(client);
        }
    }
});

module.exports = {
    renderOverlay(req, res) {
        res.sendFile(getAppRootPath(path.join("overlay", "leaderboard.html")));
    },

    getLeaderboard(req, res) {
        try {
            const limit = parseInt(req.query.limit, 10) || 10;
            const data = pointManager.getLeaderboard(limit);
            res.json({
                success: true,
                data
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: err.message
            });
        }
    },

    lookupUser(req, res) {
        try {
            const query = (req.query.query || req.query.name || "").trim();
            if (!query) {
                return res.status(400).json({ success: false, error: "Query parameter required" });
            }
            const user = db.findUser(req.query.platform || "youtube", query, query);
            if (!user) {
                return res.status(404).json({ success: false, error: "User tidak ditemukan" });
            }
            const rank = db.getUserRank(user.points);
            res.json({
                success: true,
                data: {
                    id: user.id,
                    platform: user.platform,
                    platformUserId: user.platform_user_id,
                    username: user.username,
                    displayName: user.display_name || user.username,
                    points: user.points,
                    level: user.level,
                    rank,
                    createdAt: user.created_at,
                    updatedAt: user.updated_at
                }
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    },

    getUserById(req, res) {
        try {
            const userId = req.params.id;
            const user = db.findUserById(userId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: "User not found"
                });
            }

            const rank = db.getUserRank(user.points);

            res.json({
                success: true,
                data: {
                    id: user.id,
                    platform: user.platform,
                    platformUserId: user.platform_user_id,
                    username: user.username,
                    displayName: user.display_name || user.username,
                    points: user.points,
                    level: user.level,
                    rank,
                    createdAt: user.created_at,
                    updatedAt: user.updated_at
                }
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: err.message
            });
        }
    },

    getUserTransactions(req, res) {
        try {
            const userId = req.params.id;
            const limit = parseInt(req.query.limit, 10) || 20;

            const user = db.findUserById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: "User not found"
                });
            }

            const history = db.getUserTransactions(userId, limit);
            res.json({
                success: true,
                data: history
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: err.message
            });
        }
    },

    streamLeaderboard(req, res) {
        res.set({
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*"
        });
        res.flushHeaders?.();

        const initialLeaderboard = pointManager.getLeaderboard(10);
        res.write(`event: initial\ndata: ${JSON.stringify({ leaderboard: initialLeaderboard })}\n\n`);

        sseClients.add(res);

        const heartbeat = setInterval(() => {
            try {
                res.write(": keep-alive\n\n");
            } catch (_) {}
        }, 15000);

        req.on("close", () => {
            clearInterval(heartbeat);
            sseClients.delete(res);
        });
    },

    addPoints(req, res) {
        try {
            const { user, username, platform, amount, source, description } = req.body;
            const target = user || {
                platform: platform || "youtube",
                platformUserId: username || "test_user",
                username: username || "test_user"
            };

            const result = pointManager.addPoints(
                target,
                amount || 5,
                source || "manual",
                description || "Manual reward"
            );

            if (!result) {
                return res.status(400).json({ success: false, error: "Gagal menambah poin" });
            }

            res.json({
                success: true,
                data: result
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
};
