// src/api/routes/siapaRoutes.js
const express = require("express");
const controller = require("../controllers/siapaController");

const router = express.Router();

router.get("/api/siapa/state", controller.getState);
router.get("/api/siapa/leaderboard", controller.getLeaderboard);
router.get("/api/siapa/stats/:username", controller.getStats);
router.post("/api/siapa/action", controller.handleAction);

module.exports = router;
