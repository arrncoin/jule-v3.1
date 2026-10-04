// src/core/state/overlayState.js
// Centralized In-Memory & Persistent State Manager for Kak Jule OBS Overlay
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const { getWritablePath, getAppRootPath } = require("../utils/paths");
const eventBus = require("../events/eventBus");

class OverlayStateManager extends EventEmitter {
    constructor() {
        super();

        this._state = {
            mode: "dashboard",
            type: "idle",
            message: "Kak Jule Studio siap digunakan.",
            updatedAt: new Date().toISOString()
        };

        this._writableFile = getWritablePath(path.join("state", "overlay.json"));
        this._localRootFile = getAppRootPath(path.join("state", "overlay.json"));

        this._loadInitialState();
    }

    _loadInitialState() {
        const candidatePaths = [this._writableFile, this._localRootFile];

        for (const fpath of candidatePaths) {
            try {
                if (fs.existsSync(fpath)) {
                    const raw = fs.readFileSync(fpath, "utf8");
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === "object") {
                        this._state = { ...this._state, ...parsed };
                        return;
                    }
                }
            } catch (_) {}
        }
    }

    get() {
        return { ...this._state };
    }

    set(partialData = {}) {
        if (!partialData || typeof partialData !== "object") return this.get();

        const updated = {
            ...this._state,
            ...partialData,
            updatedAt: new Date().toISOString()
        };

        this._state = updated;

        this.emit("change", this._state);
        eventBus.emit("overlay_state_changed", this._state);

        this._persistToDisk(this._state);

        return this._state;
    }

    reset(mode = "dashboard", message = "Menunggu aktivitas...") {
        return this.set({
            mode: mode || "dashboard",
            type: "idle",
            message: message || "Menunggu aktivitas...",
            clue: "",
            answerLength: 0,
            letterClue: "",
            winners: [],
            title: "",
            options: [],
            tally: {},
            text: ""
        });
    }

    _persistToDisk(data) {
        const jsonStr = JSON.stringify(data, null, 2);

        try {
            const dir = path.dirname(this._writableFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFile(this._writableFile, jsonStr, "utf8", () => {});
        } catch (_) {}

        if (this._writableFile !== this._localRootFile) {
            try {
                const dirRoot = path.dirname(this._localRootFile);
                if (fs.existsSync(dirRoot)) {
                    fs.writeFile(this._localRootFile, jsonStr, "utf8", () => {});
                }
            } catch (_) {}
        }
    }
}

const overlayState = new OverlayStateManager();
module.exports = overlayState;
