// electron/main.js
// Electron Desktop Application Main Process for Kak Jule V3.1 (Windows 10/11)

process.env.KAK_JULE_LAUNCH_MODE = "desktop";

// Cegah crash dialog mentah di Windows
process.on("uncaughtException", (err) => {
    console.error("⚠️ [Electron Uncaught Exception]:", err.stack || err.message);
});
process.on("unhandledRejection", (reason) => {
    console.warn("⚠️ [Electron Unhandled Rejection]:", reason);
});

const { app, BrowserWindow, Menu, Tray, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const http = require("http");

// Muat konfigurasi .env aman dari berbagai path
const { loadEnvironment, saveConfigVariable } = require("../core/utils/envLoader");
loadEnvironment();

let mainWindow = null;
let tray = null;
let serverInstance = null;

// Pastikan hanya 1 instance aplikasi yang berjalan di Windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

app.on("second-instance", () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    } else {
        createWindow();
    }
});

// Cek status kesehatan server Express
function checkServerHealth() {
    return new Promise((resolve) => {
        const req = http.get("http://127.0.0.1:3000/api/health", (res) => {
            resolve(res.statusCode === 200);
        });
        req.on("error", () => resolve(false));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

// Pastikan backend server Express aktif dan merespons
async function ensureServerRunning() {
    // 1. Cek jika sudah berjalan
    const alreadyRunning = await checkServerHealth();
    if (alreadyRunning) {
        console.log("⚡ [Electron] Express server terdeteksi aktif di port 3000.");
        return;
    }

    // 2. Jalankan internal server Express
    console.log("⚡ [Electron] Memulai Express Server internal...");
    try {
        const serverPath = path.join(__dirname, "../index.js");
        serverInstance = require(serverPath);
    } catch (err) {
        console.error("❌ [Electron] Gagal me-require index.js:", err);
        throw err;
    }

    // 3. Polling aktif sampai server siap merespons (maksimal 15 detik)
    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
        await new Promise((r) => setTimeout(r, 400));
        const ready = await checkServerHealth();
        if (ready) {
            console.log("✅ [Electron] Express server siap dan merespons!");
            return;
        }
    }

    throw new Error("Server Express tidak merespons di port 3000 setelah 15 detik. Pastikan port 3000 tidak terpakai oleh aplikasi lain.");
}

function createWindow() {
    const iconPath = path.join(__dirname, "../assets/icon.png");

    mainWindow = new BrowserWindow({
        width: 1260,
        height: 820,
        minWidth: 960,
        minHeight: 640,
        show: false,
        backgroundColor: "#0d0a1a",
        title: "Kak Jule V3.1 - Live Stream Assistant & Overlay",
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
            devTools: true
        }
    });

    createAppMenu();
    createSystemTray(iconPath);

    const targetUrl = "http://127.0.0.1:3000/app/index.html";

    // Tampilkan jendela segera setelah konten siap
    mainWindow.once("ready-to-show", () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    // Fallback timer: jika ready-to-show lambat, paksa tampilkan setelah 2 detik
    setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show();
        }
    }, 2000);

    let loadRetries = 0;
    const maxRetries = 10;

    // Retry otomatis jika ada keterlambatan socket di Windows
    mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
        if (errorCode === -3) return; // Aborted by user / reload

        console.warn(`⚠️ [Electron] Gagal load URL (${errorCode}: ${errorDescription}). Percobaan ke-${loadRetries + 1}/${maxRetries}...`);
        
        if (loadRetries < maxRetries) {
            loadRetries++;
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.loadURL(targetUrl);
                }
            }, 1000);
        } else {
            // Tampilkan fallback antarmuka error informatif jika koneksi gagal total
            const errorHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Kak Jule - Memulai Server</title>
                    <style>
                        body { background: #0d0a1a; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .card { background: #16122b; border: 1px solid #2e2652; border-radius: 16px; padding: 40px; max-width: 480px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
                        h2 { color: #f59e0b; margin-top: 0; }
                        p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
                        .btn { background: #6366f1; color: white; border: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; margin-top: 20px; }
                        .btn:hover { background: #4f46e5; }
                        .code { background: #090614; padding: 8px 12px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #a5b4fc; margin-top: 15px; word-break: break-all; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h2>⚠️ Menghubungkan ke Server Bot</h2>
                        <p>Server internal Kak Jule membutuhkan waktu lebih lama untuk merespons di komputer Anda.</p>
                        <div class="code">Status: ${errorDescription} (${errorCode})</div>
                        <button class="btn" onclick="location.href='${targetUrl}'">🔄 Coba Muat Ulang Sekarang</button>
                    </div>
                </body>
                </html>
            `;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(errorHtml));
            }
        }
    });

    // Muat URL dashboard
    mainWindow.loadURL(targetUrl);

    // Buka tautan target="_blank" di browser eksternal Windows (Edge/Chrome)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http://localhost:3000") || url.startsWith("http://127.0.0.1:3000")) {
            return { action: "allow" };
        }
        shell.openExternal(url);
        return { action: "deny" };
    });

    // Catatan: Peringatan lisensi ditampilkan secara interaktif dan mulus langsung di UI Desktop App
    mainWindow.webContents.on("did-finish-load", () => {
        console.log("🖥️ [Electron] Antarmuka Kak Jule Studio berhasil dimuat.");
    });

    // Saat tombol 'X' ditutup pada window, tutup aplikasi secara tuntas
    mainWindow.on("closed", () => {
        mainWindow = null;
        app.quit();
    });
}

function createAppMenu() {
    const template = [
        {
            label: "Aplikasi",
            submenu: [
                {
                    label: "Muat Ulang (Reload)",
                    accelerator: "CmdOrCtrl+R",
                    click: () => mainWindow?.reload()
                },
                {
                    label: "Layar Penuh (Toggle Fullscreen)",
                    accelerator: "F11",
                    click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen())
                },
                { type: "separator" },
                {
                    label: "Keluar",
                    accelerator: "CmdOrCtrl+Q",
                    click: () => {
                        app.isQuitting = true;
                        app.quit();
                    }
                }
            ]
        },
        {
            label: "Pengaturan",
            submenu: [
                {
                    label: "⚙️ Pengaturan Bot & API Key",
                    accelerator: "CmdOrCtrl+,",
                    click: () => {
                        mainWindow?.webContents.send("open-settings");
                    }
                },
                {
                    label: "🔑 Buka Lisensi Langganan",
                    click: () => {
                        mainWindow?.webContents.executeJavaScript("window.openLicenseModal && window.openLicenseModal()");
                    }
                }
            ]
        },
        {
            label: "OBS Tools",
            submenu: [
                {
                    label: "Salin Link Overlay Utama",
                    click: () => {
                        shell.openExternal("http://localhost:3000/overlay");
                    }
                },
                {
                    label: "Buka Leaderboard Standalone",
                    click: () => {
                        shell.openExternal("http://localhost:3000/leaderboard");
                    }
                }
            ]
        },
        {
            label: "Bantuan",
            submenu: [
                {
                    label: "Buka DevTools (F12)",
                    accelerator: "F12",
                    click: () => mainWindow?.webContents.toggleDevTools()
                },
                {
                    label: "Tentang Kak Jule V3.1",
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: "info",
                            title: "Kak Jule V3.1",
                            message: "Kak Jule Live Stream Assistant & Overlay",
                            detail: "Versi Desktop Windows 10/11\nDidukung oleh Google Gemini AI, SQLite Engine, & OBS Overlay HUD."
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function createSystemTray(iconPath) {
    try {
        tray = new Tray(iconPath);
        const contextMenu = Menu.buildFromTemplate([
            {
                label: "Tampilkan Kak Jule",
                click: () => {
                    mainWindow?.show();
                    mainWindow?.focus();
                }
            },
            {
                label: "Buka Overlay di OBS / Browser",
                click: () => {
                    shell.openExternal("http://localhost:3000/overlay");
                }
            },
            { type: "separator" },
            {
                label: "Keluar Sepenuhnya",
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                }
            }
        ]);

        tray.setToolTip("Kak Jule Live Stream Bot");
        tray.setContextMenu(contextMenu);
        tray.on("double-click", () => {
            mainWindow?.show();
            mainWindow?.focus();
        });
    } catch (err) {
        console.warn("System tray tidak dapat dibuat di lingkungan saat ini:", err.message);
    }
}

// IPC Handlers
ipcMain.on("window-minimize", () => mainWindow?.minimize());
ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});
ipcMain.on("window-close", () => mainWindow?.close());
ipcMain.on("open-external", (_, url) => {
    if (url) shell.openExternal(url);
});
ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("get-license-status", () => {
    try {
        const licenseManager = require("../core/licensing/licenseManager");
        return licenseManager.getStatus();
    } catch (err) {
        return { valid: false, reason: err.message };
    }
});

app.whenReady().then(async () => {
    try {
        await ensureServerRunning();
        createWindow();
    } catch (err) {
        console.error("❌ [Electron] Fatal Startup Error:", err);
        dialog.showErrorBox(
            "Kak Jule - Gagal Memulai Server",
            `Aplikasi tidak dapat memulai server internal bot.\n\nDetail: ${err.message}\n\nSaran Perbaikan:\n1. Pastikan port 3000 tidak sedang digunakan oleh aplikasi lain.\n2. Jika sebelumnya aplikasi berjalan di background, tutup melalui Task Manager.\n3. Coba jalankan aplikasi kembali.`
        );
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        mainWindow?.show();
    }
});

app.on("before-quit", () => {
    app.isQuitting = true;
    if (serverInstance && serverInstance.server && typeof serverInstance.server.close === "function") {
        try {
            serverInstance.server.close();
        } catch (_) {}
    }
});

app.on("window-all-closed", () => {
    app.quit();
});
