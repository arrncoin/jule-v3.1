// src/api/controllers/licenseController.js
// Handles /api/license and /api/license/activate
const licenseManager = require("../../core/licensing/licenseManager");

module.exports = {
    getStatus(req, res) {
        res.json(licenseManager.getStatus());
    },

    activate(req, res) {
        const { key, streamerName, registeredTo } = req.body || {};
        if (!key) {
            return res.status(400).json({ success: false, reason: "Kode langganan wajib diisi." });
        }
        const result = licenseManager.activate(key, streamerName || registeredTo || "Pengguna");
        if (!result.success) {
            return res.status(400).json(result);
        }
        res.json(result);
    }
};
