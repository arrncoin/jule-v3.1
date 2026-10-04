// src/config/index.js
// Centralized Configuration Management
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { getWritablePath, getAppRootPath } = require("../core/utils/paths");

let isLoaded = false;

function loadEnvironment() {
    const candidatePaths = new Set();

    // 1. Root project .env
    candidatePaths.add(getAppRootPath(".env"));

    // 2. User data directory (khusus Electron installer)
    candidatePaths.add(getWritablePath(".env"));

    // 3. Folder eksekusi saat ini (CWD)
    candidatePaths.add(path.join(process.cwd(), ".env"));

    // 4. Folder di samping file .exe
    if (process.execPath) {
        candidatePaths.add(path.join(path.dirname(process.execPath), ".env"));
    }

    // 5. Folder resources Electron
    if (process.resourcesPath) {
        candidatePaths.add(path.join(process.resourcesPath, ".env"));
    }

    let loadedAny = false;
    for (const envPath of candidatePaths) {
        try {
            if (fs.existsSync(envPath)) {
                dotenv.config({ path: envPath, quiet: true });
                loadedAny = true;
            }
        } catch (_) {}
    }

    if (!process.env.GEMINI_MODEL) {
        process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    }

    isLoaded = true;
    return loadedAny;
}

function saveConfigVariable(key, value) {
    process.env[key] = value;

    const targets = new Set([
        getWritablePath(".env"),
        getAppRootPath(".env"),
        path.join(process.cwd(), ".env")
    ]);

    let anySaved = false;
    for (const targetEnvPath of targets) {
        try {
            const dir = path.dirname(targetEnvPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            let content = "";
            if (fs.existsSync(targetEnvPath)) {
                content = fs.readFileSync(targetEnvPath, "utf8");
            }

            const regex = new RegExp(`^${key}=.*$`, "m");
            if (regex.test(content)) {
                content = content.replace(regex, `${key}=${value}`);
            } else {
                content = (content.trim() ? content.trim() + "\n" : "") + `${key}=${value}\n`;
            }

            fs.writeFileSync(targetEnvPath, content, "utf8");
            anySaved = true;
        } catch (err) {
            console.warn(`⚠️ Gagal menulis ke ${targetEnvPath}:`, err.message);
        }
    }

    return anySaved;
}

// Load automatically once on require
if (!isLoaded) {
    loadEnvironment();
}

const config = {
    loadEnvironment,
    saveConfigVariable,

    get port() {
        return parseInt(process.env.PORT || "3000", 10);
    },
    get geminiApiKey() {
        return (process.env.GEMINI_API_KEY || "").trim();
    },
    get geminiModel() {
        return (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim();
    },
    get ytChannelLiveId() {
        return (process.env.YT_CHANNEL_LIVE_ID || "").trim();
    },
    get ytChannelLiveOwner() {
        return (process.env.YT_CHANNEL_LIVE_OWNER || process.env.YT_CHANNEL_LIVE_ID || "").trim();
    },
    get youtubeApiKey() {
        return (process.env.YOUTUBE_API_KEY || "").trim();
    },
    get tiktokUsername() {
        return (process.env.TIKTOK_USERNAME || "").trim().replace(/^@/, "");
    },
    get tiktoolsApiKey() {
        return (process.env.TIKTOOLS_API_KEY || "").trim();
    },
    get voiceSpeed() {
        return (process.env.VOICE_SPEED || "normal").trim();
    },
    get audioProvider() {
        return (process.env.AUDIO_PROVIDER || "standard").trim();
    },
    get ytSubscribersCount() {
        return (process.env.YT_SUBSCRIBERS_COUNT || "").trim();
    },
    get ytTotalViews() {
        return (process.env.YT_TOTAL_VIEWS || "").trim();
    },
    get ytTotalVideos() {
        return (process.env.YT_TOTAL_VIDEOS || "").trim();
    },
    get ytTargetGoal() {
        return (process.env.YT_TARGET_GOAL || "1000").trim();
    },

    getMaskedGeminiKey() {
        const key = this.geminiApiKey;
        if (!key) return "";
        if (key.length <= 8) return "Terpasang (Hidden)";
        return `${key.slice(0, 6)}...${key.slice(-4)}`;
    },

    toPublicJSON() {
        return {
            geminiKey: this.geminiApiKey,
            geminiApiKey: this.geminiApiKey,
            geminiKeySet: Boolean(this.geminiApiKey),
            geminiMasked: this.getMaskedGeminiKey(),
            ytChannelLiveId: this.ytChannelLiveId,
            ytChannelLiveOwner: this.ytChannelLiveOwner,
            channelId: this.ytChannelLiveId,
            ytChannelId: this.ytChannelLiveId,
            youtubeApiKey: this.youtubeApiKey,
            ytApiKey: this.youtubeApiKey,
            ytSubscribersCount: this.ytSubscribersCount,
            ytTotalViews: this.ytTotalViews,
            ytTotalVideos: this.ytTotalVideos,
            ytTargetGoal: this.ytTargetGoal,
            tiktokUsername: this.tiktokUsername,
            tiktoolsApiKey: this.tiktoolsApiKey,
            model: this.geminiModel,
            geminiModel: this.geminiModel,
            voiceSpeed: this.voiceSpeed,
            audioMode: this.audioProvider
        };
    }
};

module.exports = config;
