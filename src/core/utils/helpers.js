// src/core/utils/helpers.js
const { OFFLINE_HINTS } = require("../constants");

function normalizeUser(name) {
    if (!name) return "";
    return String(name).toLowerCase().trim();
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatNumber(num = 0) {
    return Number(num || 0).toLocaleString("id-ID");
}

function errMsg(err) {
    if (!err) return "Unknown error";
    return err.message || String(err);
}

function isOfflineLikeError(message) {
    const lower = (message || "").toLowerCase();
    return OFFLINE_HINTS.some((hint) => lower.includes(hint));
}

module.exports = {
    normalizeUser,
    delay,
    formatNumber,
    errMsg,
    isOfflineLikeError
};
