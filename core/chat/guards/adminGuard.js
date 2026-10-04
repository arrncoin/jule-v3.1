// core/chat/guards/adminGuard.js
const adminCmd = require("../../../commands/admin");

module.exports = async function adminGuard(ctx) {
    const { message, isOwner, sender } = ctx;

    try {
        const handled = await adminCmd.handle(message, isOwner, sender, ctx);

        if (handled) {
            return { stop: true, reason: "admin_command" };
        }

        return { stop: false };

    } catch (err) {
        console.error("❌ adminGuard error:", err.message);

        // 🔧 Pesan ini pasti diawali "!" (sudah difilter isCommand di router.js).
        // Kalau gagal diproses sebagai command, tetap hentikan pipeline
        // supaya teks command mentah tidak bocor ke AI/game sebagai chat biasa.
        return { stop: true, reason: "admin_command_error" };
    }
};