// src/api/routes/licenseRoutes.js
const express = require("express");
const controller = require("../controllers/licenseController");

const router = express.Router();

router.get("/api/license", controller.getStatus);
router.post("/api/license/activate", controller.activate);

module.exports = router;
