// core/ai/generator.js
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs").promises;
const { existsSync } = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const { getWritablePath } = require("../utils/paths");

function getGenAI() {
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
}

function resolveModel() {
    const raw = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const cleaned = String(raw).trim().replace(/^['"]|['"]$/g, "");
    if (/gemini\s*3\.5\s*flash\s*lite/i.test(cleaned)) return "gemini-3.5-flash-lite";
    if (/gemini\s*2\.5\s*flash/i.test(cleaned)) return "gemini-2.5-flash";
    if (/flash\s*lite/i.test(cleaned)) return "gemini-3.5-flash-lite";
    return cleaned.toLowerCase().replace(/\s+/g, "-");
}

module.exports = {
    reloadConfig() {
        // Dynamic instantiation on each call handles config reloads
    },

    async generateSeason(topic, playerNames = []) {
        const cleanTopic = (topic || "umum").trim();
        const client = getGenAI();

        if (!client) {
            const errMsg = "GEMINI_API_KEY belum diset di konfigurasi.";
            console.error("❌ [Generator]", errMsg);
            logger.error(`❌ [Generator] ${errMsg}`);
            return null;
        }

        const modelName = resolveModel();
        logger.info(`🤖 [AI Generator] Meminta 15 soal tema "${cleanTopic}" ke model ${modelName}...`);

        const prompt = `
        Buat tepat 15 soal bertema: "${cleanTopic}".

        Aturan:
        1. Format JSON Array dengan properti: "no", "clue", dan "answer".
        2. "no" nomor urut 1 sampai 15.
        3. "answer" boleh 1 atau 2 kata.
        4. Huruf kecil semua.
        5. Tanpa markdown.
        6. Tanpa simbol aneh.
        7. Kata umum yang dikenal.
        8. Soal harus relevan dengan tema.
        9. "clue" gunakan bahasa indonesia atau inggris sesuai konteks.
        10. "clue" DILARANG memuat kata yang ada pada "answer" maupun kata dasarnya (jawaban tidak boleh bocor sedikit pun di dalam clue).

        Contoh:
        [
        {
            "no": 1,
            "clue": "soal atau pertanyaan",
            "answer": "jawaban"
        }
        ]

        PENTING:
        - Hanya output JSON.
        - Tanpa markdown.
        - Tanpa penjelasan tambahan.
        `;

        try {
            let resultText = "";

            // Coba dengan format dan googleSearch sesuai kode terbukti berhasil
            try {
                const result = await client.models.generateContent({
                    model: modelName,
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: prompt,
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.9,
                        topP: 0.95,
                        maxOutputTokens: 3000,
                    },
                    tools: [
                        {
                            googleSearch: {},
                        },
                    ],
                });
                resultText = result.text || "";
            } catch (searchErr) {
                console.warn("⚠️ Gagal dengan googleSearch, mencoba fallback generate langsung:", searchErr.message);
                const fallbackResult = await client.models.generateContent({
                    model: modelName,
                    contents: prompt,
                    config: {
                        temperature: 0.8,
                        maxOutputTokens: 3000,
                        responseMimeType: "application/json"
                    }
                });
                resultText = fallbackResult.text || "";
            }

            // Bersihkan markdown kalau AI menyertakan code block
            let text = (resultText || "")
                .replace(/```json/gi, "")
                .replace(/```/g, "")
                .trim();

            // Cari JSON array otomatis
            const start = text.indexOf("[");
            const end = text.lastIndexOf("]");

            if (start === -1 || end === -1) {
                throw new Error("JSON array tidak ditemukan dalam output AI");
            }

            text = text.slice(start, end + 1);

            let questions = JSON.parse(text);

            if (!Array.isArray(questions)) {
                throw new Error("Output bukan array");
            }

            // ==========================
            // 🔥 CLEANING + VALIDASI
            // ==========================
            const MAX_CLUE_LENGTH = 500;

            const truncateAtWordBoundary = (str, maxLength) => {
                if (str.length <= maxLength) return str;
                const cut = str.slice(0, maxLength);
                const lastSpace = cut.lastIndexOf(" ");
                return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
            };

            questions = questions
                .filter(q => q && (q.clue || q.pertanyaan) && (q.answer || q.jawaban))
                .map((q, index) => {
                    const rawClue = q.clue || q.pertanyaan || "";
                    const cleanedClue = String(rawClue)
                        .replace(/\n/g, " ")
                        .replace(/\r/g, " ")
                        .replace(/\s+/g, " ")
                        .replace(/[^\w\s?!.,%:/()+=-]/g, "")
                        .trim();

                    if (cleanedClue.length > MAX_CLUE_LENGTH) {
                        console.warn(`⚠️ Soal no ${index + 1} dipotong dari ${cleanedClue.length} ke ${MAX_CLUE_LENGTH} karakter`);
                    }

                    const rawAnswer = q.answer || q.jawaban || "";
                    return {
                        no: index + 1,
                        clue: truncateAtWordBoundary(cleanedClue, MAX_CLUE_LENGTH),
                        answer: String(rawAnswer)
                            .toLowerCase()
                            .replace(/[^a-z0-9 ]/g, "")
                            .replace(/\s+/g, " ")
                            .trim()
                    };
                })
                .filter(q => q.clue.length > 3)
                .filter(q => q.answer.replace(/\s/g, "").length >= 1);

            // ==========================
            // 🔥 HAPUS DUPLIKAT
            // ==========================
            const used = new Set();
            questions = questions.filter(q => {
                if (used.has(q.answer)) return false;
                used.add(q.answer);
                return true;
            });

            // Re-index ulang
            questions = questions.map((q, index) => ({
                no: index + 1,
                clue: q.clue,
                answer: q.answer
            }));

            // Toleransi jika minimal 5 soal didapat agar game tidak gagal sia-sia
            if (questions.length < 5) {
                throw new Error(`Soal valid terlalu sedikit (${questions.length} soal)`);
            }

            // Ambil tepat maksimal 15 soal
            questions = questions.slice(0, 15);

            // ==========================
            // 💾 SIMPAN FILE (Ke folder questions & data/questions)
            // ==========================
            const saveDirs = [
                path.join(__dirname, "../questions"),
                getWritablePath("data/questions")
            ];

            for (const dirPath of saveDirs) {
                try {
                    if (!existsSync(dirPath)) {
                        await fs.mkdir(dirPath, { recursive: true });
                    }
                    await fs.writeFile(
                        path.join(dirPath, "soal.json"),
                        JSON.stringify(questions, null, 2),
                        "utf-8"
                    );
                } catch (saveErr) {
                    console.warn(`⚠️ Gagal simpan soal ke ${dirPath}:`, saveErr.message);
                }
            }

            console.log(`✅ AI: Berhasil generate ${questions.length} soal tema [${cleanTopic}]`);
            logger.info(`✅ [AI Generator] Berhasil membuat ${questions.length} soal tema "${cleanTopic}".`);

            return questions;

        } catch (error) {
            console.error("❌ AI Generator Error:", error.message || error);
            logger.error(`❌ [AI Generator] Gagal membuat soal: ${error.message || "Error tidak diketahui"}`);
            return null;
        }
    },

    // ==========================
    // 📖 BACA FILE SOAL DARI DISK
    // ==========================
    async loadQuestions(fileName = "soal.json") {
        const candidatePaths = [
            path.join(getWritablePath("data/questions"), fileName),
            path.join(__dirname, "../questions", fileName),
            path.join(process.cwd(), "data/questions", fileName),
            path.join(process.cwd(), "core/questions", fileName)
        ];

        for (const filePath of candidatePaths) {
            try {
                if (existsSync(filePath)) {
                    const raw = await fs.readFile(filePath, "utf-8");
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        return parsed;
                    }
                }
            } catch (_) {}
        }

        // Default fallback questions jika file belum ada atau kosong
        return [
            { no: 1, clue: "berkulit kuning, melengkung, dan menjadi kesukaan monyet", answer: "pisang" },
            { no: 2, clue: "bulat berduri tajam, berbau sangat menyengat dan dijuluki raja buah", answer: "durian" },
            { no: 3, clue: "bulat kecil bergerombol dalam satu tangkai, berwarna hijau atau ungu", answer: "anggur" },
            { no: 4, clue: "kulitnya hijau berduri lembut, dagingnya mentega berbiji besar", answer: "alpukat" },
            { no: 5, clue: "berwarna merah berbintik hitam dengan mahkota daun di atasnya", answer: "stroberi" }
        ];
    },

    // ==========================
    // 💾 SIMPAN SOAL MANUAL KE DISK
    // ==========================
    async saveQuestions(questions, fileName = "soal.json") {
        if (!Array.isArray(questions)) return false;
        const saveDirs = [
            path.join(__dirname, "../questions"),
            getWritablePath("data/questions")
        ];

        let anySuccess = false;
        for (const dirPath of saveDirs) {
            try {
                if (!existsSync(dirPath)) {
                    await fs.mkdir(dirPath, { recursive: true });
                }
                await fs.writeFile(
                    path.join(dirPath, fileName),
                    JSON.stringify(questions, null, 2),
                    "utf-8"
                );
                anySuccess = true;
            } catch (saveErr) {
                console.warn(`⚠️ Gagal simpan soal ke ${dirPath}:`, saveErr.message);
            }
        }
        return anySuccess;
    },

    // ==========================
    // 🧹 RESET FILE SOAL
    // ==========================
    async resetQuestions(fileName = "soal.json") {
        const filePaths = [
            path.join(__dirname, "../questions", fileName),
            path.join(getWritablePath("data/questions"), fileName)
        ];

        let success = false;
        for (const filePath of filePaths) {
            try {
                const dir = path.dirname(filePath);
                if (!existsSync(dir)) {
                    await fs.mkdir(dir, { recursive: true });
                }
                await fs.writeFile(
                    filePath,
                    JSON.stringify([], null, 2),
                    "utf-8"
                );
                success = true;
            } catch (error) {
                console.error("❌ Reset File Error:", error.message);
            }
        }
        return success;
    }
};
