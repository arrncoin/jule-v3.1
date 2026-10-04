// src/core/state/context.js
// Centralized Bot Context & State
const eventBus = require("../events/eventBus");

const context = {
    isActive: false,        // Bot ON/OFF
    audioMode: "audioController",  // audioController | pro
    mood: "santai",          // santai | serius | genit | random

    _isGameActive: false,
    gamePhase: "idle",
    isRolling: false,

    gameName: "Roblox, Mobile Legends, Free Fire, Tebak Kata",
    gameList: [
        "Roblox",
        "Mobile Legends",
        "Free Fire",
        "Tebak Kata"
    ],

    currentQuestionIndex: 0,
    totalQuestions: 0,
    players: [],
    leaderboard: [],

    // 🎮 GAME STATE
    get isGameActive() {
        return this._isGameActive;
    },

    set isGameActive(val) {
        this._isGameActive = Boolean(val);
        this.isGaming = Boolean(val); // backward compatibility
    },

    isGaming: false,

    updateStatus(newState = {}) {
        Object.assign(this, newState);

        if (Object.keys(newState).length > 0) {
            console.log("🧠 Context Updated:", newState);
            eventBus.emit("context_updated", newState);
        }
    },

    resetGame() {
        this.isGameActive = false;
        this.gamePhase = "idle";
        this.isRolling = false;

        this.currentQuestionIndex = 0;
        this.totalQuestions = 0;
        this.players = [];
        this.leaderboard = [];

        console.log("♻️ Game context has been fully reset");
        eventBus.emit("game_reset");
    }
};

module.exports = context;
