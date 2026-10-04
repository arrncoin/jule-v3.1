// core/ai/storyGenerator.js
const { GoogleGenAI, Type } = require("@google/genai");
const fs = require("fs").promises;
const { existsSync } = require("fs");
const path = require("path");
const { getWritablePath } = require("../utils/paths");

class StoryGenerator {
    constructor() {
        this.client = null;
        this._cachedKey = null;
        this.ensureStoryDirs();
    }

    async ensureStoryDirs() {
        try {
            const dirs = ["./stories", getWritablePath("stories")];
            for (const d of dirs) {
                if (!existsSync(d)) {
                    await fs.mkdir(d, { recursive: true });
                }
            }
        } catch (_) {}
    }

    getModel() {
        return (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim().toLowerCase().replace(/\s+/g, "-");
    }

    getClient() {
        const apiKey = (process.env.GEMINI_API_KEY || "").trim();
        if (!apiKey) {
            return null;
        }
        if (!this.client || this._cachedKey !== apiKey) {
            this.client = new GoogleGenAI({ apiKey });
            this._cachedKey = apiKey;
        }
        return this.client;
    }

    reloadConfig() {
        this.client = null;
        this._cachedKey = null;
    }

    async generate(topic = "Petualangan") {
        const client = this.getClient();
        if (!client) {
            console.warn("⚠️ API key Gemini belum diset untuk StoryGenerator.");
            return null;
        }

        const prompt = `
Buatkan sebuah cerita original dalam Bahasa Indonesia yang panjang, menarik, emosional, dan nyaman didengarkan seperti audiobook profesional.

TOPIK:
${topic}

Prinsip Penulisan & Alur Realistis:

1. Dialog dan Interaksi Karakter yang Hidup:
- Sertakan percakapan langsung antar tokoh yang proporsional di sepanjang cerita.
- Setiap tokoh harus memiliki gaya bicara, pilihan kata, dan ritme dialog yang khas sesuai latar belakangnya.
- Hindari dialog yang terlalu formal/kaku seperti membaca buku teks; gunakan tuturan yang wajar dan biasa diucapkan manusia secara lisan.
- Gunakan dialog untuk mengungkapkan emosi, konflik, dan sifat tokoh secara tersirat (bukan hanya lewat penjelasan narator).
- Padukan percakapan dengan tindakan kecil/bahasa tubuh (gesture) agar suasana terasa hidup.

2. Pengembangan Karakternya Alami (Show, Don't Tell):
- Perlihatkan sifat tokoh lewat tindakan, kebiasaan kecil, dan respons mereka dalam percakapan.
- Tokoh memiliki celah atau cacat emosional (imperfect) yang memicu dinamika dalam percakapan dan masalah cerita.

3. Humor dan Ketegangan Organik:
- Sisipkan kelakar, sindiran halus, atau humor ringan di dalam dialog secara wajar sesuai relasi antar tokoh.
- Konflik dan pilihan sulit tercermin dari perdebatan atau perbedaan sudut pandang antar karakter.

4. Resolusi & Pembelajaran Hidup:
- Refleksi atau pesan moral terpancar dari percakapan dan perubahan cara pandang tokoh di akhir kisah, tanpa terkesan menggurui.

Aturan Wajib Penulisan:

- Gunakan Bahasa Indonesia yang natural, mengalir, dan enak didengar.
- Narasi fokus pada elemen sensorik (suara, suasana, intonasi, gesture) agar pendengar bisa membayangkan adegannya.
- Setiap paragraf maksimal 4 kalimat untuk menjaga tempo audio.
- Tanpa format markdown (seperti bold, italic, atau simbol khusus).
- Jangan menggunakan emoji.
- Panjang cerita sekitar 3000 sampai 5000 kata.
- Hindari pengulangan fakta atau informasi yang sudah dipahami.
- Akhiri cerita dengan resolusi emosional yang hangat, berkesan, dan masuk akal.

Kembalikan hasil dalam format JSON berikut:

{
  "title": "",
  "genre": "",
  "parts": [
    {
      "text": ""
    }
  ]
}
`;

        const response = await client.models.generateContent({
            model: this.getModel(),
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        genre: { type: Type.STRING },
                        parts: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    text: { type: Type.STRING },
                                },
                                required: ["text"],
                            },
                        },
                    },
                    required: ["title", "genre", "parts"],
                },
            },
        });

        if (!response.text) {
            throw new Error("Respon teks kosong dari Gemini API.");
        }

        const story = JSON.parse(response.text);

        story.author = "Gemini";
        story.createdAt = new Date().toISOString();

        return story;
    }

    async save(story) {
        await this.ensureStoryDirs();

        let safeTitle = (story.title || "cerita")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w\s-]/g, "")
            .trim()
            .replace(/\s+/g, "_")
            .toLowerCase();

        if (!safeTitle) {
            safeTitle = `story_${Date.now()}`;
        }

        const fileName = `${safeTitle}.json`;
        const targets = [
            path.join("./stories", fileName),
            path.join(getWritablePath("stories"), fileName)
        ];

        let savedPath = targets[0];
        const jsonContent = JSON.stringify(story, null, 2);

        for (const targetFile of targets) {
            try {
                const dir = path.dirname(targetFile);
                if (!existsSync(dir)) {
                    await fs.mkdir(dir, { recursive: true });
                }
                await fs.writeFile(targetFile, jsonContent, "utf8");
                savedPath = targetFile;
            } catch (err) {
                console.warn(`⚠️ Gagal simpan cerita ke ${targetFile}:`, err.message);
            }
        }

        return savedPath;
    }

    /**
     * Membaca cerita dari file JSON berdasarkan nama file atau path lengkap
     */
    async loadStory(fileNameOrPath) {
        if (!fileNameOrPath) return null;
        const candidatePaths = [
            fileNameOrPath,
            path.join("./stories", fileNameOrPath),
            path.join("./stories", `${fileNameOrPath}.json`),
            path.join(getWritablePath("stories"), fileNameOrPath),
            path.join(getWritablePath("stories"), `${fileNameOrPath}.json`)
        ];

        for (const p of candidatePaths) {
            try {
                if (existsSync(p)) {
                    const raw = await fs.readFile(p, "utf8");
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.title && Array.isArray(parsed.parts)) {
                        return parsed;
                    }
                }
            } catch (_) {}
        }
        return null;
    }

    /**
     * Mengambil daftar seluruh cerita yang tersimpan
     */
    async listSavedStories() {
        const dirs = ["./stories", getWritablePath("stories")];
        const storiesMap = new Map();

        for (const dir of dirs) {
            try {
                if (existsSync(dir)) {
                    const files = await fs.readdir(dir);
                    for (const file of files) {
                        if (file.endsWith(".json")) {
                            const fullPath = path.join(dir, file);
                            try {
                                const raw = await fs.readFile(fullPath, "utf8");
                                const parsed = JSON.parse(raw);
                                if (parsed && parsed.title) {
                                    storiesMap.set(file, {
                                        fileName: file,
                                        path: fullPath,
                                        title: parsed.title,
                                        genre: parsed.genre || "Umum",
                                        partsCount: Array.isArray(parsed.parts) ? parsed.parts.length : 0
                                    });
                                }
                            } catch (_) {}
                        }
                    }
                }
            } catch (_) {}
        }

        return Array.from(storiesMap.values());
    }

    async generateAndSave(topic) {
        const story = await this.generate(topic);
        const file = await this.save(story);

        return {
            file,
            story,
        };
    }
}

module.exports = new StoryGenerator();