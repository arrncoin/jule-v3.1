// src/api/controllers/siapaController.js
// Handles /api/siapa/* endpoints
const siapaGame = require("../../features/game/siapa/game");
const siapaStorage = require("../../features/game/siapa/storage");

module.exports = {
    getState(req, res) {
        res.set({
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Access-Control-Allow-Origin": "*"
        });
        res.json(siapaGame.getPublicState());
    },

    getLeaderboard(req, res) {
        const limit = Number(req.query.limit) || 20;
        const sort = req.query.sort || "total_points";
        res.json({
            success: true,
            leaderboard: siapaStorage.getLeaderboard(limit, sort)
        });
    },

    getStats(req, res) {
        const stats = siapaStorage.getPlayerStats(req.params.username);
        res.json({
            success: true,
            stats
        });
    },

    handleAction(req, res) {
        const { action, seconds, username, choice } = req.body || {};
        if (action === "start") {
            const result = siapaGame.startLobby(username || "Dashboard", seconds || 20);
            return res.json(result);
        }
        if (action === "stop") {
            const result = siapaGame.stop(username || "Dashboard");
            return res.json(result);
        }
        if (action === "reset") {
            const result = siapaGame.reset();
            return res.json(result);
        }
        if (action === "join") {
            const result = siapaGame.join(username);
            return res.json(result);
        }
        if (action === "input") {
            const ok = siapaGame.handlePlayerInput(username, choice);
            return res.json({ success: ok });
        }
        res.status(400).json({ success: false, message: "Aksi tidak dikenal" });
    }
};
