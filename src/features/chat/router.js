// src/features/chat/router.js
const adminGuard = require("./guards/adminGuard");
const activeGuard = require("./guards/activeGuard");
const duplicateFilter = require("./filters/duplicateFilter");
const cooldown = require("./cooldown/cooldownManager");
const shouldRespond = require("./filters/responseFilter");
const aiExecutor = require("./executor/aiExecutor");
const game = require("../quiz/engine");
const votingEngine = require("../voting");
const siapaGame = require("../game/siapa/game");
const { normalizeUser } = require("../../core/utils/helpers");
const audio = require("../audio");
const pointManager = require("../points/pointManager");
const pointRules = require("../points/pointRules");

const OWNER_CHANNEL_ID = process.env.YT_CHANNEL_LIVE_OWNER || process.env.YT_CHANNEL_LIVE_ID || "";
const OWNER_TIKTOK_ID = process.env.TIKTOK_USERNAME;

class ChatHandler {
    async process(chatItem, startTime) {
        try {
            // 0. Validasi struktur chatItem
            if (!chatItem || !chatItem.author) {
                console.error("❌ ChatHandler: chatItem/author tidak valid, dilewati.");
                return;
            }

            const message = (chatItem.cleanMessage || chatItem.message || chatItem.text || "").trim();
            if (!message) return;

            // 1. Identifikasi User
            const rawUserName = chatItem.author.name || chatItem.author.username || chatItem.author.displayName || "Unknown";
            const sender = normalizeUser(rawUserName);

            const now = Date.now();

            // 2. Cek Role (Owner Only / Pengelola di Chat Router)
            const currentYtOwner = (process.env.YT_CHANNEL_LIVE_OWNER || process.env.YT_CHANNEL_LIVE_ID || "").trim();
            const currentTtOwner = (process.env.TIKTOK_USERNAME || "").trim();

            const cleanYtOwner = currentYtOwner.replace(/^@/, "").toLowerCase();
            const cleanTtOwner = currentTtOwner.replace(/^@/, "").toLowerCase();
            const authorChannelId = (chatItem.author.channelId || "").toLowerCase();
            const authorName = (chatItem.author.name || "").toLowerCase();
            const authorUniqueId = (chatItem.author.uniqueId || "").toLowerCase();

            const isOwner =
                (cleanYtOwner && (authorChannelId === cleanYtOwner || authorName === cleanYtOwner)) ||
                chatItem.author.isOwner === true ||
                chatItem.author.isChatOwner === true ||
                (cleanTtOwner && (authorUniqueId === cleanTtOwner || authorName === cleanTtOwner));

            const isAdmin =
                isOwner ||
                chatItem.author.isChatModerator === true ||
                chatItem.author.isModerator === true ||
                chatItem.author.isAdmin === true;

            const isCommand = message.startsWith("!");

            const platform = chatItem.platform || (chatItem.author && chatItem.author.channelId ? "youtube" : "tiktok");

            // 3. Context Payload
            const ctx = { 
                message, 
                userName: rawUserName, 
                sender, 
                isOwner, 
                isAdmin,
                isAllowed: isOwner || isAdmin,
                platform,
                author: chatItem.author,
                chatItem
            };

            // ==========================================
            // 💰 1. INTERACTION POINTS CHAT (SETIAP KOMENTAR +1 POIN)
            // ==========================================
            // Setiap komentar chat/interaksi valid menambah 1 poin dan memastikan user terdata di database
            if (pointManager.canReceivePoints(ctx, "chat")) {
                try {
                    pointManager.addPoints(ctx, pointRules.POINTS.CHAT || 1, "chat", "Komentar chat live stream");
                } catch (err) {
                    console.error("❌ [POINTS ERROR] Gagal menambah poin chat:", err.message);
                }
            }

            // ==========================================
            // 🛡️ 2. ADMIN / OWNER / CHAT COMMANDS
            // ==========================================
            if (isCommand) {
                const adminResult = await adminGuard(ctx);
                if (adminResult.stop) return; 
            }

            // ==========================================
            // ⚡ 3. SIAPA SURVIVAL GAME CHECK (Input dari Viewer)
            // ==========================================
            if (siapaGame.isActive()) {
                if (siapaGame.isLobby() && message.toLowerCase() === "join") {
                    siapaGame.join(sender);
                    return;
                }
                if (siapaGame.status === "running") {
                    const cleanMsg = message.toLowerCase().trim();
                    if (cleanMsg === "kiri" || cleanMsg === "kanan" || /^[1-5]$/.test(cleanMsg)) {
                        siapaGame.handlePlayerInput(sender, cleanMsg);
                        return;
                    }
                }
            }

            // ==========================================
            // 🗳️ 4. VOTING CHECK (Input dari Viewer)
            // ==========================================
            if (votingEngine.isActive()) {
                votingEngine.castVote(sender, message);
                return;
            }

            // ==========================================
            // 🎮 4. GAME CHECK (Input dari Viewer)
            // ==========================================
            if (game.isActive()) {
                const userPayload = {
                    name: rawUserName,
                    platform,
                    author: chatItem.author
                };
                const result = game.checkAnswer(userPayload, message);
                if (result && result.correct) {
                    console.log(`✅ ${result.user} benar (+${result.point})`);
                }
                return;
            }

            // ==========================================
            // 📖 4. GUARDS & FILTER CHAT BIASA
            // ==========================================
            if (!activeGuard()) return;

            if (audio.isStoryActive()) {
                console.log("⏳ [ROUTER] Cerita sedang dibaca, AI tidak dipanggil.");
                return;
            }

            if (!duplicateFilter.check(rawUserName, message)) return;
            if (!cooldown.check(rawUserName, now, isCommand)) return;
            if (!shouldRespond(message, isCommand)) return;

            // ==========================================
            // 🤖 5. EXECUTE AI
            // ==========================================
            aiExecutor.run(rawUserName, message);

        } catch (err) {
            console.error("❌ ChatHandler Error:", err.stack || err.message);
        }
    }
}

module.exports = new ChatHandler();