// src/core/logger/logger.js
const { MAX_LOGS } = require("../constants");
const eventBus = require("../events/eventBus");

let logHandler = null;
let activityLogs = [];

function addLog(level, message, meta = {}) {
    const entry = {
        id: Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        time: new Date().toLocaleTimeString("id-ID", { hour12: false }),
        level,
        message: String(message || ""),
        meta
    };

    activityLogs.push(entry);
    if (activityLogs.length > MAX_LOGS) {
        activityLogs.shift();
    }

    if (typeof logHandler === "function") {
        try {
            logHandler(level, message, meta);
        } catch (_) {}
    }

    eventBus.emit("log_entry", entry);
    return entry;
}

function setLogHandler(fn) {
    logHandler = fn;
}

function getLogs() {
    return activityLogs;
}

function clearLogs(category) {
    if (category === "chat") {
        activityLogs = activityLogs.filter((l) => l.level !== "chat" && l.level !== "bot");
    } else if (category === "system") {
        activityLogs = activityLogs.filter((l) => l.level === "chat" || l.level === "bot");
    } else {
        activityLogs = [];
    }
    return activityLogs;
}

module.exports = {
    setLogHandler,
    addLog,
    getLogs,
    clearLogs,
    log: addLog,

    info: (msg, meta) => addLog("info", msg, meta),
    warn: (msg, meta) => addLog("warn", msg, meta),
    error: (msg, meta) => addLog("error", msg, meta),
    bot: (msg, meta) => addLog("bot", msg, meta),
    chat: (msg, meta) => addLog("chat", msg, meta),
    youtube: (msg, meta) => addLog("youtube", msg, meta),
    tiktok: (msg, meta) => addLog("tiktok", msg, meta),

    // Tagged helpers
    bootLog: (msg) => console.log(`🚀 [BOOT] ${msg}`),
    pointsLog: (msg) => console.log(`[POINTS] ${msg}`),
    gameLog: (msg) => console.log(`🎮 [GAME] ${msg}`),
    audioLog: (msg) => console.log(`🔊 [AUDIO] ${msg}`),
    ttsLog: (msg) => console.log(`🗣️ [TTS] ${msg}`),
    dbLog: (msg) => console.log(`🗄️ [DATABASE] ${msg}`),
    overlayLog: (msg) => console.log(`📺 [OVERLAY] ${msg}`)
};
