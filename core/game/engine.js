// core/game/engine.js
const EventEmitter = require("events");
const pointManager = require("../points/pointManager");
const pointRules = require("../points/pointRules");
const overlayState = require("../utils/overlayState");
const context = require("../../utils/context");

function updateOverlay(data) {
    return overlayState.set(data);
}

class TebakKataGame extends EventEmitter {
    constructor() {
        super();

        this.active = false;
        this.questions = [];
        this.currentIndex = 0;
        this.currentQuestionNo = 0;

        this.answer = "";
        this.answerRaw = "";
        this.winners = [];

        this.scores = new Map();

        this.timer = null;
        this.gapTimer = null;
        this.timerStartFallback = null;
        this.finishTimeout = null;

        this.pointTable = [5, 3, 1];
        this.MIN_ANSWER_LENGTH = 2;
        this.TIMER_START_FALLBACK_MS = 20000;
        this.QUESTION_DURATION_MS = 20000;
    }

    isActive() {
        return this.active;
    }

    sendEvent(data) {
        const overlayData = {
            mode: "game",
            ...data
        };

        this.emit("event", overlayData);
        updateOverlay(overlayData);
    }

    start(questions) {
        const validQuestions = (questions || []).filter(q => {
            const ans = q.answer || q.jawaban || q.correct || "";
            if (!ans || String(ans).trim().length < this.MIN_ANSWER_LENGTH) {
                console.warn("⚠️ Soal dilewati, jawaban kosong/terlalu pendek:", q);
                return false;
            }
            return true;
        });

        this.questions = validQuestions;
        this.currentIndex = 0;
        this.active = true;
        try {
            context.updateStatus({ isGameActive: true, gamePhase: "question" });
        } catch (_) {}

        this.scores.clear();

        if (this.questions.length === 0) {
            console.error("❌ Tidak ada soal valid, game dibatalkan.");
            this.active = false;
            return;
        }

        this.nextQuestion();
    }

    nextQuestion() {
        if (!this.active) return;

        clearTimeout(this.timer);
        clearTimeout(this.gapTimer);
        clearTimeout(this.timerStartFallback);
        this.timer = null;

        if (this.currentIndex >= this.questions.length) {
            this.finishGame();
            return;
        }

        const q = this.questions[this.currentIndex];

        console.log("🎯 SOAL RAW:", q);

        const clue =
            q.clue ||
            q.question ||
            q.soal ||
            q.hint ||
            "Tebak kata ini";

        const answer =
            q.answer ||
            q.jawaban ||
            q.correct ||
            "";

        this.answerRaw = answer;
        this.answer = this.normalize(answer);
        this.winners = [];
        this.currentQuestionNo = q.no || this.currentIndex + 1;

        const clueText = this.generateLetterClue(answer);

        this.currentClue = clue;
        this.currentLetterClue = clueText;
        this.currentAnswerLength = answer.length;

        this.sendEvent({
            type: "question",
            no: this.currentQuestionNo,
            clue: clue,
            answerLength: answer.length,
            letterClue: clueText,
            time: 20
        });

        this.timerStartFallback = setTimeout(() => {
            console.warn("⚠️ startTimer() belum dipanggil, memaksa mulai timer (fallback).");
            this.startTimer();
        }, this.TIMER_START_FALLBACK_MS);
    }

    startTimer() {
        if (!this.active) return;
        if (this.timer) return; // sudah berjalan, jangan dobel

        clearTimeout(this.timerStartFallback);

        const questionNo = this.currentQuestionNo;

        this.sendEvent({
            type: "timerStart",
            no: questionNo,
            clue: this.currentClue,
            answerLength: this.currentAnswerLength,
            letterClue: this.currentLetterClue,
            time: this.QUESTION_DURATION_MS / 1000
        });

        this.timer = setTimeout(() => {
            if (!this.active) return;

            this.sendEvent({
                type: "result",
                no: questionNo,
                answer: this.answerRaw,
                winners: this.winners
            });

            this.currentIndex++;

            this.gapTimer = setTimeout(() => {
                this.nextQuestion();
            }, 5000);

        }, this.QUESTION_DURATION_MS);
    }

    // 🏆 FINISH GAME
    finishGame() {
        this.active = false;
        try {
            context.updateStatus({ isGameActive: false, gamePhase: "idle" });
        } catch (_) {}

        const ranking = [...this.scores.values()]
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        console.log("\n==============================");
        console.log("🏆 HASIL AKHIR LEADERBOARD");
        console.log("==============================");

        if (ranking.length === 0) {
            console.log("Belum ada pemenang.");
        } else {
            ranking.forEach((player, index) => {
                console.log(`${index + 1}. ${player.name} - ${player.score} poin`);
            });
        }

        console.log("==============================\n");

        this.sendEvent({
            type: "leaderboard",
            data: ranking
        });

        // ⏱️ Kembalikan overlay ke standby dashboard setelah 25 detik
        clearTimeout(this.finishTimeout);
        this.finishTimeout = setTimeout(() => {
            if (!this.active) {
                updateOverlay({
                    mode: "dashboard",
                    type: "idle",
                    message: "Game selesai. Menunggu aktivitas..."
                });
            }
        }, 25000);
    }

    normalize(text = "") {
        return String(text)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
    }

    normalizeUserKey(name = "") {
        return String(name).trim().toLowerCase();
    }

    generateLetterClue(answer = "") {
        const chars = String(answer).split("");

        const indexes = chars
            .map((char, index) => /[a-zA-Z0-9]/.test(char) ? index : -1)
            .filter(index => index !== -1);

        if (!indexes.length) return answer;

        const randomIndex = indexes[Math.floor(Math.random() * indexes.length)];

        return chars
            .map((char, index) => {
                if (index === randomIndex) return char.toUpperCase();
                if (char === " ") return " ";
                return "_";
            })
            .join(" ");
    }

    checkAnswer(user, message) {
        if (!this.active) return null;

        if (!this.answer || this.answer.length < this.MIN_ANSWER_LENGTH) {
            return null;
        }

        const msg = this.normalize(message);
        if (msg.length < 2) return null;

        const userName = typeof user === "object" && user !== null ? (user.name || user.username || "Player") : String(user);
        const userKey = this.normalizeUserKey(userName);

        if (this.winners.find(w => w.key === userKey)) {
            return null;
        }

        const isMatch =
            msg === this.answer ||
            (this.answer.length >= 4 && msg.includes(this.answer));

        if (isMatch) {
            const rank = this.winners.length;
            let point = 1;
            if (rank === 0) point = pointRules.POINTS.TEBAK_KATA_WIN_1 || 5;
            else if (rank === 1) point = pointRules.POINTS.TEBAK_KATA_WIN_2 || 3;
            else if (rank === 2) point = pointRules.POINTS.TEBAK_KATA_WIN_3 || 1;

            this.winners.push({ name: userName, key: userKey, point });

            const existing = this.scores.get(userKey);
            const prevScore = existing ? existing.score : 0;

            this.scores.set(userKey, { name: userName, score: prevScore + point });

            // 🔥 Sinkronisasi ke Persistent PointManager
            try {
                pointManager.addPoints(user, point, "tebak_kata", `Juara ${rank + 1} Tebak Kata`);
            } catch (err) {
                console.error("❌ [POINTS ERROR] Gagal sync poin tebak_kata:", err.message);
            }

            return { correct: true, user: userName, point, rank: rank + 1 };
        }

        return null;
    }

    stop() {
        this.active = false;
        try {
            context.updateStatus({ isGameActive: false, gamePhase: "idle" });
        } catch (_) {}

        clearTimeout(this.timer);
        clearTimeout(this.gapTimer);
        clearTimeout(this.timerStartFallback);
        clearTimeout(this.finishTimeout);

        this.timer = null;
        this.gapTimer = null;
        this.timerStartFallback = null;
        this.finishTimeout = null;

        this.questions = [];
        this.currentIndex = 0;
        this.winners = [];
        this.scores.clear();

        // Bersihkan antrean audio soal jika ada
        try {
            const audio = require("../audio");
            if (audio && typeof audio.clearQueue === "function") {
                audio.clearQueue();
            }
        } catch (_) {}

        this.emit("event", { type: "stopped" });

        overlayState.reset("dashboard", "Game tebak kata dihentikan.");
    }
}

module.exports = new TebakKataGame();