// src/features/audio/storyAudio.js
// Story audio playback queue with word sync
const { spawn } = require("child_process");
const googleTTS = require("google-tts-api");
const async = require("async");
const fs = require("fs").promises;
const axios = require("axios");
const { getWritablePath } = require("../../core/utils/paths");

class StoryAudioController {
    constructor() {
        this.currentProcess = null;
        this.isPlaying = false;
        this.currentAbortController = null;
        this.generation = 0;
        this._initQueue();
    }

    _initQueue() {
        this.queue = async.queue(async (job) => {
            if (job.generation !== this.generation) return;

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
        if (taskGeneration !== this.generation) return;

        const filePath = getWritablePath(`temp-audio-story-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp3`);
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
                }, 45000);

                const cleanup = () => {
                    clearTimeout(playTimeout);
                    if (this.currentProcess === proc) this.currentProcess = null;
                    resolve();
                };

                proc.on("close", cleanup);
                proc.on("error", (err) => {
                    console.error("❌ FFPLAY ERROR (Story):", err.message);
                    cleanup();
                });
            });

        } catch (err) {
            if (axios.isCancel?.(err) || err.name === "CanceledError" || err.name === "AbortError") {
                console.log("🛑 Download audio cerita dibatalkan.");
            } else {
                console.error("❌ Story Audio Engine Error:", err.message);
            }
        } finally {
            this.currentAbortController = null;
            try { await fs.unlink(filePath); } catch (e) {}
        }
    }

    addToQueue(text, onStart = null, onEnd = null) {
        if (!text) return;
        const chunks = this.splitText(text);
        const gen = this.generation;

        chunks.forEach((chunk, idx) => {
            this.queue.push({
                text: chunk,
                generation: gen,
                onStart: idx === 0 ? onStart : null,
                onEnd: idx === chunks.length - 1 ? onEnd : null,
            });
        });
    }

    addStory(text, onWord) {
        if (!text) return;
        this.addToQueue(text, null, null);
    }

    clearQueue() {
        this.generation++;
        this.queue.kill();
        this._initQueue();
        this.isPlaying = false;

        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }

        if (this.currentProcess) {
            this.currentProcess.kill("SIGKILL");
            this.currentProcess = null;
        }
        console.log("🛑 Audio queue cleared and state reset to idle");
    }
}

module.exports = new StoryAudioController();
