// src/features/voting/votingEngine.js
// Live chat voting engine
const EventEmitter = require("events");
const audio = require("../audio");
const logger = require("../../core/logger/logger");
const overlayState = require("../../core/state/overlayState");
const pointManager = require("../points/pointManager");
const pointRules = require("../points/pointRules");

const speak = (text) => audio.addToQueue(text);

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class VotingEngine extends EventEmitter {
    constructor() {
        super();
        this.active = false;
        this.options = [];
        this.votes = new Map();
        this._resetTimeout = null;
    }

    updateOverlay(winners = []) {
        const tallyObj = {};
        this.options.forEach((opt, idx) => {
            let count = 0;
            for (const voteIdx of this.votes.values()) {
                if (voteIdx === idx) count++;
            }
            tallyObj[opt] = count;
        });

        const hasWinners = Array.isArray(winners) && winners.length > 0;
        const data = {
            mode: (this.active || hasWinners) ? "voting" : "dashboard",
            title: "VOTING LIVE",
            options: this.options,
            tally: tallyObj,
            winners: winners
        };

        overlayState.set(data);
    }

    isActive() {
        return this.active;
    }

    start(rawOptions) {
        if (!rawOptions || typeof rawOptions !== "string") return { success: false, message: "Opsi tidak valid." };

        const parsed = rawOptions
            .split(",")
            .map((opt) => opt.trim().toLowerCase())
            .filter((opt) => opt.length > 0);

        if (parsed.length < 2) {
            return { success: false, message: "Harus memasukkan minimal 2 opsi!" };
        }

        this.options = parsed;
        this.votes.clear();
        this.active = true;

        clearTimeout(this._resetTimeout);
        this._resetTimeout = null;

        this.updateOverlay();

        const opsiText = this.options.join(" atau ");
        logger.info(`📊 [VOTING] Voting dibuka dengan opsi: ${this.options.join(", ")}`);
        logger.bot(`Kak Jule: Voting telah dibuka! Silakan pilih ${opsiText}. Ketik pilihanmu di chat!`);
        speak(`Voting telah dibuka! Silakan pilih ${opsiText}. Ketik pilihanmu di chat!`);

        return { success: true, options: this.options };
    }

    castVote(userName, message) {
        if (!this.active) return false;

        const input = message.trim().toLowerCase();
        if (!input) return false;

        let matchedIndex = this.options.findIndex((opt) => opt === input);

        if (matchedIndex === -1) {
            matchedIndex = this.options.findIndex((opt) => {
                const re = new RegExp(`\\b${escapeRegex(opt)}\\b`);
                return re.test(input);
            });
        }

        if (matchedIndex !== -1) {
            const isFirstVote = !this.votes.has(userName);
            this.votes.set(userName, matchedIndex);
            this.updateOverlay();

            if (isFirstVote && pointManager.canReceivePoints(userName, "vote")) {
                try {
                    pointManager.addPoints(
                        userName,
                        pointRules.POINTS.VOTE || 2,
                        "vote",
                        `Partisipasi voting "${this.options[matchedIndex]}"`
                    );
                } catch (_) {}
            }

            return true;
        }

        return false;
    }

    stop() {
        if (!this.active) return { success: false };

        this.active = false;

        const tally = new Array(this.options.length).fill(0);
        for (const voteIndex of this.votes.values()) {
            tally[voteIndex]++;
        }

        const totalVotes = this.votes.size;
        let winners = [];
        let maxVotes = -1;

        this.options.forEach((opt, idx) => {
            const count = tally[idx];
            if (count > maxVotes && count > 0) {
                maxVotes = count;
                winners = [opt];
            } else if (count === maxVotes && count > 0) {
                winners.push(opt);
            }
        });

        this.updateOverlay(winners);

        let textHasil = "";
        if (totalVotes === 0) {
            textHasil = "Voting dihentikan. Tidak ada suara yang masuk.";
        } else {
            textHasil = `Voting selesai dengan total ${totalVotes} suara. `;
            if (winners.length === 1) {
                textHasil += `Pemenangnya adalah ${winners[0]}!`;
            } else if (winners.length > 1) {
                textHasil += `Hasilnya seri antara ${winners.join(" dan ")}!`;
            }
        }

        logger.info(`📊 [VOTING] ${textHasil}`);
        logger.bot(`Kak Jule: ${textHasil}`);
        speak(textHasil);

        clearTimeout(this._resetTimeout);
        this._resetTimeout = setTimeout(() => {
            if (!this.active) {
                this.options = [];
                this.votes.clear();
                overlayState.reset("dashboard", "Voting selesai. Menunggu aktivitas...");
            }
        }, 10000);

        return { success: true };
    }
}

const votingEngine = new VotingEngine();
module.exports = votingEngine;
