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
    }

    async execute(text) {
        try {
            const res = await axios({
                method: "POST",
                url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.VOICE_ID}`,
                headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY_1 },
                data: { text, model_id: "eleven_multilingual_v2" },
                responseType: "arraybuffer"
            });

            const filePath = getWritablePath(`output2-${Date.now()}.mp3`);
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
        } catch (err) { console.error("❌ Audio Error"); }
    }

    addToQueue(text) { this.queue.push(text); }
    clearQueue() { this.queue.kill(); }
}
module.exports = new AudioController();