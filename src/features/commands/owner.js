// src/features/commands/owner.js
const context = require("../../core/state/context");
const game = require("../quiz/engine");
const cerita = require("../story/storyPlayer");
const votingEngine = require("../voting");
const logger = require("../../core/logger/logger");

module.exports = function ownerCommands(cmd, speak, stopAndClear, isOwner, sender) {
    if (!isOwner) return false;

    // Normalisasi command: hapus '!' di depan dan ubah ke lowercase
    const cleanCmd = (cmd.startsWith('!') ? cmd.slice(1) : cmd).trim().toLowerCase();

    // Perintah Mematikan Bot
    if (cleanCmd === "jule off" || cleanCmd === "jule turu" || cleanCmd === "stop bot" || cleanCmd === "bot off") {
        try {
            const gameCmd = require("./game");
            if (gameCmd && typeof gameCmd.cancelPreparation === "function") {
                gameCmd.cancelPreparation();
            }
        } catch (_) {}

        if (typeof game.stop === "function") game.stop();
        if (typeof cerita.stop === "function") cerita.stop();
        if (typeof votingEngine.stop === "function") votingEngine.stop();

        try {
            const paz = require("../quiz/paz");
            if (paz && typeof paz.stop === "function") paz.stop({ reason: "bot_stopped", silent: true });
        } catch (_) {}

        stopAndClear();

        context.updateStatus({
            isActive: false,
            isGameActive: false
        });

        const streamerGreeting = sender ? `Kak ${sender}` : "Kak";
        speak(`Oke ${streamerGreeting}, Kak Jule pamit istirahat dulu ya. Sampai jumpa lagi semuanya!`, true);

        logger.warn(`⏹️ [SYSTEM] Bot dinonaktifkan oleh ${sender}.`);
        logger.bot(`Kak Jule: Pamit istirahat dulu ya ${streamerGreeting}. Sampai jumpa lagi!`);
        return true;
    }

    // Perintah Menyalakan Bot
    if (cleanCmd === "jule on" || cleanCmd === "jule kerja" || cleanCmd === "bot on" || cleanCmd === "start bot") {
        stopAndClear();
        context.updateStatus({ isActive: true });
        const streamerGreeting = sender ? `Kak ${sender}` : "semuanya";
        speak(`Siap! Kak Jule balik kerja lagi buat nemenin ${streamerGreeting}. Halo semuanya!`, true);

        logger.info(`▶️ [SYSTEM] Bot diaktifkan oleh ${sender}.`);
        logger.bot(`Kak Jule: Siap! Kak Jule balik kerja lagi buat nemenin ${streamerGreeting}.`);
        return true;
    }

    // Cek Status Bot
    if (cleanCmd === "jule status" || cleanCmd === "status") {
        const statusText = `Kak Jule saat ini ${context.isActive ? "aktif" : "istirahat"}, mode ${context.mood || "santai"}, audio ${context.audioMode || "standard"}.`;
        speak(statusText, true);
        logger.info(`ℹ️ [STATUS] ${statusText}`);
        logger.bot(`Kak Jule: ${statusText}`);
        return true;
    }

    // Aktifkan Audio PRO
    if (cleanCmd === "jule pro") {
        stopAndClear();
        context.audioMode = "pro";
        speak("Audio Pro berhasil diaktifkan.", true);
        logger.info(`🔊 [AUDIO] Mode audio diubah ke PRO oleh ${sender}.`);
        return true;
    }

    // Aktifkan Audio Standard
    if (cleanCmd === "jule std" || cleanCmd === "jule standard") {
        stopAndClear();
        context.audioMode = "standard";
        speak("Audio standard berhasil diaktifkan.", true);
        logger.info(`🔊 [AUDIO] Mode audio diubah ke STANDARD oleh ${sender}.`);
        return true;
    }

    // Mode-Mode Jule
    if (cleanCmd === "jule judes" || cleanCmd === "jule jutek" || cleanCmd === "jule galak") {
        stopAndClear();
        context.mood = "judes banget";
        speak("Gue ganti mode judes banget niiiih, siap siap loe pada menangis kejang kejang.", true);
        logger.info(`🎭 [MOOD] Mode diubah ke JUDES oleh ${sender}.`);
        return true;
    }

    if (cleanCmd === "jule genit") {
        stopAndClear();
        context.mood = "genit";
        speak("Mode Jule genit berhasil diaktifkan, siap siap lu pada bucin.", true);
        logger.info(`🎭 [MOOD] Mode diubah ke GENIT oleh ${sender}.`);
        return true;
    }

    if (cleanCmd === "jule roasting") {
        stopAndClear();
        context.mood = "roasting";
        speak("Mode Jule roasting berhasil diaktifkan.", true);
        logger.info(`🎭 [MOOD] Mode diubah ke ROASTING oleh ${sender}.`);
        return true;
    }

    if (cleanCmd === "jule guru") {
        stopAndClear();
        context.mood = "guru";
        speak("Mode Jule guru berhasil diaktifkan.", true);
        logger.info(`🎭 [MOOD] Mode diubah ke GURU oleh ${sender}.`);
        return true;
    }

    if (cleanCmd === "jule cek khodam") {
        stopAndClear();
        context.mood = "cek khodam";
        speak("Mode Jule cek khodam berhasil diaktifkan.", true);
        logger.info(`🎭 [MOOD] Mode diubah ke CEK KHODAM oleh ${sender}.`);
        return true;
    }

    if (cleanCmd === "jule santai") {
        stopAndClear();
        context.mood = "santai";
        speak("Mode Jule santai berhasil diaktifkan.", true);
        logger.info(`🎭 [MOOD] Mode diubah ke SANTAI oleh ${sender}.`);
        return true;
    }

    return false;
};
