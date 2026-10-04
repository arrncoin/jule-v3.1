// core/audio/stdV2.js
const { spawn } = require("child_process");
const googleTTS = require("google-tts-api");
const async = require("async");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const { getWritablePath } = require("../utils/paths");

class AudioController {
    constructor() {
        this.currentProcess = null;
        this.isPlaying = false;
        this.currentAbortController = null;
        this.generation = 0;
        this._initQueue();
    }

    _initQueue() {
        this.queue = async.queue(async (job) => {
            if (job.generation !== this.generation) return; // 🔧 job basi, lewati

            this.isPlaying = true;

            if (job.onStart) {
                try { await job.onStart(); } catch (e) { console.error("onStart Error:", e); }
            }

            if (job.generation === this.generation) {
                await this.execute(job.text, job.generation);
            }

            if (job.generation === this.generation && job.onEnd) {
                try { await job.onEnd(); } catch (e) { console.error("onEnd Error:", e); }
            }
        }, 1);

        this.queue.drain(() => {
            this.isPlaying = false;
        });
    }

    isStoryActive() {
        return this.isPlaying || !this.queue.idle();
    }

    splitText(text, maxLength = 200) {
        text = String(text ?? "");
        if (text.length <= maxLength) return [text];

        const sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
        const chunks = [];
        let current = "";

        for (const sentence of sentences) {
            if (sentence.length > maxLength) {
                if (current) { chunks.push(current.trim()); current = ""; }
                for (let i = 0; i < sentence.length; i += maxLength) {
                    chunks.push(sentence.slice(i, i + maxLength).trim());
                }
                continue;
            }
            if ((current + sentence).length <= maxLength) {
                current += sentence;
            } else {
                if (current) chunks.push(current.trim());
                current = sentence;
            }
        }
        if (current) chunks.push(current.trim());
        return chunks.filter(Boolean);
    }

    async execute(text, taskGeneration) {
        if (taskGeneration !== this.generation) return; // 🔧 cek sebelum mulai

        const filePath = getWritablePath(`temp-audio-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);
        const abortController = new AbortController();
        this.currentAbortController = abortController;

        try {
            const url = googleTTS.getAudioUrl(text, {
                lang: "id",
                slow: false,
                host: "https://translate.google.com",
            });

            const { data } = await axios.get(url, {
                responseType: "arraybuffer",
                timeout: 10000,
                signal: abortController.signal,
            });

            if (taskGeneration !== this.generation) return; // 🔧 cek lagi setelah await

            await fs.writeFile(filePath, data);

            if (taskGeneration !== this.generation) return; // 🔧 cek lagi sebelum play

            await new Promise((resolve) => {
                const proc = spawn("ffplay", [
                    "-nodisp", "-autoexit", "-loglevel", "quiet", filePath
                ]);
                this.currentProcess = proc;

                const playTimeout = setTimeout(() => {
                    if (this.currentProcess === proc) proc.kill("SIGKILL");
                }, 30000);

                const cleanup = () => {
                    clearTimeout(playTimeout);
                    if (this.currentProcess === proc) this.currentProcess = null;
                    resolve();
                };

                proc.on("close", cleanup);
                proc.on("error", (err) => {
                    console.error("❌ FFPLAY ERROR:", err.message);
                    cleanup();
                });
            });

        } catch (err) {
            if (axios.isCancel?.(err) || err.name === "CanceledError" || err.name === "AbortError") {
                console.log("🛑 Download audio cerita dibatalkan (clearQueue).");
            } else {
                console.error("❌ Audio Engine Error:", err.message);
            }
        } finally {
            this.currentAbortController = null;
            try { await fs.unlink(filePath); } catch (e) {}
        }
    }

    addStory(text, onWord) {
        text = String(text ?? "").trim();
        if (!text) return;

        if (typeof onWord === "function") {
            const words = text.split(/\s+/);
            const totalMs = Math.max(1500, words.length * 420);
            const interval = totalMs / Math.max(words.length / 2, 1);
            let index = 0;

            const timer = setInterval(() => {
                if (index >= words.length) { clearInterval(timer); return; }
                onWord(words.slice(index, index + 2).join(" "));
                index += 2;
            }, interval);

            const gen = this.generation;
            this.queue.push({
                text,
                generation: gen,
                onStart() { onWord(words.slice(0, 2).join(" ")); },
                onEnd() { clearInterval(timer); }
            });
            return;
        }

        this.addToQueue(text);
    }

    addToQueue(data) {
        if (!data) return;
        const gen = this.generation;

        if (typeof data === "string") {
            const chunks = this.splitText(data);
            chunks.forEach(chunk => this.queue.push({ text: chunk, generation: gen }));
            return;
        }

        if (!data.text) return; // 🔧 guard teks kosong
        const chunks = this.splitText(data.text);
        chunks.forEach((chunk, index) => {
            this.queue.push({
                text: chunk,
                generation: gen,
                onStart: index === 0 ? data.onStart : null,
                onEnd: index === chunks.length - 1 ? data.onEnd : null, // 🔧 sekarang onEnd diteruskan juga
            });
        });
    }

    addPriority(data) {
        if (!data) return;
        const gen = this.generation;
        let itemsToAdd = [];

        if (typeof data === "string") {
            const chunks = this.splitText(data);
            itemsToAdd = chunks.map(chunk => ({ text: chunk, generation: gen }));
        } else {
            if (!data.text) return; // 🔧 guard teks kosong
            const chunks = this.splitText(data.text);
            itemsToAdd = chunks.map((chunk, index) => ({
                text: chunk,
                generation: gen,
                onStart: index === 0 ? data.onStart : null,
                onEnd: index === chunks.length - 1 ? data.onEnd : null,
            }));
        }

        for (let i = itemsToAdd.length - 1; i >= 0; i--) {
            this.queue.unshift(itemsToAdd[i]);
        }
    }

    clearQueue() {
        this.generation++; // 🔧 tandai semua job/task lama sebagai basi

        if (this.currentProcess) {
            try { this.currentProcess.kill("SIGKILL"); } catch (e) {}
            this.currentProcess = null;
        }

        if (this.currentAbortController) {
            this.currentAbortController.abort(); // 🔧 batalkan download yang sedang jalan
        }

        if (this.queue) this.queue.kill();

        this.isPlaying = false;
        this._initQueue();

        console.log("🛑 Audio queue cleared and state reset to idle");
    }

    stop() {
        this.clearQueue();
    }
}

module.exports = new AudioController();