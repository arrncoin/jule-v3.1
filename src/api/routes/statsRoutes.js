// src/api/routes/statsRoutes.js
const express = require("express");
const controller = require("../controllers/statsController");

const router = express.Router();

router.get(["/api/sub-stats", "/api/tiktok/viewers"], controller.getSubStats);
router.get("/state/tiktok.json", controller.getTikTokState);

module.exports = router;
