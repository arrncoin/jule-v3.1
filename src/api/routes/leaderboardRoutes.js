// src/api/routes/leaderboardRoutes.js
const express = require("express");
const controller = require("../controllers/leaderboardController");

const router = express.Router();

router.get(["/leaderboard", "/overlay/leaderboard"], controller.renderOverlay);
router.get(["/api/leaderboard", "/api/leaderboard/top"], controller.getLeaderboard);
router.get("/api/user/lookup", controller.lookupUser);
router.get("/api/user/:id", controller.getUserById);
router.get("/api/user/:id/transactions", controller.getUserTransactions);
router.get("/api/leaderboard/stream", controller.streamLeaderboard);
router.post("/api/points/add", controller.addPoints);

module.exports = router;
