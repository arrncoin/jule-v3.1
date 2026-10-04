// src/features/commands/siapa.js
// Command Handler for SIAPA Interactive Survival Livechat Game
const siapaGame = require("../game/siapa/game");
const storage = require("../game/siapa/storage");
const logger = require("../../core/logger/logger");

module.exports = async function handleSiapa(cmd, args, speak, stopAndClear, isAllowed, sender, ctx = {}) {
    if (!cmd || typeof cmd !== "string") return false;

    const trimmed = cmd.trim();
    const cleanLower = trimmed.toLowerCase();
    const parts = cleanLower.split(/\s+/);
    const verb = parts[0];

    // Hubungkan audio speak jika belum
    siapaGame.setSpeakHandler(speak);

    // =========================================================================
    // 1. COMMAND UTAMA: !siapa (Lobby, Stop, Status, Reset, Top)
    // =========================================================================
    if (verb === "!siapa") {
        const sub = parts[1];

        // 1.1 Leaderboard: !siapa top / !siapa leaderboard
        if (sub === "top" || sub === "leaderboard" || sub === "rank") {
            const topList = storage.getLeaderboard(5);
            if (topList.length === 0) {
                speak("Belum ada data klasemen untuk game Siapa. Yuk mainkan sekarang dengan ketik tanda seru siapa!", true);
                return true;
            }

            let text = "🏆 SIAPA LEADERBOARD:\n";
            topList.forEach((p, idx) => {
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
                text += `${medal} ${p.username} - ${p.totalPoints} pts (${p.wins} Wins)\n`;
            });
            logger.info(text);
            speak(`Klasemen teratas game Siapa: Peringkat satu dipegang oleh ${topList[0].username} dengan total ${topList[0].totalPoints} poin!`, true);
            return true;
        }

        // 1.2 Status: !siapa status
        if (sub === "status") {
            const state = siapaGame.getPublicState();
            if (!siapaGame.isActive()) {
                speak("Game Siapa saat ini tidak aktif. Ketik tanda seru siapa untuk membuka arena baru.", true);
                return true;
            }

            const elapsedSec = Math.floor((Date.now() - (siapaGame.gameStartedAt || Date.now())) / 1000);
            const m = Math.floor(elapsedSec / 60);
            const s = elapsedSec % 60;
            const timeStr = `${m}:${s < 10 ? "0" : ""}${s}`;

            const statusMsg = `SIAPA STATUS:
Status : ${state.status.toUpperCase()}
Ronde  : ${state.round}/${state.totalRounds}
Total  : ${state.players} Pemain
Alive  : ${state.alive} Bertahan
Durasi : ${timeStr}`;

            logger.info(statusMsg);
            speak(`Status game Siapa: Ronde ${state.round} dari ${state.totalRounds}, tersisa ${state.alive} pemain bertahan.`);
            return true;
        }

        // 1.3 Stop: !siapa stop (Admin / Owner Only)
        if (sub === "stop" || sub === "selesai" || sub === "batal") {
            if (!isAllowed) {
                speak("Perintah menghentikan game Siapa hanya bisa dijalankan oleh streamer atau admin.", true);
                return true;
            }
            const res = siapaGame.stop(sender);
            speak(res.message, true);
            return true;
        }

        // 1.4 Reset: !siapa reset (Admin / Owner Only)
        if (sub === "reset") {
            if (!isAllowed) {
                speak("Perintah reset game Siapa hanya bisa dijalankan oleh streamer atau admin.", true);
                return true;
            }
            const res = siapaGame.reset();
            speak(res.message, true);
            return true;
        }

        // 1.5 Start Lobby: !siapa [custom_seconds] (Admin / Owner / Streamer)
        if (!isAllowed) {
            speak("Arena Siapa Yang Akan Bertahan hanya bisa dimulai oleh streamer atau moderator.", true);
            return true;
        }

        if (siapaGame.isActive()) {
            speak("⚠️ Game SIAPA sedang berlangsung! Tunggu sampai game selesai.", true);
            return true;
        }

        const customSeconds = Number(sub) || 20;
        const result = siapaGame.startLobby(sender, customSeconds);
        if (!result.success) {
            speak(result.message, true);
        }
        return true;
    }

    // =========================================================================
    // 2. COMMAND PENONTON: !join
    // =========================================================================
    if (verb === "!join" || verb === "!gabung" || verb === "!masuk") {
        if (!siapaGame.isActive()) {
            // Jika game belum dimulai sama sekali
            return false;
        }

        if (!siapaGame.isLobby()) {
            logger.warn(`[SIAPA] @${sender} mencoba !join namun pendaftaran sudah ditutup.`);
            return true; // Diserap agar tidak bocor ke command lain
        }

        const joinResult = siapaGame.join(sender);
        if (joinResult.success) {
            // Suara atau notifikasi opsional (tidak perlu TTS berisik per join agar stream lancar)
            logger.info(`✅ [SIAPA] @${sender} bergabung! Total: ${joinResult.totalPlayers}`);
        }
        return true;
    }

    // =========================================================================
    // 3. COMMAND TANTANGAN / CHALLENGE RONDE (!kiri, !kanan, !pilih)
    // =========================================================================
    if (siapaGame.isActive() && siapaGame.status === "running") {
        if (verb === "!kiri" || verb === "!kanan") {
            const side = verb.replace("!", "");
            siapaGame.handlePlayerInput(sender, side);
            return true;
        }

        if (verb === "!pilih") {
            const chosen = parts[1] || "";
            if (chosen) {
                siapaGame.handlePlayerInput(sender, chosen);
                return true;
            }
        }
    }

    return false;
};
