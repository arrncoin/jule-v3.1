// core/routes/leaderboardRoutes.js
// Express Router for Leaderboard API, SSE Realtime Stream, and Overlay Page
const express = require("express");
const path = require("path");
const db = require("../db/database");
const pointManager = require("../points/pointManager");
const pointRules = require("../points/pointRules");

const router = express.Router();

// Parse JSON and urlencoded for manual point posting
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

/**
 * 📄 1. Rute Halaman Overlay Leaderboard
 * Dapat dibuka langsung via:
 *   http://localhost:3000/leaderboard
 *   http://localhost:3000/overlay/leaderboard
 */
router.get(["/leaderboard", "/overlay/leaderboard"], (req, res) => {
    res.sendFile(path.join(__dirname, "../../overlay/leaderboard.html"));
});

/**
 * 📊 2. GET /api/leaderboard and /api/leaderboard/top
 * Mengembalikan top leaderboard
 */
router.get(["/api/leaderboard", "/api/leaderboard/top"], (req, res) => {
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
});

/**
 * 🔍 3b. GET /api/user/lookup
 * Cari profil user berdasarkan username atau platformUserId
 */
router.get("/api/user/lookup", (req, res) => {
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
});

/**
 * 👤 3. GET /api/user/:id
 * Mengambil profil user, poin, rank, dan level
 */
router.get("/api/user/:id", (req, res) => {
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
});

/**
 * 📜 4. GET /api/user/:id/transactions
 * Mengambil riwayat mutasi poin user
 */
router.get("/api/user/:id/transactions", (req, res) => {
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
});

/**
 * ⚡ 5. GET /api/leaderboard/stream (Server-Sent Events untuk Realtime Update)
 * Setiap kali poin bertambah, event langsung di-push ke overlay browser OBS
 */
const sseClients = new Set();

router.get("/api/leaderboard/stream", (req, res) => {
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
    });
    res.flushHeaders?.();

    // Kirim initial data leaderboard
    const initialLeaderboard = pointManager.getLeaderboard(10);
    res.write(`event: initial\ndata: ${JSON.stringify({ leaderboard: initialLeaderboard })}\n\n`);

    sseClients.add(res);

    // Keep-alive heartbeat setiap 15 detik agar koneksi tidak diputus reverse proxy
    const heartbeat = setInterval(() => {
        try {
            res.write(": keep-alive\n\n");
        } catch (_) {}
    }, 15000);

    req.on("close", () => {
        clearInterval(heartbeat);
        sseClients.delete(res);
    });
});

// Broadcast ke seluruh klien SSE saat ada poin baru
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

/**
 * 🎁 6. POST /api/points/add (Endpoint utilitas untuk testing/manual reward)
 */
router.post("/api/points/add", (req, res) => {
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
});

module.exports = router;
