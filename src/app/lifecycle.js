// src/app/lifecycle.js
// Process signals and global exception handling
const botManager = require("./botManager");
const youtubeService = require("../integrations/youtube/youtubeService");
const tiktokService = require("../integrations/tiktok/tiktokService");
const { errMsg } = require("../core/utils/helpers");

function setupLifecycle(server) {
    process.on("uncaughtException", (err) => {
        console.error("💥 [ERROR] Fatal Uncaught Exception:", errMsg(err));
        if (botManager.isRunning()) {
            youtubeService.scheduleRetry();
            tiktokService.scheduleRetry();
        }
    });

    process.on("unhandledRejection", (reason) => {
        console.error("💥 [ERROR] Unhandled Rejection:", errMsg(reason));
    });

    function shutdown() {
        console.log("🛑 [BOOT] Mematikan bot...");
        botManager.stop();
        if (server && typeof server.close === "function") {
            server.close(() => process.exit(0));
        } else {
            process.exit(0);
        }
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

module.exports = { setupLifecycle };
