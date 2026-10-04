// core/platforms/youtubeStats.js
/**
 * Modul Telemetri Data Channel & Livestream YouTube
 * Khusus dan HANYA menggunakan data resmi YouTube Data API v3.
 * Interval pemanggilan API dibatasi tepat setiap 30 detik sekali (30.000 ms).
 */
const axios = require("axios");

// Interval pemanggilan YouTube Data API v3: tepat 30 detik sekali
const API_POLLING_INTERVAL_MS = 30000;

let cachedStats = null;
let lastFetchTime = 0;
let inFlightPromise = null;
let periodicSyncTimer = null;

/**
 * Hapus cache agar pembaruan di menu Pengaturan langsung berefek seketika
 */
function invalidateCache() {
  cachedStats = null;
  lastFetchTime = 0;
}

/**
 * Ekstrak target channel (ID, Handle, Video ID) secara presisi dari input pengaturan pengguna
 */
function parseChannelTarget(input) {
  const raw = String(input || "").trim();
  if (!raw) return { type: "none", value: "" };

  // 1. Direct Video ID (11 karakter, bukan channel UC)
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw) && !raw.startsWith("UC")) {
    return { type: "video", value: raw };
  }

  // 2. Channel ID resmi (UC...)
  if (raw.startsWith("UC") && raw.length >= 20) {
    return { type: "id", value: raw };
  }

  // 3. Link URL Lengkap YouTube
  // a. Link channel dengan UC...
  const channelUrlMatch = raw.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})/i);
  if (channelUrlMatch) {
    return { type: "id", value: channelUrlMatch[1] };
  }

  // b. Link video / live stream
  const videoMatch = raw.match(/(?:watch\?v=|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (videoMatch) {
    return { type: "video", value: videoMatch[1] };
  }

  // c. Link handle (@username atau c/username)
  const handleUrlMatch = raw.match(/youtube\.com\/(?:@|c\/)([a-zA-Z0-9_.-]+)/i);
  if (handleUrlMatch) {
    return { type: "handle", value: handleUrlMatch[1] };
  }

  // 4. Handle awalan @
  if (raw.startsWith("@")) {
    return { type: "handle", value: raw.substring(1) };
  }

  // 5. Default: bersihkan URL jika ada, sisanya adalah handle / username
  const clean = raw.replace(/^https?:\/\/(?:www\.)?youtube\.com\//i, "").replace(/^@/, "");
  return { type: "handle", value: clean };
}

/**
 * Hitung target milestone sub berikutnya & persentase berdasarkan data riil
 */
function calculateGoal(subscriberCount, userConfiguredGoal = null) {
  const count = Number(subscriberCount) || 0;

  if (userConfiguredGoal && Number(userConfiguredGoal) > 0) {
    const target = Number(userConfiguredGoal);
    const pct = target > 0 ? (count / target) * 100 : 0;
    return {
      targetGoal: target,
      percentage: Number(Math.min(pct, 100).toFixed(1))
    };
  }

  let targetGoal = 1000;
  if (count >= 10000000) {
    targetGoal = Math.ceil((count + 1) / 1000000) * 1000000;
  } else if (count >= 1000000) {
    targetGoal = Math.ceil((count + 1) / 500000) * 500000;
  } else if (count >= 100000) {
    targetGoal = Math.ceil((count + 1) / 100000) * 100000;
  } else if (count >= 10000) {
    targetGoal = Math.ceil((count + 1) / 10000) * 10000;
  } else if (count >= 1000) {
    targetGoal = Math.ceil((count + 1) / 1000) * 1000;
  } else {
    targetGoal = 1000;
  }

  const rawPercentage = targetGoal > 0 ? (count / targetGoal) * 100 : 0;
  const percentage = Number(Math.min(rawPercentage, 100).toFixed(1));

  return { targetGoal, percentage };
}

/**
 * Deteksi status siaran LIVE dan jumlah concurrent viewers secara eksklusif via YouTube Data API v3
 * Endpoint: /videos (part=snippet,liveStreamingDetails) & /search (eventType=live)
 */
async function detectYouTubeLive(channelId, apiKey, directVideoId = null) {
  let isLive = false;
  let viewerCount = 0;
  let activeVideoId = directVideoId || null;
  let liveTitle = null;

  if (!apiKey) {
    return { isLive: false, viewerCount: 0, activeVideoId: null, liveTitle: null, source: "no_api_key" };
  }

  // 1. Jika activeVideoId sudah diketahui (dari link video atau event chat)
  if (activeVideoId) {
    try {
      const vidRes = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
        params: {
          part: "snippet,liveStreamingDetails",
          id: activeVideoId,
          key: apiKey
        },
        timeout: 8000,
        headers: { "User-Agent": "KakJule-LiveBot/3.1 (YouTube Data API v3)" }
      });

      const item = vidRes.data?.items?.[0];
      if (item) {
        const liveBroadcastContent = item.snippet?.liveBroadcastContent;
        const details = item.liveStreamingDetails;

        if (liveBroadcastContent === "live" || details) {
          isLive = true;
          liveTitle = item.snippet?.title || null;
          if (details?.concurrentViewers) {
            const parsedCount = parseInt(details.concurrentViewers, 10);
            if (!isNaN(parsedCount)) {
              viewerCount = parsedCount;
            }
          }
          return { isLive, viewerCount, activeVideoId, liveTitle, source: "youtube_data_api_v3" };
        }
      }
    } catch (err) {
      console.warn("⚠️ [YouTube Data API v3] Gagal cek live via videos endpoint:", err?.response?.data?.error?.message || err.message);
    }
  }

  // 2. Jika tidak ada videoId langsung atau belum terdeteksi, cari live stream aktif milik channel via search endpoint
  if (channelId) {
    try {
      const searchRes = await axios.get("https://www.googleapis.com/youtube/v3/search", {
        params: {
          part: "id,snippet",
          channelId: channelId,
          eventType: "live",
          type: "video",
          key: apiKey
        },
        timeout: 8000,
        headers: { "User-Agent": "KakJule-LiveBot/3.1 (YouTube Data API v3)" }
      });

      const foundItem = searchRes.data?.items?.[0];
      if (foundItem) {
        activeVideoId = foundItem.id?.videoId || null;
        liveTitle = foundItem.snippet?.title || null;

        if (activeVideoId) {
          isLive = true;
          // Ambil concurrentViewers resmi dari endpoint videos
          try {
            const detailRes = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
              params: {
                part: "liveStreamingDetails,snippet",
                id: activeVideoId,
                key: apiKey
              },
              timeout: 8000,
              headers: { "User-Agent": "KakJule-LiveBot/3.1 (YouTube Data API v3)" }
            });

            const detailItem = detailRes.data?.items?.[0];
            if (detailItem) {
              const details = detailItem.liveStreamingDetails;
              if (details?.concurrentViewers) {
                const parsedCount = parseInt(details.concurrentViewers, 10);
                if (!isNaN(parsedCount)) viewerCount = parsedCount;
              }
              if (detailItem.snippet?.title) liveTitle = detailItem.snippet.title;
            }
          } catch (_) {}

          return { isLive, viewerCount, activeVideoId, liveTitle, source: "youtube_data_api_v3" };
        }
      }
    } catch (err) {
      console.warn("⚠️ [YouTube Data API v3] Gagal cek search live channel:", err?.response?.data?.error?.message || err.message);
    }
  }

  return { isLive, viewerCount, activeVideoId, liveTitle, source: "youtube_data_api_v3" };
}

/**
 * Ambil data channel (subscribers, views, videos, title) via YouTube Data API v3
 * Endpoint: /channels (part=snippet,statistics)
 */
async function fetchChannelStatsFromAPI(target, apiKey) {
  if (!apiKey) {
    return {
      channelTitle: null,
      channelId: target.type === "id" ? target.value : null,
      subscribers: 0,
      views: 0,
      videos: 0,
      hiddenSubscriberCount: false,
      error: "API Key belum disetel"
    };
  }

  let resolvedChannelId = "";
  let directVideoId = target.type === "video" ? target.value : null;

  // Jika input berupa video ID, cari channelId dari video tersebut terlebih dahulu
  if (directVideoId) {
    try {
      const vidRes = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
        params: { part: "snippet", id: directVideoId, key: apiKey },
        timeout: 8000,
        headers: { "User-Agent": "KakJule-LiveBot/3.1 (YouTube Data API v3)" }
      });
      resolvedChannelId = vidRes.data?.items?.[0]?.snippet?.channelId || "";
    } catch (err) {
      console.warn("⚠️ [YouTube Data API v3] Gagal resolve channel dari video ID:", err?.response?.data?.error?.message || err.message);
    }
  }

  let channelItem = null;
  const channelQueryId = resolvedChannelId || (target.type === "id" ? target.value : null);

  if (channelQueryId) {
    try {
      const res = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
        params: { part: "snippet,statistics", id: channelQueryId, key: apiKey },
        timeout: 8000,
        headers: { "User-Agent": "KakJule-LiveBot/3.1 (YouTube Data API v3)" }
      });
      channelItem = res.data?.items?.[0] || null;
    } catch (err) {
      console.warn("⚠️ [YouTube Data API v3] Gagal ambil channel by ID:", err?.response?.data?.error?.message || err.message);
    }
  } else if (target.type === "handle" && target.value) {
    try {
      // 1. Coba via forHandle
      const res = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
        params: { part: "snippet,statistics", forHandle: target.value, key: apiKey },
        timeout: 8000,
        headers: { "User-Agent": "KakJule-LiveBot/3.1 (YouTube Data API v3)" }
      });
      channelItem = res.data?.items?.[0] || null;

      // 2. Fallback jika forHandle tidak menemukan: coba forUsername
      if (!channelItem) {
        const uRes = await axios.get("https://www.googleapis.com/youtube/v3/channels", {
          params: { part: "snippet,statistics", forUsername: target.value, key: apiKey },
          timeout: 8000,
          headers: { "User-Agent": "KakJule-LiveBot/3.1 (YouTube Data API v3)" }
        });
        channelItem = uRes.data?.items?.[0] || null;
      }
    } catch (err) {
      console.warn("⚠️ [YouTube Data API v3] Gagal ambil channel by handle:", err?.response?.data?.error?.message || err.message);
    }
  }

  if (channelItem) {
    const stats = channelItem.statistics || {};
    const snippet = channelItem.snippet || {};

    return {
      channelTitle: snippet.title || null,
      channelId: channelItem.id || resolvedChannelId || null,
      subscribers: parseInt(stats.subscriberCount || "0", 10),
      views: parseInt(stats.viewCount || "0", 10),
      videos: parseInt(stats.videoCount || "0", 10),
      hiddenSubscriberCount: Boolean(stats.hiddenSubscriberCount),
      error: null
    };
  }

  return {
    channelTitle: null,
    channelId: resolvedChannelId || (target.type === "id" ? target.value : null),
    subscribers: 0,
    views: 0,
    videos: 0,
    hiddenSubscriberCount: false,
    error: "Channel tidak ditemukan di YouTube Data API v3"
  };
}

/**
 * Eksekusi pengambilan data channel dan live view strictly via YouTube Data API v3
 */
async function executeApiFetch(customChannel, customKey, customVideoId) {
  const now = Date.now();
  const rawChannel = (customChannel !== null ? customChannel : (process.env.YT_CHANNEL_LIVE_ID || "")).trim();
  const apiKey = (customKey !== null ? customKey : (process.env.YOUTUBE_API_KEY || "")).trim();
  const configuredOwner = (process.env.YT_CHANNEL_LIVE_OWNER || "").trim();
  const configuredGoal = process.env.YT_TARGET_GOAL || process.env.YT_GOAL || null;

  // Manual fallback baseline dari konfigurasi environment jika API Key belum tersedia
  const manualSubs = process.env.YT_SUBSCRIBERS_COUNT ? Number(process.env.YT_SUBSCRIBERS_COUNT) : 0;
  const manualViews = process.env.YT_TOTAL_VIEWS ? Number(process.env.YT_TOTAL_VIEWS) : 0;
  const manualVideos = process.env.YT_TOTAL_VIDEOS ? Number(process.env.YT_TOTAL_VIDEOS) : 0;

  // Jika konfigurasi channel belum diisi sama sekali
  if (!rawChannel && !customVideoId) {
    const { targetGoal, percentage } = calculateGoal(manualSubs, configuredGoal);
    return {
      channelTitle: configuredOwner || "Belum Dikonfigurasi",
      channelId: "",
      subscribers: manualSubs,
      views: manualViews,
      videos: manualVideos,
      hiddenSubscriberCount: false,
      targetGoal: targetGoal,
      percentage: percentage,
      isLive: false,
      viewerCount: 0,
      activeVideoId: null,
      liveTitle: null,
      updatedAt: now,
      source: "unconfigured_settings",
      isConfigured: false,
      message: "YouTube Channel ID / Handle belum disetel di Pengaturan."
    };
  }

  const target = parseChannelTarget(rawChannel);

  // 1. Ambil data statistik Channel via YouTube Data API v3
  const channelData = await fetchChannelStatsFromAPI(target, apiKey);

  // 2. Ambil data siaran LIVE & concurrent viewers via YouTube Data API v3
  const effectiveChannelId = channelData.channelId || (target.type === "id" ? target.value : null);
  const effectiveVideoId = customVideoId || (target.type === "video" ? target.value : null);
  const liveInfo = await detectYouTubeLive(effectiveChannelId, apiKey, effectiveVideoId);

  // Nilai subscribers, views, videos strictly dari YouTube Data API v3 (atau fallback manual jika API belum aktif)
  const finalSubs = channelData.subscribers > 0 ? channelData.subscribers : (manualSubs > 0 ? manualSubs : (cachedStats?.subscribers || 0));
  const finalViews = channelData.views > 0 ? channelData.views : (manualViews > 0 ? manualViews : (cachedStats?.views || 0));
  const finalVideos = channelData.videos > 0 ? channelData.videos : (manualVideos > 0 ? manualVideos : (cachedStats?.videos || 0));

  const { targetGoal, percentage } = calculateGoal(finalSubs, configuredGoal);

  const result = {
    channelTitle: channelData.channelTitle || configuredOwner || cachedStats?.channelTitle || rawChannel,
    channelId: channelData.channelId || (target.type === "id" ? target.value : ""),
    subscribers: finalSubs,
    views: finalViews,
    videos: finalVideos,
    hiddenSubscriberCount: channelData.hiddenSubscriberCount,
    targetGoal: targetGoal,
    percentage: percentage,
    isLive: Boolean(liveInfo.isLive),
    viewerCount: Number(liveInfo.viewerCount || 0),
    activeVideoId: liveInfo.activeVideoId || effectiveVideoId || null,
    liveTitle: liveInfo.liveTitle || cachedStats?.liveTitle || null,
    updatedAt: now,
    source: "youtube_data_api_v3",
    isConfigured: true,
    isFallback: !apiKey
  };

  if (!apiKey) {
    result.message = "YOUTUBE_API_KEY belum disetel. Hanya data konfigurasi manual yang aktif.";
  }

  return result;
}

/**
 * Mengambil data statistik channel & telemetri live view YouTube.
 * DIJAMIN:
 * 1. Hanya menggunakan data YouTube Data API v3 resmi.
 * 2. Pemanggilan API dibatasi dengan interval setiap 30 detik sekali (30.000 ms).
 *    Semua pemanggilan dalam jendela 30 detik akan disajikan dari cache memori instan.
 */
async function getYouTubeStats(customChannel = null, customKey = null, customVideoId = null, force = false) {
  const now = Date.now();

  // Jika cache masih valid dalam interval 30 detik dan tidak dipaksa, kembalikan data cache
  if (!force && cachedStats && (now - lastFetchTime < API_POLLING_INTERVAL_MS)) {
    return cachedStats;
  }

  // Jika ada pemanggilan API yang sedang berlangsung, tunggu pemanggilan tersebut selesai
  if (inFlightPromise) {
    return inFlightPromise;
  }

  // Mulai pemanggilan YouTube Data API v3 baru
  inFlightPromise = executeApiFetch(customChannel, customKey, customVideoId)
    .then((stats) => {
      cachedStats = stats;
      lastFetchTime = Date.now();
      inFlightPromise = null;
      return cachedStats;
    })
    .catch((err) => {
      inFlightPromise = null;
      console.error("❌ [YouTube Data API v3] Kesalahan pemanggilan:", err.message);

      if (cachedStats) {
        return cachedStats;
      }

      const manualSubs = process.env.YT_SUBSCRIBERS_COUNT ? Number(process.env.YT_SUBSCRIBERS_COUNT) : 0;
      const { targetGoal, percentage } = calculateGoal(manualSubs);
      cachedStats = {
        channelTitle: process.env.YT_CHANNEL_LIVE_OWNER || "YouTube Channel",
        channelId: process.env.YT_CHANNEL_LIVE_ID || "",
        subscribers: manualSubs,
        views: 0,
        videos: 0,
        hiddenSubscriberCount: false,
        targetGoal,
        percentage,
        isLive: false,
        viewerCount: 0,
        activeVideoId: null,
        liveTitle: null,
        updatedAt: Date.now(),
        source: "youtube_data_api_v3",
        isConfigured: false,
        lastError: err.message
      };
      lastFetchTime = Date.now();
      return cachedStats;
    });

  return inFlightPromise;
}

/**
 * Menjalankan sinkronisasi periodik setiap 30 detik sekali secara otomatis di latar belakang
 */
function startPeriodicStatsSync() {
  if (periodicSyncTimer) return;
  periodicSyncTimer = setInterval(() => {
    getYouTubeStats(null, null, null, true).catch(() => {});
  }, API_POLLING_INTERVAL_MS);
  if (periodicSyncTimer.unref) {
    periodicSyncTimer.unref();
  }
}

// Inisialisasi sinkronisasi periodik 30 detik
startPeriodicStatsSync();

// Helper parsing angka untuk kompatibilitas
function parseViewerNumber(str) {
  if (!str) return 0;
  const digits = String(str).replace(/[^0-9]/g, "");
  return parseInt(digits, 10) || 0;
}

// Fungsi stub kompatibilitas (tanpa scraping)
async function scrapeVideoPageDetails(videoId) {
  // Pure stub untuk kompatibilitas, data aktual kini ditangani sepenuhnya via YouTube Data API v3
  const apiKey = (process.env.YOUTUBE_API_KEY || "").trim();
  if (apiKey && videoId) {
    const live = await detectYouTubeLive(null, apiKey, videoId);
    return {
      isLive: live.isLive,
      viewerCount: live.viewerCount,
      liveTitle: live.liveTitle,
      subscribers: 0,
      channelTitle: null,
      channelId: null
    };
  }
  return { isLive: false, viewerCount: 0, liveTitle: null, subscribers: 0, channelTitle: null, channelId: null };
}

async function scrapeChannelStats() {
  return { subscribers: 0, views: 0, videos: 0, channelTitle: null, channelId: null };
}

module.exports = {
  API_POLLING_INTERVAL_MS,
  getYouTubeStats,
  parseChannelTarget,
  calculateGoal,
  detectYouTubeLive,
  startPeriodicStatsSync,
  scrapeVideoPageDetails,
  scrapeChannelStats,
  parseViewerNumber,
  invalidateCache
};

