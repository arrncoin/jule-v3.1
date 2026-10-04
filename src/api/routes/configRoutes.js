// src/api/routes/configRoutes.js
const express = require("express");
const controller = require("../controllers/configController");

const router = express.Router();

router.get("/api/config", controller.getConfig);
router.post("/api/config", controller.saveConfig);

module.exports = router;
