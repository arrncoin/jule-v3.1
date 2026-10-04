// core/audio/index.js
const stdAudio = require("./standard"); // Untuk Live Chat / Game / Respon AI
const stdV2Audio = require("./stdV2");   // Untuk Pembacaan Cerita

class UnifiedAudioEngine {
    constructor() {
        this.currentMode = "IDLE";
    }

    isStoryActive() {
        try {
            if (typeof stdV2Audio.isStoryActive === "function") {
                return stdV2Audio.isStoryActive();
            }
            return Boolean(stdV2Audio.isPlaying || (stdV2Audio.queue && !stdV2Audio.queue.idle()));
        } catch (err) {
            console.error("❌ [AUDIO] Gagal cek isStoryActive:", err.message);
            return false;
        }
    }

    /**
     * @param {string|{text:string, onEnd?: Function}} payload
     */
    speak(payload, isPriority = false) {
        try {
            if (this.isStoryActive() && !isPriority) {
                console.log("⏳ [AUDIO] Cerita sedang berlangsung, respon livechat/game dilewati.");
                // 🔧 Tetap panggil onEnd kalau ada, supaya pemanggil (mis. game.startTimer())
                // tidak menunggu selamanya kalau ternyata pesan ini di-skip.
                if (typeof payload === "object" && payload !== null && typeof payload.onEnd === "function") {
                    try { payload.onEnd(); } catch (e) {}
                }
                return;
            }

            const text = typeof payload === "object" && payload !== null ? payload.text : payload;
            if (!text) return;

            // 🔧 Teruskan payload utuh (termasuk onEnd) ke stdAudio, bukan cuma text-nya
            const finalPayload = typeof payload === "object" && payload !== null ? payload : text;

            if (isPriority && typeof stdAudio.addPriority === "function") {
                stdAudio.addPriority(finalPayload);
            } else {
                stdAudio.addToQueue(finalPayload);
            }
        } catch (err) {
            console.error("❌ [AUDIO] speak() error:", err.message);
        }
    }

    story(text, onWord) {
        try {
            if (typeof stdAudio.clearQueue === "function") stdAudio.clearQueue();
            if (typeof stdV2Audio.clearQueue === "function") stdV2Audio.clearQueue();

            if (typeof stdV2Audio.addStory === "function") {
                stdV2Audio.addStory(text, onWord);
            } else {
                stdV2Audio.addToQueue(text);
            }
        } catch (err) {
            console.error("❌ [AUDIO] story() error:", err.message);
        }
    }

    addToQueue(payload) {
        this.speak(payload, false);
    }

    addPriority(payload) {
        this.speak(payload, true);
    }

    addStory(text, onWord) {
        this.story(text, onWord);
    }

    stop() {
        try {
            if (typeof stdAudio.clearQueue === "function") stdAudio.clearQueue();
            if (typeof stdV2Audio.clearQueue === "function") stdV2Audio.clearQueue();
            console.log("🛑 [AUDIO] Semua antrean audio dibersihkan.");
        } catch (err) {
            console.error("❌ [AUDIO] stop() error:", err.message);
        }
    }

    clearQueue() {
        this.stop();
    }
}

module.exports = new UnifiedAudioEngine();