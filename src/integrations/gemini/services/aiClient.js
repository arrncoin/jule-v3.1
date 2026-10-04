// core/ai/services/aiClient.js
const { GoogleGenAI } = require("@google/genai");

class AIClient {
    constructor(explicitKey, modelName) {
        this.modelName = this._resolveModel(modelName || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite");
        this.fallbackModels = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-3.8-flash"];

        // Kumpulkan semua API key yang tersedia di environment
        this.apiKeys = this._collectKeys(explicitKey);
        this.keyIndex = 0;
        this.keyCooldowns = new Map(); // key -> expiredAt
        this.clients = new Map(); // key -> GoogleGenAI instance

        // Inisialisasi client untuk key pertama
        if (this.apiKeys.length > 0) {
            console.log(`🤖 [AIClient] Terdaftar ${this.apiKeys.length} Gemini API Key untuk auto-rotation.`);
        }
        console.log(`🤖 [AIClient] Model aktif: ${this.modelName}`);
    }

    _resolveModel(raw) {
        if (!raw) return "gemini-3.5-flash-lite";
        let cleaned = String(raw).trim();
        cleaned = cleaned.replace(/^['"]|['"]$/g, ""); // Hapus tanda kutip jika ada di .env

        // Konversi penulisan bebas ke model slug
        if (/gemini\s*3\.5\s*flash\s*lite/i.test(cleaned)) {
            return "gemini-3.5-flash-lite";
        }
        if (/gemini\s*3\.1\s*flash\s*lite/i.test(cleaned)) {
            return "gemini-3.1-flash-lite";
        }
        if (/flash\s*lite\s*latest/i.test(cleaned)) {
            return "gemini-flash-lite-latest";
        }
        if (/flash\s*lite/i.test(cleaned)) {
            return "gemini-3.5-flash-lite";
        }
        return cleaned.toLowerCase().replace(/\s+/g, "-");
    }

    _collectKeys(explicitKey) {
        const set = new Set();
        if (explicitKey && explicitKey.trim()) set.add(explicitKey.trim());
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
            set.add(process.env.GEMINI_API_KEY.trim());
        }
        return Array.from(set).filter(Boolean);
    }

    _getClient(apiKey) {
        if (!this.clients.has(apiKey)) {
            this.clients.set(apiKey, new GoogleGenAI({ apiKey }));
        }
        return this.clients.get(apiKey);
    }

    _getActiveKey() {
        if (this.apiKeys.length === 0) return null;

        const now = Date.now();
        // Cari key yang sedang tidak dalam cooldown
        for (let i = 0; i < this.apiKeys.length; i++) {
            const idx = (this.keyIndex + i) % this.apiKeys.length;
            const candidateKey = this.apiKeys[idx];
            const cooldownUntil = this.keyCooldowns.get(candidateKey) || 0;

            if (now >= cooldownUntil) {
                this.keyIndex = idx;
                return candidateKey;
            }
        }

        // Semua key sedang dalam cooldown
        return null;
    }

    _markKeyCooldown(apiKey, durationMs = 60000) {
        const until = Date.now() + durationMs;
        this.keyCooldowns.set(apiKey, until);
        console.warn(`⏳ [AIClient] Key ...${apiKey.slice(-6)} terkena rate limit (429). Cooldown selama ${Math.round(durationMs / 1000)} detik.`);

        // Pindahkan pointer ke key berikutnya
        this.keyIndex = (this.keyIndex + 1) % Math.max(1, this.apiKeys.length);
    }

    async generate(prompt, options = {}, retries = 2) {
        const apiKey = this._getActiveKey();

        if (!apiKey) {
            const err = new Error("Semua Gemini API key sedang dalam status cooldown / limit kuota (429).");
            err.code = 429;
            err.isAllExhausted = true;
            throw err;
        }

        const client = this._getClient(apiKey);
        const targetModel = options.model || this.modelName;

        try {
            // Konfigurasi optimal untuk respon chat TTS yang responsif dan cepat
            const config = {
                maxOutputTokens: options.maxOutputTokens || 60,
                temperature: options.temperature || 0.7,
                topP: options.topP || 0.9,
            };

            // Hanya aktifkan tools jika eksplisit diminta
            if (options.enableSearch) {
                config.tools = [{ googleSearch: {} }];
            }

            const result = await client.models.generateContent({
                model: targetModel,
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }],
                    },
                ],
                config,
            });

            return result.text;

        } catch (err) {
            const errStr = String(err.message || "");
            const isRateLimit = errStr.includes("429") || 
                                errStr.includes("RESOURCE_EXHAUSTED") || 
                                errStr.includes("quota") || 
                                errStr.includes("rate-limits");

            if (isRateLimit) {
                // Beri cooldown pada key yang kena limit
                this._markKeyCooldown(apiKey, 60000);

                // Jika masih ada key lain atau percobaan tersisa, coba key berikutnya
                const nextKey = this._getActiveKey();
                if (nextKey && nextKey !== apiKey && retries > 0) {
                    console.log(`🔄 [AIClient] Mengalihkan request ke API key cadangan (...${nextKey.slice(-6)})...`);
                    return this.generate(prompt, options, retries - 1);
                }

                // Coba fallback model jika key sama tapi model overload
                if (retries > 0 && this.fallbackModels.length > 0) {
                    const fallbackModel = this.fallbackModels.find(m => m !== targetModel) || this.fallbackModels[0];
                    if (fallbackModel && fallbackModel !== targetModel) {
                        console.log(`🔄 [AIClient] Mencoba fallback model: ${fallbackModel}...`);
                        return this.generate(prompt, { ...options, model: fallbackModel }, retries - 1);
                    }
                }

                const quotaErr = new Error(`Gemini Quota Exceeded (429): ${err.message}`);
                quotaErr.code = 429;
                throw quotaErr;
            }

            // Cek jika model 503 (high demand) atau 404 (not found / deprecated)
            const isOverloadedOrUnavailable = errStr.includes("503") || 
                                              errStr.includes("UNAVAILABLE") || 
                                              errStr.includes("high demand") || 
                                              errStr.includes("not found") || 
                                              errStr.includes("404") || 
                                              errStr.includes("is not supported");

            if (isOverloadedOrUnavailable && retries > 0 && this.fallbackModels.length > 0) {
                const fallbackModel = this.fallbackModels.find(m => m !== targetModel);
                if (fallbackModel) {
                    console.warn(`⚠️ [AIClient] Model "${targetModel}" mengalami kendala (${errStr.slice(0, 70)}...). Beralih cepat ke model "${fallbackModel}"...`);
                    return this.generate(prompt, { ...options, model: fallbackModel }, retries - 1);
                }
            }

            // Error umum lainnya
            console.error("❌ [AIClient ERROR]:", err.message);

            if (retries > 0) {
                await new Promise((r) => setTimeout(r, 600));
                return this.generate(prompt, options, retries - 1);
            }

            throw err;
        }
    }
}

module.exports = AIClient;