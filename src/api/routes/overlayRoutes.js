// src/api/routes/overlayRoutes.js
const express = require("express");
const controller = require("../controllers/overlayController");

const router = express.Router();

router.get(["/state/overlay.json", "/overlay/state/overlay.json", "/api/overlay"], controller.getState);
router.post(["/api/overlay/mode", "/api/overlay/set-mode"], controller.setMode);

module.exports = router;
