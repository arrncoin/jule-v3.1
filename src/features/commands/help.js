// src/features/commands/help.js
const logger = require("../../core/logger/logger");

module.exports = function helpCommands(cmd, speak, isAllowed, sender) {
    if (!cmd || typeof cmd !== "string") return false;

    const clean = cmd.trim().toLowerCase().split(/\s+/)[0];
    const helpVerbs = ["!bantuan", "!help", "!perintah", "!menu", "!cmd"];

    if (!helpVerbs.includes(clean)) return false;

    if (isAllowed) {
        // Panduan lengkap untuk Streamer / Owner / Admin
        const textToSpeak = "Halo Kak! Perintah streamer yang aktif: jule on atau jule off, tanda seru siapa untuk survival battle royale, soal untuk tebak kata, cerita untuk dongeng A I, vote untuk voting, dan tanda seru top untuk klasemen!";
        const consoleHelp = `📋 DAFTAR PERINTAH STREAMER/ADMIN:
• !jule on / !jule off : Menyalakan / mematikan bot
• !siapa [detik] : Memulai game survival livechat Siapa Yang Akan Bertahan
• !siapa stop / status / reset : Kontrol arena game Siapa
• !siapa top : Leaderboard survival game Siapa
• !soal [tema] : Memulai game kuis tebak kata (contoh: !soal hewan, !soal anime)
• !stop : Menghentikan game kuis tebak kata
• !cerita [tema] : Membacakan cerita/dongeng AI bersuara
• !vote [opsi1, opsi2] : Membuka polling voting penonton
• !vote stop : Menutup voting & mengumumkan hasil
• !top : Menampilkan leaderboard 5 besar di overlay OBS
• !poin [username] : Cek poin streamer atau penonton lain`;

        speak(textToSpeak, true);
        logger.info(consoleHelp);
        logger.bot("Kak Jule: " + textToSpeak);
        return true;
    } else {
        // Panduan untuk Penonton / Viewer
        const textToSpeak = "Halo! Perintah yang bisa kamu pakai: ketik tanda seru join saat game Siapa dibuka, tanda seru poin untuk cek poin, tanda seru rank untuk cek peringkat, dan jawab langsung di chat saat kuis tebak kata atau voting ya!";
        const consoleHelp = `📋 PANDUAN PENONTON:
• !join : Bergabung ke survival game Siapa Yang Akan Bertahan
• !kiri / !kanan / !pilih 1-5 : Aksi tantangan arena Siapa
• !poin : Cek jumlah poin dan level kamu
• !rank : Cek peringkat kamu di papan klasemen
• !bantuan : Menampilkan panduan perintah bot
• Kuis Tebak Kata : Ketik langsung jawabanmu di live chat
• Polling Live : Ketik nama atau nomor opsi pilihanmu di chat`;

        speak(textToSpeak, true);
        logger.info(consoleHelp);
        logger.bot("Kak Jule: " + textToSpeak);
        return true;
    }
};
