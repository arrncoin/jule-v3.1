// src/api/controllers/overlayController.js
// Handles overlay state requests and mode changes
const overlayState = require("../../core/state/overlayState");
const logger = require("../../core/logger/logger");
const { errMsg } = require("../../core/utils/helpers");

module.exports = {
    getState(req, res) {
        res.set({
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Access-Control-Allow-Origin": "*"
        });
        res.json(overlayState.get());
    },

    setMode(req, res) {
        const { mode, type, message } = req.body || {};
        const payload = {
            mode: mode || "dashboard",
            type: type || "idle",
            message: message || "Menunggu aktivitas...",
        };

        if (payload.mode === "game") {
            payload.clue = req.body.clue || "Hewan berkaki empat yang setia menemani manusia";
            payload.answerLength = req.body.answerLength || 6;
            payload.letterClue = req.body.letterClue || "A _ _ _ N G";
            payload.time = req.body.time || 20;
            payload.no = req.body.no || 1;
            payload.total = req.body.total || 5;
        } else if (payload.mode === "voting") {
            payload.title = req.body.title || "VOTING LIVE: Pilih Game Berikutnya";
            payload.options = req.body.options || ["Roblox", "Mobile Legends", "Minecraft"];
            payload.tally = req.body.tally || { "Roblox": 12, "Mobile Legends": 25, "Minecraft": 8 };
            payload.winners = req.body.winners || [];
        } else if (payload.mode === "story") {
            payload.title = req.body.title || "Legenda Danau Toba";
            payload.genre = req.body.genre || "Cerita Rakyat";
            payload.currentPart = req.body.currentPart || 1;
            payload.totalParts = req.body.totalParts || 3;
            payload.text = req.body.text || "Di sebuah desa di Sumatera Utara, hiduplah seorang petani bernama Toba...";
        } else if (payload.mode === "leaderboard") {
            payload.title = "LEADERBOARD MINGGUAN";
            payload.data = req.body.data || [
                { name: "BudiGaming", score: 150 },
                { name: "SitiPro", score: 120 },
                { name: "RezaMaster", score: 95 }
            ];
        }

        try {
            const updatedState = overlayState.set(payload);
            logger.info(`🎨 Mode Overlay diubah ke: ${updatedState.mode.toUpperCase()}`);
            res.json({ success: true, state: updatedState });
        } catch (err) {
            res.status(500).json({ success: false, reason: errMsg(err) });
        }
    }
};
