// src/api/routes/index.js
const express = require("express");
const botRoutes = require("./botRoutes");
const configRoutes = require("./configRoutes");
const licenseRoutes = require("./licenseRoutes");
const overlayRoutes = require("./overlayRoutes");
const statsRoutes = require("./statsRoutes");
const siapaRoutes = require("./siapaRoutes");
const leaderboardRoutes = require("./leaderboardRoutes");

const router = express.Router();

router.use(leaderboardRoutes);
router.use(botRoutes);
router.use(configRoutes);
router.use(licenseRoutes);
router.use(overlayRoutes);
router.use(statsRoutes);
router.use(siapaRoutes);

module.exports = router;
