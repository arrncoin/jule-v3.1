// src/integrations/gemini/index.js
const path = require("path");
const { getWritablePath } = require("../../core/utils/paths");

const MemoryService = require("./services/memoryService");
const buildPrompt = require("./services/promptBuilder");
const AIClient = require("./services/aiClient");

const globalContext = require("../../core/state/context");

class AIController {
    constructor() {
        this.memory = new MemoryService(
            getWritablePath("memory.json")
        );
        this.ai = null;
        this._cachedKey = null;
        this._cachedModel = null;
    }

    _getAIClient() {
        const apiKey = (process.env.GEMINI_API_KEY || "").trim();
        if (!apiKey) {
            return null;
        }

        const model = (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim();

        if (!this.ai || this._cachedKey !== apiKey || this._cachedModel !== model) {
            this.ai = new AIClient(apiKey, model);
            this._cachedKey = apiKey;
            this._cachedModel = model;
        }
        return this.ai;
    }

    reloadConfig() {
        this.ai = null;
        this._cachedKey = null;
        this._cachedModel = null;
    }

    _clean(text) {
        if (!text || typeof text !== "string") return "";
        return text
            .replace(/[*_#"`]/g, "")
            .replace(/^(?:balasan\s+)?(?:kak\s+)?jule\s*[:\-–—]\s*/i, "")
            .replace(/^bot\s*[:\-–—]\s*/i, "")
            .replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    async generateResponse(userName, userPrompt) {
        try {
            if (globalContext.isGameActive) return null;

            const ai = this._getAIClient();
            if (!ai) {
                console.warn("⚠️ [AIController] GEMINI_API_KEY belum diset di .env atau pengaturan dashboard.");
                return null;
            }

            const history = this.memory.get(userName);

            const prompt = buildPrompt(userName, userPrompt, history);

            const raw = await ai.generate(prompt);
            const clean = this._clean(raw);

            if (!clean) return "Lagi blank, ulangi dong.";

            this.memory.set(userName, [
                ...history,
                {
                    userName,
                    user: userPrompt.slice(0, 100),
                    bot: clean
                }
            ]);

            return clean;

        } catch (err) {
            console.error("❌ AI Fatal:", err.message);
            return "Lagi error dikit, santai ya.";
        }
    }
}

module.exports = new AIController();
