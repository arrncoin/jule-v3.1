const { spawn } = require("child_process");
const { GoogleGenAI } = require("@google/genai");
const async = require("async");
const fs = require("fs").promises;
const path = require("path");
const wav = require("wav");
const crypto = require("crypto");

class AudioController {
  constructor() {
    this.currentProcess = null;
    this.client = null;
    this._cachedKey = null;

    this.model = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
    this.voice = process.env.GEMINI_TTS_VOICE || "Kore";

    this._initQueue();
  }

  getClient() {
    const key = (process.env.GEMINI_API_KEY || "").trim();
    if (!this.client || this._cachedKey !== key) {
      this.client = new GoogleGenAI({ apiKey: key });
      this._cachedKey = key;
    }
    return this.client;
  }

  _initQueue() {
    this.queue = async.queue(async (text) => {
      await this.execute(text);
    }, 1);
  }

  splitText(text, maxLength = 200) {
    if (!text) return [];
    if (text.length <= maxLength) return [text];

    const sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
    const chunks = [];
    let current = "";

    for (const sentence of sentences) {
      if ((current + sentence).length <= maxLength) {
        current += sentence;
      } else {
        if (current) chunks.push(current.trim());
        current = sentence;
      }
    }

    if (current) chunks.push(current.trim());
    return chunks;
  }

  saveWaveFile(filename, pcmData, channels = 1, rate = 24000, sampleWidth = 2) {
    return new Promise((resolve, reject) => {
      const writer = new wav.FileWriter(filename, {
        channels,
        sampleRate: rate,
        bitDepth: sampleWidth * 8,
      });

      writer.on("finish", resolve);
      writer.on("error", reject);

      writer.write(pcmData);
      writer.end();
    });
  }

  async generateAudio(text) {
    const client = this.getClient();
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await client.models.generateContent({
          model: this.model,
          contents: text,
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: this.voice,
                },
              },
            },
          },
        });

        const candidates = response.candidates;
        const part = candidates?.[0]?.content?.parts?.find((p) => p.inlineData);

        if (!part || !part.inlineData || !part.inlineData.data) {
          throw new Error("Respon audio kosong dari Gemini.");
        }

        return Buffer.from(part.inlineData.data, "base64");
      } catch (err) {
        console.log(`⚠ Gemini TTS Retry ${attempt}/3: ${err.message}`);

        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  async execute(text) {
    const filePath = path.join(__dirname, `temp-${crypto.randomUUID()}.wav`);

    try {
      const pcmData = await this.generateAudio(text);

      await this.saveWaveFile(filePath, pcmData);

      await new Promise((resolve) => {
        this.currentProcess = spawn("ffplay", [
          "-nodisp",
          "-autoexit",
          "-loglevel",
          "quiet",
          filePath,
        ]);

        const timeout = setTimeout(() => {
          if (this.currentProcess) {
            console.log("⚠ FFPlay timeout.");
            this.currentProcess.kill("SIGKILL");
          }
        }, 30000);

        this.currentProcess.on("close", () => {
          clearTimeout(timeout);
          this.currentProcess = null;
          resolve();
        });

        this.currentProcess.on("error", (err) => {
          console.error("❌ FFPlay Error:", err.message);
          clearTimeout(timeout);
          this.currentProcess = null;
          resolve();
        });
      });
    } catch (err) {
      console.error("❌ Gemini Audio Execution Error:", err.message);
    } finally {
      try {
        await fs.unlink(filePath);
      } catch {}
    }
  }

  addToQueue(text) {
    if (!text) return;

    if (this.queue.length() >= 15) {
      console.log("⚠ Queue penuh, skip.");
      return;
    }

    const chunks = this.splitText(text);
    chunks.forEach((chunk) => {
      this.queue.push(chunk);
    });

    console.log(`📦 Queue +${chunks.length}`);
  }

  addPriority(text) {
    if (!text) return;

    const chunks = this.splitText(text);
    chunks.reverse().forEach((chunk) => {
      this.queue.unshift(chunk);
    });

    console.log(`⭐ Priority +${chunks.length}`);
  }

  // --- FITUR BARU UNTUK MEMBACA FILE CERITA JSON ---

  /**
   * Memasukkan teks cerita (object JSON) ke dalam antrean TTS
   * @param {Object} storyObj - Objek cerita dari JSON
   */
  playStory(storyObj) {
    if (!storyObj) return;

    // Masukkan Judul dulu
    if (storyObj.title) {
      this.addToQueue(`Judul cerita: ${storyObj.title}`);
    }

    // Masukkan paragraf demi paragraf dari array parts
    if (Array.isArray(storyObj.parts)) {
      for (const part of storyObj.parts) {
        if (part.text) {
          this.addToQueue(part.text);
        }
      }
    }
  }

  /**
   * Membaca file JSON cerita dari path lokal lalu memutarnya
   * @param {string} jsonFilePath - Path menuju file JSON cerita
   */
  async playStoryFromFile(jsonFilePath) {
    try {
      const rawData = await fs.readFile(jsonFilePath, "utf8");
      const storyObj = JSON.parse(rawData);
      
      console.log(`📖 Membaca cerita: "${storyObj.title}"`);
      this.playStory(storyObj);
    } catch (err) {
      console.error("❌ Gagal membaca file cerita JSON:", err.message);
    }
  }

  clearQueue() {
    this.queue.kill();
    this._initQueue();

    if (this.currentProcess) {
      this.currentProcess.kill("SIGKILL");
      this.currentProcess = null;
    }

    console.log("🛑 Audio queue cleared.");
  }
}

module.exports = new AudioController();