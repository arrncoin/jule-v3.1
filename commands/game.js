// commands/game.js
const generator = require("../core/ai/generator");
const game = require("../core/game");
const logger = require("../core/utils/logger");
const context = require("../utils/context");

let currentSessionId = 0;

function cancelGamePreparation() {
    currentSessionId++;
}

async function gameCommands(
    cmd,
    args,
    speak,
    stopAndClear,
    isAllowed,
    sender
) {
    if (!isAllowed) return false;

    // 🔧 Normalisasi sekali di sini, konsisten dengan owner.js
    const cleanCmd = cmd.trim().toLowerCase().replace(/\s+/g, " ");

    // Mulai game
    if (cleanCmd.startsWith("!soal") || cleanCmd.startsWith("!tebakkata")) {
        const topic = args.slice(1).join(" ") || "umum";

        stopAndClear();
        const sessionId = ++currentSessionId;

        logger.info(`🎮 [GAME] Perintah !soal tema "${topic}" diterima dari ${sender || "Streamer"}.`);
        logger.bot(`Kak Jule: ⏳ Lagi nyiapin soal tema ${topic}...`);
        speak(`⏳ Lagi nyiapin soal tema ${topic}...`, true);

        try {
            await generator.resetQuestions();
            let questions = await generator.generateSeason(topic);

            // Cek apakah bot atau sesi game sudah dibatalkan saat sedang menunggu AI
            if (sessionId !== currentSessionId || !context.isActive) {
                logger.warn(`⚠️ [GAME] Pembuatan soal tema "${topic}" dibatalkan karena bot/game dihentikan.`);
                return true;
            }

            if (!questions || !questions.length) {
                logger.warn(`⚠️ [GAME] AI tidak menghasilkan soal, memuat soal cadangan dari disk...`);
                questions = await generator.loadQuestions();
            }

            if (!questions || !questions.length) {
                logger.error(`❌ [GAME] Soal kosong atau disk tidak memiliki soal valid.`);
                logger.bot("Kak Jule: ❌ Gagal bikin soal, coba lagi!");
                speak("❌ Gagal bikin soal, coba lagi!", true);
                return true;
            }

            logger.info(`🚀 [GAME] Memulai game tebak kata dengan ${questions.length} soal tema "${topic}"!`);
            game.start(questions);
        } catch (err) {
            if (sessionId !== currentSessionId || !context.isActive) {
                return true;
            }
            const errMsg = err.message || "Error tidak diketahui";
            console.error("❌ Gagal generate soal game:", errMsg);
            logger.error(`❌ [GAME] Gagal generate soal (${topic}): ${errMsg}`);
            logger.bot(`Kak Jule: ❌ Ada error pas nyiapin soal: ${errMsg.slice(0, 60)}`);
            speak(`❌ Ada error pas nyiapin soal: ${errMsg.slice(0, 60)}, coba lagi ya!`, true);
        }

        return true;
    }

    // Stop game - Mendukung beragam variasi perintah stop
    const isStopCmd = [
        "!stop soal",
        "!stopsoal",
        "!stop tebak kata",
        "!stop game",
        "!stopgame",
        "!stop",
        "!soal stop",
        "!game stop"
    ].includes(cleanCmd);

    if (isStopCmd) {
        cancelGamePreparation();
        logger.warn(`⏹️ [GAME] Game tebak kata dihentikan oleh ${sender || "Streamer"}.`);
        logger.bot("Kak Jule: 🎮 Game dihentikan.");
        game.stop();
        stopAndClear();
        speak("🎮 Game dihentikan.", true);
        return true;
    }

    return false;
}

gameCommands.cancelPreparation = cancelGamePreparation;
module.exports = gameCommands;

