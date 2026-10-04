// src/features/audio/audioManager.js
// Unified Audio Engine Facade
const standardAudio = require("./standardAudio");
const storyAudio = require("./storyAudio");

class UnifiedAudioEngine {
    constructor() {
        this.currentMode = "IDLE";
    }

    isStoryActive() {
        try {
            if (typeof storyAudio.isStoryActive === "function") {
                return storyAudio.isStoryActive();
            }
            return Boolean(storyAudio.isPlaying || (storyAudio.queue && !storyAudio.queue.idle()));
        } catch (err) {
            console.error("❌ [AUDIO] Gagal cek isStoryActive:", err.message);
            return false;
        }
    }

    speak(payload, isPriority = false) {
        try {
            if (this.isStoryActive() && !isPriority) {
                console.log("⏳ [AUDIO] Cerita sedang berlangsung, respon livechat/game dilewati.");
                if (typeof payload === "object" && payload !== null && typeof payload.onEnd === "function") {
                    try { payload.onEnd(); } catch (_) {}
                }
                return;
            }

            const text = typeof payload === "object" && payload !== null ? payload.text : payload;
            if (!text) return;

            const finalPayload = typeof payload === "object" && payload !== null ? payload : text;

            if (isPriority && typeof standardAudio.addPriority === "function") {
                standardAudio.addPriority(finalPayload);
            } else {
                standardAudio.addToQueue(finalPayload);
            }
        } catch (err) {
            console.error("❌ [AUDIO] speak() error:", err.message);
        }
    }

    story(text, onWord) {
        try {
            if (typeof standardAudio.clearQueue === "function") standardAudio.clearQueue();
            if (typeof storyAudio.clearQueue === "function") storyAudio.clearQueue();

            if (typeof storyAudio.addStory === "function") {
                storyAudio.addStory(text, onWord);
            } else {
                storyAudio.addToQueue(text);
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
            if (typeof standardAudio.clearQueue === "function") standardAudio.clearQueue();
            if (typeof storyAudio.clearQueue === "function") storyAudio.clearQueue();
            console.log("🛑 [AUDIO] Semua antrean audio dibersihkan.");
        } catch (err) {
            console.error("❌ [AUDIO] stop() error:", err.message);
        }
    }

    clearQueue() {
        this.stop();
    }
}

const audioEngine = new UnifiedAudioEngine();
module.exports = audioEngine;
