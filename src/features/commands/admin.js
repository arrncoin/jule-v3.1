// src/features/commands/admin.js
const context = require("../../core/state/context");
const audio = require("../audio");

const ownerCommands = require("./owner");
const gameCommands = require("./game");
const ceritaCommands = require("./cerita");
const votingCommands = require("./voting");
const pointCommands = require("./points");
const helpCommands = require("./help");
const siapaCommands = require("./siapa");

const { normalizeUser } = require("../../core/utils/helpers");

/**
 * Helper fungsi untuk mengeluarkan audio
 */
function speak(text, priority = false) {
    if (!text) return;
    audio.speak(text, priority);
}

/**
 * Helper fungsi untuk menghentikan seluruh audio
 */
function stopAndClear() {
    audio.stop();
}

module.exports = {
    async handle(message, isOwner, userName, ctx = {}) {
        try {
            if (!message || typeof message !== "string") return false;

            const cmd = message.trim(); // Kirim string asli, biarkan sub-command yang merapikan
            const args = message.trim().split(/\s+/);

            const sender = normalizeUser(userName);
            const isAdmin = Boolean(isOwner || ctx.isAdmin || ctx.isAllowed);
            const isAllowed = isAdmin;

            // 1. Cek Perintah Owner (!jule on, !jule off, dll)
            const handledByOwner = await ownerCommands(cmd, speak, stopAndClear, isOwner, sender);
            if (handledByOwner) return true;

            // 2. Cek Perintah Poin & Leaderboard Viewer (!poin, !rank, !top)
            const handledByPoints = await pointCommands(cmd, speak, { ...ctx, isOwner, isAdmin, isAllowed, userName, sender });
            if (handledByPoints) return true;

            // 3. Cek Perintah Bantuan & Panduan (!bantuan, !help, !perintah, !menu)
            const handledByHelp = helpCommands(cmd, speak, isAllowed, sender);
            if (handledByHelp) return true;

            // 4. Cek Perintah Game SIAPA Survival (!siapa, !join, !kiri, !kanan, !pilih)
            const handledBySiapa = await siapaCommands(cmd, args, speak, stopAndClear, isAllowed, sender, ctx);
            if (handledBySiapa) return true;

            // 5. Jika status bot belum aktif (isActive = false), stop perintah lainnya
            if (!context.isActive) return false;

            // 6. Cek Perintah Game Tebak Kata
            const handledByGame = await gameCommands(cmd, args, speak, stopAndClear, isAllowed, sender);
            if (handledByGame) return true;

            // 7. Cek Perintah Cerita
            const handledByCerita = await ceritaCommands(cmd, args, speak, stopAndClear, isAllowed, sender);
            if (handledByCerita) return true;

            // 8. Cek Perintah Voting (!vote / !fot / !vot)
            const handledByVoting = await votingCommands(cmd, args, speak, stopAndClear, isAllowed, sender);
            if (handledByVoting) return true;

            return false;
        } catch (error) {
            console.error("❌ Error in Admin Handler:", error);
            return false;
        }
    }
};