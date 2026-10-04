// overlay/script.js
console.log("🚀 Overlay Router Ready");

const app = document.getElementById("app");

const pages = {};
let currentMode = "";
let currentModule = null;
let lastHash = "";

const DEFAULT_POLL_INTERVAL_MS = 600;
const SCRIPT_LOAD_TIMEOUT_MS = 8000; // 🔧 jaga-jaga kalau script gagal load & tidak fire onload/onerror

/**
 * Daftar halaman overlay
 */
const modules = {

    dashboard: {
        html: "dashboard.html",
        css: "dashboard.css",
        js: "dashboard.js",
        global: "DashboardOverlay"
    },

    game: {
        html: "soal.html",
        css: "soal.css",
        js: "soal.js",
        global: "SoalOverlay"
    },

    voting: {
        html: "voting.html",
        css: "voting.css",
        js: "voting.js",
        global: "VotingOverlay"
    },

    story: {
        html: "cerita.html",
        css: "cerita.css",
        js: "cerita.js",
        global: "CeritaOverlay"
    },

    leaderboard: {
        html: "leaderboard.html",
        css: "leaderboard.css",
        js: "leaderboard.js",
        global: "LeaderboardOverlay"
    },

    siapa: {
        html: "siapa/index.html",
        css: "siapa/style.css",
        js: "siapa/app.js",
        global: "SiapaOverlay"
    }

};

// Helper untuk memastikan file asset overlay selalu diarahkan ke path absolut /overlay/
function resolveOverlayAsset(file) {
    if (!file) return "";
    if (file.startsWith("http://") || file.startsWith("https://") || file.startsWith("/")) {
        return file;
    }
    return "/overlay/" + file.replace(/^\/+/, "");
}

// =====================================
// CSS
// =====================================

function loadCSS(file) {
    const resolved = resolveOverlayAsset(file);
    let link = document.getElementById("page-style");

    if (!link) {
        link = document.createElement("link");
        link.id = "page-style";
        link.rel = "stylesheet";
        document.head.appendChild(link);
    }

    if (!link.href.includes(file))
        link.href = resolved + "?v=" + Date.now();
}

// =====================================
// HTML
// =====================================

async function loadHTML(file) {
    const resolved = resolveOverlayAsset(file);

    if (pages[resolved])
        return pages[resolved];

    const res = await fetch(resolved);

    if (!res.ok) {
        throw new Error(`Gagal memuat ${resolved}: HTTP ${res.status}`);
    }

    const html = await res.text();

    pages[resolved] = html;

    return html;
}

// =====================================
// JS
// =====================================

async function loadJS(file) {
    const resolved = resolveOverlayAsset(file);
    const old = document.getElementById("page-script");

    if (old)
        old.remove();

    const script = document.createElement("script");

    script.id = "page-script";
    script.src = resolved + "?v=" + Date.now();

    document.body.appendChild(script);

    // 🔧 Sekarang menangani error load & ada timeout, supaya tidak nyangkut selamanya
    await new Promise((resolve, reject) => {

        const timeout = setTimeout(() => {
            reject(new Error(`Timeout memuat script: ${file}`));
        }, SCRIPT_LOAD_TIMEOUT_MS);

        script.onload = () => {
            clearTimeout(timeout);
            resolve();
        };

        script.onerror = () => {
            clearTimeout(timeout);
            reject(new Error(`Gagal memuat script: ${file}`));
        };

    });
}

// =====================================
// Ganti Halaman
// =====================================

async function changeMode(mode) {

    if (mode === currentMode)
        return;

    const page = modules[mode];

    if (!page)
        return;

    console.log("➡️ Switch:", mode);

    // 🔧 Bersihkan modul sebelumnya kalau dia punya method destroy/cleanup,
    // supaya tidak ada timer/listener lama yang nyangkut di background.
    if (typeof currentModule?.destroy === "function") {
        try { currentModule.destroy(); } catch (e) { console.error("Gagal destroy modul lama:", e); }
    }

    loadCSS(page.css);

    app.innerHTML = await loadHTML(page.html);

    await loadJS(page.js);

    currentModule = window[page.global];

    if (typeof currentModule?.init === "function")
        currentModule.init();

    currentMode = mode;
}

// =====================================
// Fetch Overlay
// =====================================

let consecutiveFailures = 0;

function isTransientNetworkError(err) {
    if (!err) return true;
    if (err.name === "AbortError") return true;
    const msg = (err.message || "").toLowerCase();
    return (
        msg.includes("failed to fetch") ||
        msg.includes("networkerror") ||
        msg.includes("load failed") ||
        msg.includes("network request failed") ||
        msg.includes("is not valid json") ||
        err instanceof TypeError
    );
}

async function fetchOverlay() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
        const basePath = "/state/overlay.json";
        const url = `${basePath}?ts=${Date.now()}`;

        const res = await fetch(url, {
            signal: controller.signal,
            cache: "no-store"
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            consecutiveFailures++;
            return;
        }

        const contentType = res.headers.get("content-type") || "";
        // Jika server mengembalikan HTML (misalnya gateway dev server sedang warming up), lewati cycle ini
        if (!contentType.includes("application/json") && !contentType.includes("text/plain")) {
            return;
        }

        const rawText = await res.text();
        const trimmed = (rawText || "").trim();

        // Jaga-jaga jika respons diawali tag HTML (misal <!doctype html>)
        if (!trimmed || trimmed.startsWith("<")) {
            return;
        }

        let data;
        try {
            data = JSON.parse(trimmed);
        } catch (_) {
            return; // Payload bukan JSON utuh, lewati cycle ini
        }

        // Pembacaan berhasil
        consecutiveFailures = 0;

        const hash = JSON.stringify(data);

        if (hash === lastHash)
            return;

        // 🔧 lastHash BARU di-update setelah proses berhasil sepenuhnya (lihat bawah),
        // supaya kalau ada error, polling berikutnya akan mencoba ulang data yang sama.

        await changeMode(data.mode || "dashboard");

        if (typeof currentModule?.update === "function") {
            currentModule.update(data);
        }

        lastHash = hash; // 🔧 baru dicatat setelah semua langkah di atas sukses

    } catch (err) {
        clearTimeout(timeoutId);
        consecutiveFailures++;

        // Abaikan abort/network error sesaat tanpa logging console.error
        if (isTransientNetworkError(err)) {
            return;
        }

        console.warn("⚠️ [OVERLAY] fetchOverlay warning:", err.message || err);
    }
}

// 🔧 Recursive setTimeout, bukan setInterval — memastikan tidak ada
// pemanggilan fetchOverlay() yang overlap dan mendukung backoff saat koneksi terputus
async function pollLoop() {
    await fetchOverlay();
    // Jika koneksi sempat putus, gunakan backoff agar tidak membombardir browser
    const nextInterval = consecutiveFailures > 0
        ? Math.min(3000, DEFAULT_POLL_INTERVAL_MS + consecutiveFailures * 400)
        : DEFAULT_POLL_INTERVAL_MS;
    setTimeout(pollLoop, nextInterval);
}

pollLoop();