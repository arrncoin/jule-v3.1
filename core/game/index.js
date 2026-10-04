// core/game/index.js
const game = require("./engine");
const audio = require("../audio");
const logger = require("../utils/logger");

const speak = (text) => {
    try {
        if (!text || typeof text !== "string") return;
        audio.addToQueue(text);
    } catch (err) {
        console.error("❌ Gagal menambahkan TTS ke queue:", err.message);
    }
};

game.on("event", (data) => {
    try {
        if (!data || !data.type) return;

        switch (data.type) {
            case "question": {
                const introText = data.no === 1 ? "Soal siap! Tebak tebakan dimulai. " : "";
                const clueText = data.clue || "soal berikutnya";
                const questionText = `${introText}Soal Nomor ${data.no}. ${clueText}. Waktu ${data.time || 20} detik dimulai!`;

                logger.info(`🎮 [GAME] Soal #${data.no}: "${clueText}"`);
                logger.bot(`Kak Jule: Soal #${data.no}: ${clueText}`);

                // 🔧 Timer 20 detik baru dimulai SETELAH TTS baca soal
                audio.addToQueue({
                    text: questionText,
                    onEnd: () => {
                        try {
                            if (
                                typeof game.isActive === "function" &&
                                game.isActive() &&
                                typeof game.startTimer === "function"
                            ) {
                                game.startTimer();
                            }
                        } catch (err) {
                            console.error("❌ Gagal memulai timer game:", err.message);
                        }
                    }
                });
                break;
            }

            case "result": {
                const answerText = data.answer || "tidak ada jawaban";
                const winners = Array.isArray(data.winners) ? data.winners : (data.winner ? [{ name: data.winner }] : []);
                let winnerMsg = "";
                let voiceResult = "";
                if (winners.length > 0) {
                    const pts = winners[0].point || 5;
                    const winnerNames = winners.map(w => `@${w.name}`).join(", ");
                    winnerMsg = `Dijawab benar oleh ${winnerNames} (+${pts} poin)!`;
                    voiceResult = `Waktu habis! Jawabannya adalah ${answerText}. Selamat untuk ${winners[0].name} yang berhasil menebak benar dan dapat ${pts} poin!`;
                } else {
                    winnerMsg = "Waktu habis, belum ada yang menebak dengan benar.";
                    voiceResult = `Waktu habis! Jawabannya adalah ${answerText}. Sayang sekali belum ada yang menebak dengan tepat.`;
                }
                logger.info(`🎯 [GAME] Jawaban: "${answerText}" | ${winnerMsg}`);
                logger.bot(`Kak Jule: ${voiceResult}`);
                speak(voiceResult);
                break;
            }

            case "leaderboard": {
                const ranking = data.data || [];

                if (ranking.length === 0) {
                    logger.info("🏆 [GAME] Permainan selesai, tidak ada pemenang.");
                    logger.bot("Kak Jule: Permainan selesai! Sayang sekali tidak ada pemenang kali ini.");
                    speak("Permainan selesai! Sayang sekali tidak ada pemenang kali ini.");
                } else {
                    const topList = ranking.slice(0, 3).map((p, i) => `#${i + 1} ${p.name} (${p.score} poin)`).join(", ");
                    logger.info(`🏆 [GAME] Pemenang: ${topList}`);

                    let textLeaderboard = "Permainan selesai! Berikut adalah para pemenang. ";

                    ranking.slice(0, 3).forEach((player, index) => {
                        const posisi = index + 1;
                        const name = player.name || "Pemain";
                        const score = player.score ?? 0;
                        textLeaderboard += `Juara ${posisi}, ${name} dengan ${score} poin. `;
                    });

                    textLeaderboard += "Selamat kepada para pemenang dan terima kasih sudah bermain!";
                    logger.bot(`Kak Jule: ${textLeaderboard}`);
                    speak(textLeaderboard);
                }
                break;
            }

            case "stopped":
                logger.warn("⏹️ [GAME] Permainan dihentikan.");
                logger.bot("Kak Jule: Permainan dihentikan.");
                speak("Permainan dihentikan.");
                break;

            default:
                break;
        }
    } catch (err) {
        console.error("❌ Error di game event listener:", err.message);
    }
});

module.exports = game;
