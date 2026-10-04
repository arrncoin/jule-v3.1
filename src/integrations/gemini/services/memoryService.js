// core/ai/services/memoryService.js
const fs = require("fs").promises;
const { existsSync, readFileSync, mkdirSync } = require("fs");
const path = require("path");

class MemoryService {
    constructor(filePath) {
        this.path = filePath;
        this.memory = new Map();
        this.saveTimer = null;

        this.maxUsers = 5000; // HARD LIMIT
        this.load();
    }

    load() {
        try {
            if (existsSync(this.path)) {
                const raw = readFileSync(this.path, "utf8");
                this.memory = new Map(Object.entries(JSON.parse(raw)));
            }
        } catch {
            this.memory = new Map();
        }
    }

    get(user) {
        return this.memory.get(user) || [];
    }

    set(user, data) {
        this.memory.set(user, data.slice(-5));

        // HARD LIMIT USERS
        if (this.memory.size > this.maxUsers) {
            const firstKey = this.memory.keys().next().value;
            this.memory.delete(firstKey);
        }

        this._scheduleSave();
    }

    _scheduleSave() {
        clearTimeout(this.saveTimer);

        this.saveTimer = setTimeout(async () => {
            try {
                const dir = path.dirname(this.path);
                if (!existsSync(dir)) {
                    await fs.mkdir(dir, { recursive: true });
                }
                const json = JSON.stringify(Object.fromEntries(this.memory), null, 2);
                await fs.writeFile(this.path, json, "utf8");
            } catch (err) {
                console.error("❌ Save memory gagal:", err.message);
            }
        }, 2000);
    }
}

module.exports = MemoryService;