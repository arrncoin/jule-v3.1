// src/core/utils/paths.js
// Safe file path resolution for both Node.js server and packaged Electron App
const path = require("path");
const fs = require("fs");

let writableDir = null;
const rootDir = path.resolve(__dirname, "../../../");

function resolveWritableDir() {
    // 1. Electron runtime check
    if (process.versions && process.versions.electron) {
        try {
            const electron = require("electron");
            const app = electron.app || (electron.remote && electron.remote.app);
            if (app && typeof app.getPath === "function") {
                return app.getPath("userData");
            }
        } catch (_) {}
    }

    // 2. Custom environment override
    if (process.env.KAK_JULE_DATA_DIR) {
        return process.env.KAK_JULE_DATA_DIR;
    }

    // 3. Standard Node.js root folder
    return rootDir;
}

writableDir = resolveWritableDir();

try {
    if (!fs.existsSync(writableDir)) {
        fs.mkdirSync(writableDir, { recursive: true });
    }
} catch (err) {
    console.warn("⚠️ Gagal membuat direktori penyimpanan:", err.message);
    writableDir = rootDir;
}

module.exports = {
    getWritablePath: (filename) => {
        return path.join(writableDir, filename);
    },
    getAppRootPath: (subPath = "") => {
        return path.join(rootDir, subPath);
    },
    getWritableDir: () => writableDir,
    getRootDir: () => rootDir
};
