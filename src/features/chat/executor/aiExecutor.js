// src/features/chat/executor/aiExecutor.js
const ai = require("../../../integrations/gemini/index");
const context = require("../../../core/state/context");
const audio = require("../../audio");
const audioPro = require("../../audio/pro");
const logger = require("../../../core/logger/logger");

const AI_TIMEOUT_MS = 25000; // 🔧 Batas waktu tunggu AI 25 detik (menghindari timeout dini pada lonjakan jaringan)

class AIExecutor {
    constructor() {
        this.running = 0;
        this.max = 3;
    }

    _getFallbackResponse(userName, message) {
        const cleanName = (userName || "kamu").replace(/^@/, "").trim();
        const lower = (message || "").toLowerCase();

        // Sapaan
        if (lower.includes("halo") || lower.includes("hai") || lower.includes("pagi") || lower.includes("siang") || lower.includes("malam")) {
            const greetings = [
                `Halo ${cleanName}! Salam kenal ya, selamat bergabung di live streaming!`,
                `Hai ${cleanName}! Senang banget kamu mampir ke live kita!`,
                `Halo ${cleanName}, semoga harimu seru dan menyenangkan ya!`
            ];
            return greetings[Math.floor(Math.random() * greetings.length)];
        }

        // Pertanyaan nama/identitas
        if (lower.includes("siapa") || lower.includes("nama")) {
            return `Aku Kak Jule, asisten virtual dan co-host live di sini! Salam kenal ya ${cleanName}!`;
        }

        // Pertanyaan aktivitas
        if (lower.includes("lagi apa") || lower.includes("ngapain")) {
            return `Kak Jule lagi nemenin live bareng ${cleanName} dan penonton lainnya nih!`;
        }

        // Respons ramah umum agar penonton tidak dicueki saat AI sibuk/timeout
        const fallbacks = [
            `Iya ${cleanName}, Kak Jule denger kok! Makasih ya udah ikutan chat!`,
            `Halo ${cleanName}, iya ada apa tuh? Coba tanya lagi dong!`,
            `Eh ${cleanName}, kenapa tuh panggil-panggil Kak Jule?`,
            `Hadir ${cleanName}! Kak Jule lagi standby di sini kok!`,
            `Iya ${cleanName}, sinyalku agak ngelag dikit nih, tapi aku dengerin kamu kok!`
        ];
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    async run(userName, message) {
        if (this.running >= this.max) {
            console.log("⚠️ AI overload, antrean penuh...");
            logger.warn(`⚠️ [AI] Antrean AI penuh, pesan dari ${userName} dilewati sementara.`);
            return;
        }

        this.running++;

        try {
            // 🔧 Timeout guard dengan toleransi 25 detik
            const res = await Promise.race([
                ai.generateResponse(userName, message),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("AI response timeout")), AI_TIMEOUT_MS)
                ),
            ]);

            const finalResponse = (res && typeof res === "string" && res.trim()) 
                ? res.trim() 
                : this._getFallbackResponse(userName, message);

            const mode = (context.audioMode || "standard").toString();
            console.log(`🤖 [${mode.toUpperCase()}] ${userName} → ${finalResponse}`);
            logger.bot(`Kak Jule: ${finalResponse}`);

            const provider = mode === "pro" ? audioPro : audio;
            provider.addToQueue(finalResponse);

        } catch (err) {
            console.warn(`⚠️ [AI] ${err.message} untuk ${userName}. Menggunakan respon cadangan Kak Jule.`);
            logger.warn(`⚠️ [AI] Respons AI mengalami kendala (${err.message}), beralih ke respon cadangan untuk ${userName}.`);

            // 🔧 Fallback: Pastikan penonton tetap mendapat respon ramah Kak Jule
            try {
                const fallbackRes = this._getFallbackResponse(userName, message);
                const mode = (context.audioMode || "standard").toString();
                console.log(`🤖 [FALLBACK-${mode.toUpperCase()}] ${userName} → ${fallbackRes}`);
                logger.bot(`Kak Jule (Fallback): ${fallbackRes}`);

                const provider = mode === "pro" ? audioPro : audio;
                provider.addToQueue(fallbackRes);
            } catch (fallbackErr) {
                console.error("❌ Fallback Error:", fallbackErr.message);
            }
        } finally {
            this.running--;
        }
    }
}

module.exports = new AIExecutor();