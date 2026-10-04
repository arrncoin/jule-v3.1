// commands/points.js
// Viewer Commands: !poin, !rank, !top / !leaderboard
const pointManager = require("../core/points/pointManager");
const overlayState = require("../core/utils/overlayState");
const logger = require("../core/utils/logger");

let leaderboardTimer = null;

// ==========================================
// 🛡️ ANTI-SPAM & RATE LIMIT CONFIGURATION
// ==========================================
const GLOBAL_LIMIT_PER_MINUTE = 30;         // Maksimal 30 panggilan per menit
const GLOBAL_WINDOW_MS = 60 * 1000;         // Jendela 1 menit (60.000 ms)
const USER_COOLDOWN_MS = 15 * 1000;         // 1 user cooldown 15 detik (bisa cek kembali setelah menang game/poin)

const recentGlobalCalls = [];               // Antrean timestamp pemanggilan global [ts1, ts2, ...]
const userLastCallMap = new Map();          // Map userKey -> timestamp pemanggilan terakhir

/**
 * Format angka ke format ribuan Indonesia (contoh: 12.450)
 */
function formatNumber(num = 0) {
    return Number(num || 0).toLocaleString("id-ID");
}

/**
 * Helper update state overlay secara aman (non-blocking)
 */
function updateOverlayState(data) {
    return overlayState.set(data);
}

/**
 * Cek apakah mode game, tebak-tebakan, atau soal sedang aktif
 */
function isGameOrQuestionActive() {
    // 1. Cek Game Engine Tebak Kata
    try {
        const game = require("../core/game/engine");
        if (game && typeof game.isActive === "function" && game.isActive()) {
            return true;
        }
    } catch (_) {}

    // 2. Cek PAZ Puzzle Game
    try {
        const paz = require("../core/game/paz");
        if (paz && paz.running) {
            return true;
        }
    } catch (_) {}

    // 3. Cek Context State Global
    try {
        const context = require("../utils/context");
        if (context && (context.isGameActive || context.gamePhase === "question" || context.gamePhase === "rolling")) {
            return true;
        }
    } catch (_) {}

    // 4. Cek Overlay State
    try {
        const current = overlayState.get();
        if (current && (current.mode === "game" || current.mode === "paz" || current.mode === "soal")) {
            return true;
        }
    } catch (_) {}

    return false;
}

/**
 * Ambil kunci unik user untuk rate limiting
 */
function getUserKey(ctx, userPayload) {
    const rawKey =
        (ctx.author && (ctx.author.channelId || ctx.author.uniqueId || ctx.author.platformUserId || ctx.author.id)) ||
        ctx.platformUserId ||
        ctx.channelId ||
        ctx.uniqueId ||
        userPayload.name ||
        ctx.userName ||
        ctx.sender ||
        "anonymous";
    return String(rawKey).trim().toLowerCase();
}

async function pointCommands(cmd, speak, ctx = {}) {
    if (!cmd || typeof cmd !== "string") return false;

    const trimmed = cmd.trim();
    const parts = trimmed.split(/\s+/);
    const cleanCmd = parts[0].toLowerCase();
    const subCmd = (parts[1] || "").toLowerCase();

    // Identifikasi user dari context (mendukung chatItem, sender, author)
    const userPayload = {
        platform: ctx.platform || (ctx.author && ctx.author.channelId ? "youtube" : "tiktok"),
        author: ctx.author || {
            name: ctx.userName || ctx.sender,
            channelId: ctx.channelId,
            uniqueId: ctx.uniqueId
        },
        name: ctx.userName || ctx.sender
    };

    const isPrivileged = Boolean(ctx.isOwner || ctx.isAdmin || ctx.isAllowed);

    // =========================================================================
    // 1 & 2. PERINTAH !poin / !points DAN !rank / !peringkat
    // =========================================================================
    if (
        cleanCmd === "!poin" ||
        cleanCmd === "!points" ||
        cleanCmd === "!rank" ||
        cleanCmd === "!peringkat"
    ) {
        // ATURAN 1: Jangan biarkan penonton mengecek !poin atau !rank saat mode soal/tebakan aktif
        if (isGameOrQuestionActive() && !isPrivileged) {
            console.log(`⏳ [POINTS] Perintah ${cleanCmd} dari @${userPayload.name} diabaikan: Mode game tebak-tebakan / soal sedang berlangsung.`);
            return true; // Diserap agar tidak memadati antrean suara dan tidak bocor ke game/AI
        }

        // ATURAN 2: Mode Idle - Hanya menangani 4 user dalam 1 menit dan setiap user hanya 1x dalam 5 menit
        if (!isPrivileged) {
            const now = Date.now();
            const userKey = getUserKey(ctx, userPayload);

            // Cek per-user cooldown: 1x dalam 5 menit (300.000 ms)
            const lastUserCall = userLastCallMap.get(userKey) || 0;
            if (now - lastUserCall < USER_COOLDOWN_MS) {
                const remainingSec = Math.ceil((USER_COOLDOWN_MS - (now - lastUserCall)) / 1000);
                console.log(`⏱️ [POINTS COOLDOWN] @${userPayload.name} dibatasi: !poin/!rank hanya bisa dipanggil 1x per 5 menit (sisa ${remainingSec} detik).`);
                return true; // Diserap tanpa respons suara
            }

            // Bersihkan antrean timestamp global yang lebih tua dari 1 menit
            while (recentGlobalCalls.length > 0 && now - recentGlobalCalls[0] > GLOBAL_WINDOW_MS) {
                recentGlobalCalls.shift();
            }

            // Cek kuota global: Maksimal 4 user dalam 1 menit
            if (recentGlobalCalls.length >= GLOBAL_LIMIT_PER_MINUTE) {
                console.log(`🚫 [POINTS RATE LIMIT] Kuota antrian global penuh (maks ${GLOBAL_LIMIT_PER_MINUTE} user/menit). Perintah ${cleanCmd} dari @${userPayload.name} diabaikan.`);
                return true; // Diserap tanpa respons suara
            }

            // Lolos pemeriksaan rate limit -> catat waktu pemanggilan
            recentGlobalCalls.push(now);
            userLastCallMap.set(userKey, now);

            // Bersihkan memori userLastCallMap berkala jika terlalu besar
            if (userLastCallMap.size > 300) {
                const cutoff = now - (10 * 60 * 1000);
                for (const [key, time] of userLastCallMap.entries()) {
                    if (time < cutoff) userLastCallMap.delete(key);
                }
            }
        }

        // --- Eksekusi !poin ---
        if (cleanCmd === "!poin" || cleanCmd === "!points") {
            const targetQuery = parts.slice(1).join(" ").trim().replace(/^@/, "");
            let queryUser = userPayload;
            if (targetQuery && targetQuery.toLowerCase() !== "me" && targetQuery.toLowerCase() !== "saya") {
                queryUser = {
                    platform: ctx.platform || "youtube",
                    platformUserId: targetQuery,
                    username: targetQuery,
                    name: targetQuery
                };
            }

            const data = pointManager.getPoints(queryUser);
            const name = data.displayName || data.username || targetQuery || ctx.userName || "Viewer";
            const pointsFormatted = formatNumber(data.points);
            const rankText = data.rank ? `#${data.rank}` : "-";

            const textResponse = [
                `🎣 ${name}`,
                `💰 Poin: ${pointsFormatted}`,
                `🏆 Rank: ${rankText}`,
                `⭐ Level: ${data.level || 1}`
            ].join("\n");

            console.log(`\n${textResponse}\n`);
            logger.bot(`[POIN] ${name}: ${pointsFormatted} Poin | Peringkat ${rankText} | Level ${data.level || 1}`);

            if (typeof speak === "function") {
                speak(`Poin ${name}: ${pointsFormatted} poin, peringkat ${rankText}, level ${data.level || 1}`);
            }
            return true;
        }

        // --- Eksekusi !rank ---
        if (cleanCmd === "!rank" || cleanCmd === "!peringkat") {
            const targetQuery = parts.slice(1).join(" ").trim().replace(/^@/, "");
            let queryUser = userPayload;
            if (targetQuery && targetQuery.toLowerCase() !== "me" && targetQuery.toLowerCase() !== "saya") {
                queryUser = {
                    platform: ctx.platform || "youtube",
                    platformUserId: targetQuery,
                    username: targetQuery,
                    name: targetQuery
                };
            }

            const data = pointManager.getPoints(queryUser);
            const name = data.displayName || data.username || targetQuery || ctx.userName || "Viewer";
            const pointsFormatted = formatNumber(data.points);
            const rankNumber = data.rank || 1;

            const textResponse = [
                `🏆 ${name} berada di peringkat #${rankNumber}`,
                `💰 ${pointsFormatted} poin`
            ].join("\n");

            console.log(`\n${textResponse}\n`);
            logger.bot(`[RANK] ${name}: Peringkat #${rankNumber} dengan ${pointsFormatted} Poin`);

            if (typeof speak === "function") {
                speak(`${name} berada di peringkat ${rankNumber} dengan ${pointsFormatted} poin`);
            }
            return true;
        }
    }

    // =========================================================================
    // 3 & 4. PERINTAH !top / !top5 / !top10 / !leaderboard (KHUSUS ADMIN / OWNER)
    // =========================================================================
    if (
        cleanCmd === "!top" ||
        cleanCmd === "!top5" ||
        cleanCmd === "!top10" ||
        cleanCmd === "!leaderboard"
    ) {
        // ATURAN 3: Fungsi !top hanya bisa dipanggil oleh admin atau owner
        if (!isPrivileged) {
            console.log(`🔒 [COMMAND] Perintah ${cleanCmd} dari @${userPayload.name} ditolak: Perintah !top hanya bisa dipanggil oleh admin atau owner.`);
            return true; // Diserap agar tidak memicu AI chat atau mengganggu stream
        }

        // Perintah Tutup/Hide Leaderboard Layar: !top hide / !top stop / !top close
        if (subCmd === "hide" || subCmd === "stop" || subCmd === "close") {
            if (leaderboardTimer) {
                clearTimeout(leaderboardTimer);
                leaderboardTimer = null;
            }
            await updateOverlayState({ mode: "dashboard", type: "idle" });
            console.log("📺 [OVERLAY] Leaderboard ditutup manual oleh admin/owner.");
            if (typeof speak === "function") {
                speak("Leaderboard ditutup dari layar.", true);
            }
            return true;
        }

        const limit = cleanCmd === "!top10" || subCmd === "10" ? 10 : 5;
        const topList = pointManager.getLeaderboard(limit);

        const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
        let lines = [`🏆 TOP ${limit} LEADERBOARD`];

        if (!topList || topList.length === 0) {
            lines.push("Belum ada data perolehan poin.");
        } else {
            topList.forEach((u, i) => {
                const medal = medals[i] || `${i + 1}️⃣`;
                const padName = (u.displayName || u.username).padEnd(12, " ");
                lines.push(`${medal} ${padName} ${formatNumber(u.points)}`);
            });
        }

        const textResponse = lines.join("\n");
        console.log(`\n${textResponse}\n`);
        logger.bot(textResponse);

        // Update Overlay Layar OBS otomatis ke mode 'leaderboard'
        const now = Date.now();
        await updateOverlayState({
            mode: "leaderboard",
            title: `TOP ${limit} LEADERBOARD`,
            leaderboard: topList,
            updatedAt: now
        });
        console.log(`📺 [OVERLAY] Mode leaderboard diaktifkan pada layar OBS selama 25 detik oleh admin/owner.`);

        // Atur timer otomatis mengembalikan layar ke dashboard setelah 25 detik
        if (leaderboardTimer) {
            clearTimeout(leaderboardTimer);
        }
        leaderboardTimer = setTimeout(() => {
            try {
                const current = overlayState.get();
                // Hanya revert jika layar masih menampilkan leaderboard (jangan timpa bila sedang ada game/voting)
                if (current && current.mode === "leaderboard") {
                    overlayState.reset("dashboard", "Menunggu aktivitas...");
                    console.log("📺 [OVERLAY] Layar otomatis kembali ke standby dashboard.");
                }
            } catch (_) {
            }
        }, 25000);
        if (leaderboardTimer && typeof leaderboardTimer.unref === "function") {
            leaderboardTimer.unref();
        }

        // Suara TTS respon: umumkan peringkat top secara detail & informatif
        if (typeof speak === "function") {
            if (!topList || topList.length === 0) {
                speak("Belum ada viewer yang mengumpulkan poin. Yuk aktif di live stream!", true);
            } else if (topList.length === 1) {
                const top1 = topList[0];
                speak(`Top 1 saat ini adalah ${top1.displayName || top1.username} dengan ${formatNumber(top1.points)} poin! Klasemen tampil di layar.`, true);
            } else if (topList.length === 2) {
                const u1 = topList[0];
                const u2 = topList[1];
                speak(`Top klasemen saat ini: Juara 1 ${u1.displayName || u1.username} dengan ${formatNumber(u1.points)} poin, disusul ${u2.displayName || u2.username} ${formatNumber(u2.points)} poin.`, true);
            } else {
                const u1 = topList[0];
                const u2 = topList[1];
                const u3 = topList[2];
                speak(`Top klasemen saat ini: Juara 1 ${u1.displayName || u1.username} ${formatNumber(u1.points)} poin, Juara 2 ${u2.displayName || u2.username} ${formatNumber(u2.points)} poin, dan Juara 3 ${u3.displayName || u3.username} ${formatNumber(u3.points)} poin!`, true);
            }
        }
        return true;
    }

    return false;
}

pointCommands.resetCooldowns = function () {
    recentGlobalCalls.length = 0;
    userLastCallMap.clear();
};

module.exports = pointCommands;
