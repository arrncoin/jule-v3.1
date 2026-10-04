// overlay/sub.js - Kak Jule Live Stream HUD Telemetry Engine (V3.1)

function getBaseServerUrl() {
  if (typeof window !== "undefined" && window.location) {
    const protocol = window.location.protocol;
    if (protocol === "http:" || protocol === "https:") {
      return window.location.origin;
    }
  }
  return "http://127.0.0.1:3000";
}

const SERVER_BASE_URL = getBaseServerUrl();
const SUB_STATS_URL = `${SERVER_BASE_URL}/api/sub-stats`;
const REFRESH_RATE = 30000; // Interval pemanggilan setiap 30 detik sekali (30.000 ms) sesuai ketentuan YouTube Data API v3

let hasRenderedInitialData = false;

/**
 * Update teks elemen DOM secara aman dengan indikator status
 */
function setElementText(id, text, isLive = false, isYt = false) {
  const el = document.getElementById(id);
  if (!el) return;

  if (id === "yt-viewer-count" || id === "tt-viewer-count") {
    const parent = el.closest(".live-item");
    const liveClass = isYt ? "is-live-yt" : "is-live";

    if (isLive && text !== "Offline" && text !== "Error" && text !== "Loading..." && text !== "—") {
      el.innerHTML = `<span class="live-dot"></span>${text}`;
      if (parent) parent.classList.add(liveClass);
    } else {
      el.innerHTML = `<span class="live-dot"></span>${text}`;
      if (parent) parent.classList.remove(liveClass);
    }
  } else {
    el.innerText = text;
  }
}

/**
 * Render data statistik strictly dari konfigurasi & hasil sinkronisasi backend
 */
function renderStatsData(data) {
  if (!data) return;

  const yt = data.youtube || {};
  const ch = data.channel || {};
  const tt = data.tiktok || {};

  const subCount = Number(yt.subscribers ?? ch.subscribers ?? 0);
  const views = Number(yt.views ?? ch.views ?? 0);
  const videos = Number(yt.videos ?? ch.videos ?? 0);

  const isConfigured = Boolean(
    data.channelConfig?.channelId ||
    data.channelConfig?.isConfigured ||
    yt.isConfigured ||
    ch.isConfigured ||
    subCount > 0 ||
    views > 0 ||
    videos > 0
  );

  // 1. YouTube Subscriber Count
  if (subCount > 0) {
    setElementText("sub-count", subCount.toLocaleString("id-ID"));
  } else if (yt.hiddenSubscriberCount) {
    setElementText("sub-count", "Disembunyikan");
  } else {
    setElementText("sub-count", isConfigured ? "0" : "—");
  }

  // 2. Target Goal & Persentase
  const targetGoal = Number(yt.targetGoal ?? ch.targetGoal ?? 0);
  const percentage = Number(yt.percentage ?? ch.percentage ?? 0);
  const progressFill = document.getElementById("progress-fill");

  if (targetGoal > 0) {
    setElementText("sub-percentage", `${percentage}% dari ${targetGoal.toLocaleString("id-ID")}`);
    if (progressFill) {
      progressFill.style.width = `${Math.min(percentage, 100)}%`;
    }
  } else {
    setElementText("sub-percentage", isConfigured ? "0% target" : "Belum Disetel");
    if (progressFill) {
      progressFill.style.width = "0%";
    }
  }

  // 3. Total Views
  if (views > 0) {
    setElementText("total-views", views.toLocaleString("id-ID"));
  } else {
    setElementText("total-views", isConfigured ? "0" : "—");
  }

  // 4. Total Videos
  if (videos > 0) {
    setElementText("total-videos", videos.toLocaleString("id-ID"));
  } else {
    setElementText("total-videos", isConfigured ? "0" : "—");
  }

  // 5. YouTube Live Viewers
  if (yt.isLive) {
    const vCount = Number(yt.viewerCount ?? yt.viewers ?? 0);
    const displayText = vCount > 0 ? vCount.toLocaleString("id-ID") : "0";
    setElementText("yt-viewer-count", displayText, true, true);
  } else {
    setElementText("yt-viewer-count", "Offline", false, true);
  }

  // 6. TikTok Live Viewers
  if (tt.isLive) {
    const vCount = Number(tt.viewerCount ?? tt.viewers ?? 0);
    const displayText = vCount > 0 ? vCount.toLocaleString("id-ID") : "0";
    setElementText("tt-viewer-count", displayText, true, false);
  } else {
    setElementText("tt-viewer-count", "Offline", false, false);
  }

  hasRenderedInitialData = true;
}

/**
 * Ambil semua data statistik secara terpadu dari endpoint /api/sub-stats
 */
async function syncAllTelemetry() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(SUB_STATS_URL, {
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      renderStatsData(data);
      return true;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("[Kak Jule HUD] Gagal sinkronisasi telemetri:", err.message);
  }

  // Jika server lokal belum siap / koneksi putus, hindari teks tetap "Loading..."
  if (!hasRenderedInitialData) {
    applyStandbyState();
  }

  return false;
}

/**
 * Tampilkan status siaga jika backend belum merespons
 */
function applyStandbyState() {
  setElementText("sub-count", "—");
  setElementText("sub-percentage", "Siaga");
  setElementText("total-views", "—");
  setElementText("total-videos", "—");
  setElementText("yt-viewer-count", "Offline", false, true);
  setElementText("tt-viewer-count", "Offline", false, false);

  const progressFill = document.getElementById("progress-fill");
  if (progressFill) {
    progressFill.style.width = "0%";
  }

  hasRenderedInitialData = true;
}

// 1. Eksekusi sinkronisasi data awal
syncAllTelemetry();

// 2. Proteksi Anti-Hang (maksimal 1 detik)
setTimeout(() => {
  if (!hasRenderedInitialData) {
    applyStandbyState();
  }
}, 1000);

// 3. Polling realtime berkala
setInterval(syncAllTelemetry, REFRESH_RATE);
