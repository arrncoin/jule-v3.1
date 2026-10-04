// src/app/bootstrap.js
// Express Server & Kak Jule Application Bootstrap
const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("../config");
const logger = require("../core/logger/logger");
const botManager = require("./botManager");
const youtubeService = require("../integrations/youtube/youtubeService");
const tiktokService = require("../integrations/tiktok/tiktokService");
const apiRoutes = require("../api/routes");
const { setupLifecycle } = require("./lifecycle");
const { getAppRootPath } = require("../core/utils/paths");
const { PORT } = require("../core/constants");

require("events").EventEmitter.defaultMaxListeners = Infinity;

function createApp() {
    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Mount all modular API routes
    app.use(apiRoutes);

    // Static assets
    const rootDir = getAppRootPath();
    app.use("/app", express.static(path.join(rootDir, "app")));
    app.use("/overlay", express.static(path.join(rootDir, "overlay")));
    app.use("/assets", express.static(path.join(rootDir, "assets")));
    app.use("/state", express.static(path.join(rootDir, "state")));

    // Root route: Sajikan Dashboard App Control Center untuk Live Preview
    app.get("/", (req, res) => {
        res.sendFile(path.join(rootDir, "app", "index.html"));
    });

    // Fallback static files (tanpa menimpa route root "/")
    app.use(express.static(path.join(rootDir, "overlay"), { index: false }));
    app.use(express.static(path.join(rootDir, "app"), { index: false }));

    return app;
}

function startServer(app = null) {
    const serverApp = app || createApp();

    // Platforms compatibility bridge
    const platforms = {
        get youtube() {
            return youtubeService;
        },
        get tiktok() {
            return tiktokService;
        }
    };

    // Initialize platforms
    botManager.initPlatforms();

    logger.info("🚀 Kak Jule Studio V3.1 siap digunakan.");

    const isDesktopMode = Boolean(
        process.versions.electron ||
        process.env.KAK_JULE_LAUNCH_MODE === "desktop" ||
        process.env.ELECTRON_RUN_AS_NODE === "1"
    );

    const server = serverApp.listen(PORT, "0.0.0.0", () => {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        if (isDesktopMode) {
            console.log("🖥️  KAK JULE STUDIO — DESKTOP APP MODE");
            console.log("👉 Antarmuka aplikasi GUI Electron sedang dibuka...");
        } else {
            console.log("💻 KAK JULE STUDIO — TERMINAL / CLI MODE");
            console.log(`👉 App Control Center : http://127.0.0.1:${PORT}/app/index.html`);
        }
        console.log(`👉 OBS Browser Source : http://127.0.0.1:${PORT}/overlay/index.html`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        if (isDesktopMode) {
            console.log("⏸️ Status Bot: STANDBY. Gunakan tombol 'Start Bot' di Desktop App untuk memulai koneksi live.");
        } else {
            console.log("⏸️ Status Bot: STANDBY. Buka App Control Center di browser untuk memulai dan memantau live.");
        }
    });

    server.on("error", (err) => {
        console.error("❌ [BOOT ERROR] Gagal menjalankan server overlay:", err.message);
    });

    setupLifecycle(server);

    return {
        app: serverApp,
        server,
        platforms,
        isBotRunning: () => botManager.isRunning()
    };
}

module.exports = {
    createApp,
    startServer
};
