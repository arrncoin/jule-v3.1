// commands/cerita.js
const storyGenerator = require("../core/ai/storyGenerator");
const cerita = require("../core/cerita/baca");
const game = require("../core/game"); // 🔧 untuk cek mutual exclusion
const logger = require("../core/utils/logger");

module.exports = async function ceritaCommands(
    cmd,
    args,
    speak,
    stopAndClear,
    isAllowed,
    sender
) {
    if (!isAllowed) return false;

    const cleanCmd = cmd.trim().toLowerCase().replace(/\s+/g, " "); // 🔧 normalisasi

    if (cleanCmd === "!cerita stop") {
        logger.warn(`⏹️ [CERITA] Cerita dihentikan oleh ${sender || "Streamer"}.`);
        logger.bot("Kak Jule: 📕 Cerita dihentikan.");
        await cerita.stop();
        speak("📕 Cerita dihentikan.", true);
        return true;
    }

    if (cleanCmd.startsWith("!cerita")) {
        // 🔧 Hentikan game dulu kalau sedang aktif, supaya tidak jalan bersamaan
        if (typeof game.isActive === "function" && game.isActive()) {
            game.stop();
            logger.info("ℹ️ [SYSTEM] Game dihentikan otomatis karena cerita dimulai.");
        }

        const topic = args.slice(1).join(" ") || "acak";

        stopAndClear();

        logger.info(`📖 [CERITA] Menyiapkan cerita tema "${topic}" dari ${sender || "Streamer"}...`);
        logger.bot(`Kak Jule: 📖 Sedang menyiapkan cerita tentang ${topic}...`);
        speak(`📖 Kak Jule sedang menyiapkan cerita tentang ${topic}...`, true);

        try {
            const story = await storyGenerator.generate(topic);

            if (!story) {
                logger.error(`❌ [CERITA] Gagal membuat cerita tema "${topic}".`);
                logger.bot("Kak Jule: ❌ Cerita gagal dibuat.");
                speak("❌ Cerita gagal dibuat.", true);
                return true;
            }

            logger.info(`✅ [CERITA] Cerita "${story.title || topic}" siap dibacakan.`);
            await cerita.playStory(story);

        } catch (err) {
            const errMsg = err.message || String(err);
            console.error("❌ Error cerita:", errMsg);
            logger.error(`❌ [CERITA] Error membuat cerita (${topic}): ${errMsg}`);
            logger.bot(`Kak Jule: ❌ Terjadi kesalahan saat membuat cerita: ${errMsg.slice(0, 50)}`);
            speak("❌ Terjadi kesalahan saat membuat cerita.", true);
        }

        return true;
    }

    return false;
};
