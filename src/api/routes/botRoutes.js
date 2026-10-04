// src/api/routes/botRoutes.js
const express = require("express");
const controller = require("../controllers/botController");

const router = express.Router();

router.get("/api/bot/status", controller.getStatus);
router.get("/api/health", controller.getHealth);
router.get("/api/bot/logs", controller.getLogs);
router.post("/api/bot/clear-logs", controller.clearLogs);
router.post("/api/bot/start", controller.startBot);
router.post("/api/bot/stop", controller.stopBot);
router.post("/api/bot/test-tts", controller.testTTS);
router.post("/api/bot/simulate-chat", controller.simulateChat);

module.exports = router;
