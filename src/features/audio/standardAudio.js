// src/features/audio/standardAudio.js
// Standard Google TTS audio playback queue with process cancellation
const { spawn } = require("child_process");
const googleTTS = require("google-tts-api");
const async = require("async");
const fs = require("fs").promises;
const axios = require("axios");
const { getWritablePath } = require("../../core/utils/paths");

class StandardAudioController {
    constructor() {
        this.currentProcess = null;
        this.currentAbortController = null;
        this.generation = 0;
        this._initQueue();
    }

    _initQueue() {
        this.queue = async.queue(async (job) => {
            if (job.generation !== this.generation) {
                if (job.onEnd) {
                    try { await job.onEnd(); } catch (e) { console.error("onEnd Error:", e); }
                }
                return;
            }

            await this.execute(job.text, job.generation);

            if (job.generation === this.generation && job.onEnd) {
                try { await job.onEnd(); } catch (e) { console.error("onEnd Error:", e); }
            }
        }, 1);
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
        if (taskGeneration !== this.generation) return;

        const filePath = getWritablePath(`temp-audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`);
        const abortController = new AbortController();
        this.currentAbortController = abortController;

        try {
            const isSlow = process.env.VOICE_SPEED === "slow";
            const isFast = process.env.VOICE_SPEED === "fast";

            const url = googleTTS.getAudioUrl(text, {
                lang: "id",
                slow: isSlow,
                host: "https://translate.google.com",
            });

            const { data } = await axios.get(url, {
                responseType: "arraybuffer",
                timeout: 10000,
                signal: abortController.signal,
            });

            if (taskGeneration !== this.generation) return;

            await fs.writeFile(filePath, data);

            if (taskGeneration !== this.generation) return;

            await new Promise((resolve) => {
                const ffArgs = ["-nodisp", "-autoexit", "-loglevel", "quiet"];
                if (isFast) {
                    ffArgs.push("-af", "atempo=1.2");
                }
                ffArgs.push(filePath);

                const proc = spawn("ffplay", ffArgs);
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
                console.log("🛑 Download audio dibatalkan (clearQueue).");
            } else {
                console.error("❌ Audio Engine Error:", err.message);
            }
        } finally {
            this.currentAbortController = null;
            try { await fs.unlink(filePath); } catch (e) {}
        }
    }

    addToQueue(data) {
        if (!data) return;

        const isObj = typeof data === "object";
        const text = isObj ? data.text : data;
        if (!text) return;

        if (this.queue.length() > 15) {
            console.log("⚠️ Queue penuh, skipping...");
            if (isObj && data.onEnd) {
                try { data.onEnd(); } catch (e) {}
            }
            return;
        }

        const chunks = this.splitText(text);
        const gen = this.generation;

        chunks.forEach((chunk, idx) => {
            this.queue.push({
                text: chunk,
                generation: gen,
                onEnd: (isObj && idx === chunks.length - 1) ? data.onEnd : null,
            });
        });

        console.log(`📦 Enqueued: ${chunks.length} chunks`);
    }

    addPriority(data) {
        if (!data) return;

        const isObj = typeof data === "object";
        const text = isObj ? data.text : data;
        if (!text) return;

        const chunks = this.splitText(text);
        const gen = this.generation;

        const items = chunks.map((chunk, idx) => ({
            text: chunk,
            generation: gen,
            onEnd: (isObj && idx === chunks.length - 1) ? data.onEnd : null,
        }));

        for (let i = items.length - 1; i >= 0; i--) {
            this.queue.unshift(items[i]);
        }
    }

    clearQueue() {
        this.generation++;
        this.queue.kill();
        this._initQueue();

        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }

        if (this.currentProcess) {
            this.currentProcess.kill("SIGKILL");
            this.currentProcess = null;
        }
        console.log("🛑 Audio queue cleared and reset");
    }
}

module.exports = new StandardAudioController();
