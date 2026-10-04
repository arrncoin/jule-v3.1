// tiktok-viewer.js
// ==========================================
// TikTok Live Viewer Count Tracker & State Manager
// ==========================================
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const STATE_PATH = path.join(__dirname, "state", "tiktok.json");
const RECONNECT_DELAY = 15000; // 15 detik jika belum/putus live

let currentState = { isLive: false, viewerCount: 0, updatedAt: Date.now() };

let lastDiskMtime = 0;

function syncStateFromDisk() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const stats = fs.statSync(STATE_PATH);
      if (stats.mtimeMs > lastDiskMtime) {
        lastDiskMtime = stats.mtimeMs;
        const raw = fs.readFileSync(STATE_PATH, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          currentState = { ...currentState, ...parsed };
        }
      }
    }
  } catch (_) {}
}

// Baca state yang tersimpan di disk saat pertama kali dimuat
syncStateFromDisk();

// Penulisan file secara aman (Atomic Write)
function writeState(partial) {
  currentState = { ...currentState, ...partial, updatedAt: Date.now() };
  const targetDir = path.dirname(STATE_PATH);

  try {
    fs.mkdirSync(targetDir, { recursive: true });

    const tempPath = `${STATE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(currentState, null, 2), "utf8");
    fs.renameSync(tempPath, STATE_PATH); // Mengganti file secara atomic
    try {
      lastDiskMtime = fs.statSync(STATE_PATH).mtimeMs;
    } catch (_) {}
  } catch (err) {
    console.error("[tiktok-viewer] Gagal menulis file state:", err?.message || err);
  }
  return currentState;
}

function getState() {
  syncStateFromDisk();
  return currentState;
}

let liveInstance = null;
let reconnectTimeout = null;
let isRunning = false;

async function start() {
  if (isRunning && liveInstance) {
    return;
  }

  const rawUsername = process.env.TIKTOK_USERNAME || "";
  const TIKTOK_USERNAME = rawUsername.replace(/^@/, "").trim();
  const TIKTOOLS_API_KEY = (process.env.TIKTOOLS_API_KEY || "").trim();

  if (!TIKTOOLS_API_KEY) {
    console.warn("[tiktok-viewer] TIKTOOLS_API_KEY belum diset di environment. Mode pasif/simulasi aktif.");
    return;
  }

  if (!TIKTOK_USERNAME) {
    console.warn("[tiktok-viewer] TIKTOK_USERNAME kosong atau belum diset.");
    return;
  }

  isRunning = true;
  let TikTokLiveClass = null;

  try {
    const tiktoolMod = await import("@tiktool/live");
    TikTokLiveClass = tiktoolMod.TikTokLive;
  } catch (err) {
    console.error("[tiktok-viewer] Gagal memuat library @tiktool/live:", err?.message || err);
    return;
  }

  function safeReconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (liveInstance) {
      try {
        liveInstance.disconnect();
      } catch (_) {}
      liveInstance = null;
    }
    if (!isRunning) return;
    reconnectTimeout = setTimeout(connect, RECONNECT_DELAY);
  }

  function connect() {
    if (!isRunning) return;

    try {
      liveInstance = new TikTokLiveClass({
        uniqueId: TIKTOK_USERNAME,
        apiKey: TIKTOOLS_API_KEY,
      });

      liveInstance.on("connected", () => {
        console.log(`[tiktok-viewer] Terhubung ke live stream @${TIKTOK_USERNAME}`);
        writeState({ isLive: true });
      });

      liveInstance.on("roomUserSeq", (e) => {
        const viewerCount = Number(e?.viewerCount ?? e?.memberCount ?? 0);
        writeState({ isLive: true, viewerCount });
      });

      liveInstance.on("streamEnd", () => {
        console.log("[tiktok-viewer] Livestream berakhir, menjadwalkan cek ulang...");
        writeState({ isLive: false, viewerCount: 0 });
        safeReconnect();
      });

      liveInstance.on("disconnected", () => {
        console.log("[tiktok-viewer] Terputus dari stream TikTok.");
        writeState({ isLive: false, viewerCount: 0 });
        safeReconnect();
      });

      liveInstance.on("error", (err) => {
        console.error("[tiktok-viewer] Error:", err?.message || err);
        writeState({ isLive: false, viewerCount: 0 });
        safeReconnect();
      });

      liveInstance.connect().catch((err) => {
        console.log(
          `[tiktok-viewer] Belum live (@${TIKTOK_USERNAME}), coba lagi dalam ${RECONNECT_DELAY / 1000}s:`,
          err?.message || err
        );
        writeState({ isLive: false, viewerCount: 0 });
        safeReconnect();
      });
    } catch (err) {
      console.error("[tiktok-viewer] Inisialisasi connector gagal:", err?.message || err);
      safeReconnect();
    }
  }

  connect();
}

function stop() {
  isRunning = false;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (liveInstance) {
    try {
      liveInstance.disconnect();
    } catch (_) {}
    liveInstance = null;
  }
}

// Jalankan otomatis jika dipanggil langsung via CLI: node tiktok-viewer.js
if (require.main === module) {
  start();
}

module.exports = {
  start,
  stop,
  getState,
  writeState,
  STATE_PATH,
};
