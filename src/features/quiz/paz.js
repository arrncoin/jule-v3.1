// core/game/paz.js
// PAZ — Number Puzzle Game Engine
// Kak Jule V3.x
//
// Command:
//   !paz 2
//   !paz 3
//   !paz 4
//   !paz stop
//   !stop paz
//
// Jawaban user:
//   paz 12 / 123 / 1234
//   12 / 123 / 1234
//
// Rules:
//   - Digit 0-9
//   - Digit boleh berulang
//   - Jumlah digit: 2, 3, atau 4
//   - Waktu setiap puzzle: 60 detik
//   - Jika benar -> langsung lanjut puzzle berikutnya
//   - Jika timeout -> jawaban dibuka -> lanjut puzzle berikutnya
//   - Game terus berjalan sampai dihentikan

const EventEmitter = require("events");
const pointManager = require("../points/pointManager");
const overlayState = require("../../core/state/overlayState");

const GAME_NAME = "paz";
const DEFAULT_TIME = 60;

const ALLOWED_DIGITS = [2, 3, 4];

class PazGame extends EventEmitter {
    constructor(options = {}) {
        super();

        this.timeLimit = options.timeLimit || DEFAULT_TIME;

        // ==============================
        // STATE GAME
        // ==============================

        this.running = false;
        this.digits = 2;

        this.currentPuzzle = null;
        this.puzzleNumber = 0;

        this.timer = null;
        this.startedAt = null;
        this.endsAt = null;

        // ==============================
        // STATISTIK
        // ==============================

        this.stats = {
            total: 0,
            solved: 0,
            timeout: 0,
        };

        // ==============================
        // PEMAIN
        // ==============================

        this.players = new Map();

        // ==============================
        // LOCK
        // Mencegah dua jawaban benar
        // diproses bersamaan
        // ==============================

        this.answerLocked = false;
    }

    // =========================================================
    // START
    // =========================================================

    async start(digits = 2) {
        digits = Number(digits);

        if (!ALLOWED_DIGITS.includes(digits)) {
            return {
                success: false,
                message: "Format: !paz 2, !paz 3, atau !paz 4",
            };
        }

        // Jika game sedang berjalan,
        // ganti mode digit dan mulai puzzle baru.
        if (this.running) {
            await this.stop({
                reason: "restart",
                silent: true,
            });
        }

        this.running = true;
        this.digits = digits;

        this.puzzleNumber = 0;

        this.stats = {
            total: 0,
            solved: 0,
            timeout: 0,
        };

        this.players.clear();

        await this._saveOverlay({
            mode: "paz",
            active: true,
            status: "starting",
            digits: this.digits,
            puzzle: 0,
            answer: null,
            masked: this._createMasked(),
            timeLimit: this.timeLimit,
            remaining: this.timeLimit,
            winner: null,
            message: `PAZ ${this.digits} dimulai!`,
        });

        this.emit("start", {
            digits: this.digits,
            timeLimit: this.timeLimit,
        });

        await this._nextPuzzle();

        return {
            success: true,
            digits: this.digits,
            message: `PAZ ${this.digits} dimulai!`,
        };
    }

    // =========================================================
    // NEXT PUZZLE
    // =========================================================

    async _nextPuzzle() {
        if (!this.running) return;

        this._clearTimer();

        this.answerLocked = false;

        this.puzzleNumber++;
        this.stats.total++;

        const answer = this._generateNumber(this.digits);

        this.currentPuzzle = {
            id: this.puzzleNumber,
            answer,
            digits: this.digits,
        };

        this.startedAt = Date.now();
        this.endsAt = this.startedAt + this.timeLimit * 1000;

        await this._saveOverlay({
            mode: "paz",
            active: true,
            status: "playing",

            digits: this.digits,

            puzzle: this.puzzleNumber,

            masked: this._createMasked(),

            answer: null,

            timeLimit: this.timeLimit,
            remaining: this.timeLimit,

            startedAt: this.startedAt,
            endsAt: this.endsAt,

            winner: null,

            message: `Puzzle #${this.puzzleNumber}`,
        });

        this.emit("puzzle", {
            puzzle: this.puzzleNumber,
            digits: this.digits,
            masked: this._createMasked(),
            timeLimit: this.timeLimit,
        });

        this._startTimer();
    }

    // =========================================================
    // GENERATE RANDOM NUMBER
    // =========================================================

    _generateNumber(length) {
        let result = "";

        for (let i = 0; i < length; i++) {
            const digit = Math.floor(Math.random() * 10);
            result += digit;
        }

        return result;
    }

    // =========================================================
    // MASKED NUMBER
    // =========================================================

    _createMasked() {
        return Array(this.digits)
            .fill("?")
            .join(" ");
    }

    // =========================================================
    // TIMER
    // =========================================================

    _startTimer() {
        this._clearTimer();

        this.timer = setInterval(async () => {
            if (!this.running || !this.currentPuzzle) {
                this._clearTimer();
                return;
            }

            const remainingMs = this.endsAt - Date.now();

            const remaining = Math.max(
                0,
                Math.ceil(remainingMs / 1000)
            );

            this.emit("tick", {
                puzzle: this.puzzleNumber,
                remaining,
            });

            await this._saveOverlay({
                mode: "paz",
                active: true,
                status: "playing",

                digits: this.digits,

                puzzle: this.puzzleNumber,

                masked: this._createMasked(),

                answer: null,

                timeLimit: this.timeLimit,
                remaining,

                startedAt: this.startedAt,
                endsAt: this.endsAt,

                winner: null,

                message: `Sisa waktu ${remaining} detik`,
            });

            if (remaining <= 0) {
                await this._timeout();
            }
        }, 1000);
    }

    // =========================================================
    // ANSWER
    // =========================================================

    async answer(user, rawAnswer) {
        if (!this.running) {
            return {
                success: false,
                reason: "not_running",
            };
        }

        if (!this.currentPuzzle) {
            return {
                success: false,
                reason: "no_puzzle",
            };
        }

        if (this.answerLocked) {
            return {
                success: false,
                reason: "locked",
            };
        }

        const answer = this._normalizeAnswer(rawAnswer);

        if (answer === null) {
            return {
                success: false,
                reason: "invalid",
            };
        }

        // Pastikan jumlah digit sama
        if (answer.length !== this.digits) {
            return {
                success: false,
                reason: "wrong_length",
            };
        }

        // ==============================
        // JAWABAN SALAH
        // ==============================

        if (answer !== this.currentPuzzle.answer) {
            this.emit("wrong", {
                user,
                answer,
                correctLength: this.digits,
                puzzle: this.puzzleNumber,
            });

            return {
                success: false,
                reason: "wrong",
                answer,
            };
        }

        // ==============================
        // JAWABAN BENAR
        // ==============================

        this.answerLocked = true;

        this._clearTimer();

        const elapsedMs = Date.now() - this.startedAt;

        const elapsed = Math.max(
            0,
            Math.round(elapsedMs / 1000)
        );

        const remaining = Math.max(
            0,
            this.timeLimit - elapsed
        );

        this.stats.solved++;

        const playerKey = this._getPlayerKey(user);

        const player = this.players.get(playerKey) || {
            name: this._getPlayerName(user),
            wins: 0,
            points: 0,
        };

        player.wins++;

        // Sistem poin:
        // Semakin cepat menjawab semakin besar poin.
        let points = 5;

        if (elapsed >= 40) {
            points = 1;
        } else if (elapsed >= 20) {
            points = 3;
        }

        player.points += points;

        this.players.set(playerKey, player);

        // 🔥 Sinkronisasi ke Persistent PointManager
        try {
            pointManager.addPoints(user, points, "paz", `Menang Puzzle PAZ (+${points})`);
        } catch (err) {
            console.error("❌ [POINTS ERROR] Gagal sync poin paz:", err.message);
        }

        const winner = {
            name: this._getPlayerName(user),
            id: this._getPlayerId(user),
            answer,
            elapsed,
            remaining,
            points,
        };

        await this._saveOverlay({
            mode: "paz",
            active: true,
            status: "solved",

            digits: this.digits,

            puzzle: this.puzzleNumber,

            masked: this._formatAnswer(answer),

            answer,

            timeLimit: this.timeLimit,
            remaining,

            startedAt: this.startedAt,
            endsAt: this.endsAt,

            winner,

            message: `${winner.name} BENAR! +${points} poin`,
        });

        this.emit("correct", {
            ...winner,
            puzzle: this.puzzleNumber,
        });

        // Beri waktu singkat agar overlay
        // sempat menampilkan hasil.
        await this._delay(1800);

        if (!this.running) return;

        await this._nextPuzzle();

        return {
            success: true,
            reason: "correct",
            winner,
        };
    }

    // =========================================================
    // TIMEOUT
    // =========================================================

    async _timeout() {
        if (!this.running) return;

        if (this.answerLocked) return;

        this.answerLocked = true;

        this._clearTimer();

        this.stats.timeout++;

        const answer = this.currentPuzzle
            ? this.currentPuzzle.answer
            : null;

        await this._saveOverlay({
            mode: "paz",
            active: true,
            status: "timeout",

            digits: this.digits,

            puzzle: this.puzzleNumber,

            masked: answer
                ? this._formatAnswer(answer)
                : this._createMasked(),

            answer,

            timeLimit: this.timeLimit,
            remaining: 0,

            startedAt: this.startedAt,
            endsAt: this.endsAt,

            winner: null,

            message: `⏰ Waktu habis! Jawaban: ${answer}`,
        });

        this.emit("timeout", {
            puzzle: this.puzzleNumber,
            answer,
            digits: this.digits,
        });

        await this._delay(2500);

        if (!this.running) return;

        await this._nextPuzzle();
    }

    // =========================================================
    // STOP
    // =========================================================

    async stop(options = {}) {
        const silent = options.silent === true;
        const reason = options.reason || "manual";

        if (!this.running) {
            return {
                success: false,
                reason: "not_running",
                message: "PAZ tidak sedang berjalan.",
            };
        }

        this.running = false;

        this._clearTimer();

        const summary = {
            total: this.stats.total,
            solved: this.stats.solved,
            timeout: this.stats.timeout,
            digits: this.digits,
            reason,
            leaderboard: this.getLeaderboard(),
        };

        this.currentPuzzle = null;
        this.answerLocked = false;

        await this._saveOverlay({
            mode: "paz",
            active: false,
            status: "stopped",

            digits: this.digits,

            puzzle: this.puzzleNumber,

            masked: null,
            answer: null,

            timeLimit: this.timeLimit,
            remaining: 0,

            winner: null,

            message: "PAZ dihentikan.",
        });

        if (!silent) {
            this.emit("stop", summary);
        }

        return {
            success: true,
            summary,
        };
    }

    // =========================================================
    // COMMAND HANDLER
    // =========================================================

    async handleCommand(message, user = {}) {
        if (!message) {
            return {
                handled: false,
            };
        }

        const text = String(message)
            .trim()
            .toLowerCase();

        // ==========================================
        // !paz stop
        // ==========================================

        if (text === "!paz stop") {
            const result = await this.stop();

            return {
                handled: true,
                type: "stop",
                result,
            };
        }

        // ==========================================
        // !stop paz
        // ==========================================

        if (text === "!stop paz") {
            const result = await this.stop();

            return {
                handled: true,
                type: "stop",
                result,
            };
        }

        // ==========================================
        // !paz 2
        // !paz 3
        // !paz 4
        // ==========================================

        const startMatch = text.match(/^!paz\s+([234])$/);

        if (startMatch) {
            const digits = Number(startMatch[1]);

            const result = await this.start(digits);

            return {
                handled: true,
                type: "start",
                result,
            };
        }

        // ==========================================
        // !paz 123
        // ==========================================

        const answerMatch = text.match(/^!paz\s+(\d+)$/);

        if (answerMatch && this.running) {
            const answer = answerMatch[1];

            const result = await this.answer(
                user,
                answer
            );

            return {
                handled: true,
                type: "answer",
                result,
            };
        }

        // ==========================================
        // !123
        // ==========================================

        const directAnswerMatch = text.match(/^!(\d+)$/);

        if (directAnswerMatch && this.running) {
            const answer = directAnswerMatch[1];

            const result = await this.answer(
                user,
                answer
            );

            return {
                handled: true,
                type: "answer",
                result,
            };
        }

        return {
            handled: false,
        };
    }

    // =========================================================
    // NORMALIZE ANSWER
    // =========================================================

    _normalizeAnswer(value) {
        if (value === undefined || value === null) {
            return null;
        }

        const answer = String(value).trim();

        if (!/^\d+$/.test(answer)) {
            return null;
        }

        return answer;
    }

    // =========================================================
    // FORMAT ANSWER
    // =========================================================

    _formatAnswer(answer) {
        if (!answer) return null;

        return answer
            .split("")
            .join(" ");
    }

    // =========================================================
    // PLAYER KEY
    // =========================================================

    _getPlayerKey(user) {
        return String(
            user.id ||
            user.userId ||
            user.channelId ||
            user.name ||
            user.username ||
            "anonymous"
        );
    }

    // =========================================================
    // PLAYER NAME
    // =========================================================

    _getPlayerName(user) {
        return (
            user.name ||
            user.username ||
            user.displayName ||
            "Anonymous"
        );
    }

    // =========================================================
    // PLAYER ID
    // =========================================================

    _getPlayerId(user) {
        return (
            user.id ||
            user.userId ||
            user.channelId ||
            null
        );
    }

    // =========================================================
    // LEADERBOARD
    // =========================================================

    getLeaderboard(limit = 10) {
        return [...this.players.values()]
            .sort((a, b) => {
                if (b.points !== a.points) {
                    return b.points - a.points;
                }

                return b.wins - a.wins;
            })
            .slice(0, limit)
            .map((player, index) => ({
                rank: index + 1,
                name: player.name,
                wins: player.wins,
                points: player.points,
            }));
    }

    // =========================================================
    // CURRENT STATE
    // =========================================================

    getState() {
        if (!this.running || !this.currentPuzzle) {
            return {
                running: false,
            };
        }

        const remaining = Math.max(
            0,
            Math.ceil(
                (this.endsAt - Date.now()) / 1000
            )
        );

        return {
            running: true,

            digits: this.digits,

            puzzle: this.puzzleNumber,

            masked: this._createMasked(),

            remaining,

            timeLimit: this.timeLimit,

            startedAt: this.startedAt,

            endsAt: this.endsAt,

            stats: {
                ...this.stats,
            },

            leaderboard: this.getLeaderboard(),
        };
    }

    // =========================================================
    // IS RUNNING
    // =========================================================

    isRunning() {
        return this.running;
    }

    // =========================================================
    // CLEAR TIMER
    // =========================================================

    _clearTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    // =========================================================
    // SAVE OVERLAY
    // =========================================================

    async _saveOverlay(data) {
        try {
            overlayState.set({
                paz: {
                    ...data,
                    updatedAt: Date.now(),
                }
            });
        } catch (error) {
            console.error(
                "[PAZ] Gagal update overlay:",
                error.message
            );
        }
    }

    // =========================================================
    // DELAY
    // =========================================================

    _delay(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }

    // =========================================================
    // RESET
    // =========================================================

    async reset() {
        this._clearTimer();

        this.running = false;

        this.currentPuzzle = null;

        this.puzzleNumber = 0;

        this.stats = {
            total: 0,
            solved: 0,
            timeout: 0,
        };

        this.players.clear();

        this.answerLocked = false;

        await this._saveOverlay({
            mode: "paz",
            active: false,
            status: "idle",
            digits: 2,
            puzzle: 0,
            masked: null,
            answer: null,
            remaining: 0,
            winner: null,
            message: "PAZ idle.",
        });
    }
}

// =============================================================
// SINGLETON
// =============================================================

const paz = new PazGame();

module.exports = paz;
module.exports.PazGame = PazGame;