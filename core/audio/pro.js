// core/audio/pro.js
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const async = require("async");
const { getWritablePath } = require("../utils/paths");

class AudioController {
    constructor() {
        this.queue = async.queue(async (text) => await this.execute(text), 1);
        
        // 1. Simpan semua key ke dalam array
        this.apiKeys = [
            process.env.ELEVENLABS_API_KEY_1,
            process.env.ELEVENLABS_API_KEY_2,
            process.env.ELEVENLABS_API_KEY_3,
            process.env.ELEVENLABS_API_KEY_4,
            process.env.ELEVENLABS_API_KEY_5,
        ].filter(Boolean); // Memastikan hanya key yang terdefinisi yang dipakai

        this.currentKeyIndex = 0;
    }

    // 2. Method helper untuk mengambil key berikutnya secara berurutan
    getApiKey() {
        if (this.apiKeys.length === 0) {
            throw new Error("Tidak ada API Key ElevenLabs yang tersedia di environment.");
        }
        const apiKey = this.apiKeys[this.currentKeyIndex];
        // Naikkan index, jika sudah melebihi jumlah key akan kembali ke 0
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
        return apiKey;
    }

    async execute(text) {
        try {
            const currentApiKey = this.getApiKey();

            const res = await axios({
                method: "POST",
                url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.VOICE_ID}`,
                headers: { "xi-api-key": currentApiKey },
                data: { text, model_id: "eleven_multilingual_v2" },
                responseType: "arraybuffer"
            });

            const filePath = getWritablePath(`output-${Date.now()}.mp3`);
            fs.writeFileSync(filePath, res.data);

            await new Promise((resolve) => {
                const p = spawn("ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", filePath]);
                p.on("close", () => {
                    try { fs.unlinkSync(filePath); } catch (_) {}
                    resolve();
                });
                p.on("error", () => {
                    try { fs.unlinkSync(filePath); } catch (_) {}
                    resolve();
                });
            });
        } catch (err) { 
            console.error("Audio Error:", err.response?.data ? err.response.data.toString() : err.message); 
        }
    }

    addToQueue(text) { this.queue.push(text); }
    clearQueue() { this.queue.kill(); }
}

module.exports = new AudioController();