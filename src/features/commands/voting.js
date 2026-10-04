// src/features/commands/voting.js
const votingEngine = require("../voting");
const logger = require("../../core/logger/logger");

module.exports = async function handleVoting(cmd, args, speak, stopAndClear, isAllowed, sender) {
    if (!cmd || typeof cmd !== "string") return false;

    const trimmed = cmd.trim();
    const firstSpace = trimmed.indexOf(" ");
    const verb = (firstSpace === -1 ? trimmed : trimmed.substring(0, firstSpace)).toLowerCase();
    const rawArgs = (firstSpace === -1 ? "" : trimmed.substring(firstSpace + 1)).trim();

    const allowedVerbs = ["!vote", "!voting", "!vot", "!fot"];
    if (!allowedVerbs.includes(verb)) {
        return false;
    }

    if (!isAllowed) {
        speak("Perintah voting hanya bisa dimulai oleh admin atau owner stream.", true);
        return true;
    }

    const lowerArgs = rawArgs.toLowerCase();

    if (lowerArgs === "stop" || lowerArgs === "selesai" || lowerArgs === "tutup") {
        logger.warn(`⏹️ [VOTING] Sesi voting dihentikan oleh ${sender || "Streamer"}.`);
        logger.bot("Kak Jule: ⏹️ Voting dihentikan.");
        const stopRes = votingEngine.stop();
        if (!stopRes || !stopRes.success) {
            speak("ℹ️ Tidak ada sesi voting yang sedang berlangsung.", true);
        }
        return true;
    }

    if (!rawArgs) {
        logger.warn("⚠️ [VOTING] Opsi voting belum diisi.");
        speak("❌ Opsi voting belum diisi. Contoh: !vote Marvel, DC atau ketik !vote stop untuk berhenti.", true);
        return true;
    }

    logger.info(`🗳️ [VOTING] Memulai voting baru: "${rawArgs}" oleh ${sender || "Streamer"}`);
    const res = votingEngine.start(rawArgs);
    if (!res.success) {
        logger.error(`❌ [VOTING] Gagal mulai: ${res.message}`);
        speak(`❌ Gagal mulai voting: ${res.message || "minimal 2 opsi dipisah koma."}`, true);
    } else {
        logger.info("🗳️ [VOTING] Voting aktif! Penonton dapat mengetik nomor atau nama opsi untuk memilih.");
    }

    return true;
};
