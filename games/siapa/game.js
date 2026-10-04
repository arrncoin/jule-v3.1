// games/siapa/game.js
// Master Game Engine for SIAPA Interactive Survival Livechat Game
const EventEmitter = require("events");
const Player = require("./player");
const storage = require("./storage");
const { REWARDS, getRoundSurvivalPoints } = require("./scoring");
const { calculateRoundSchedule, resolveRound, fairShuffle } = require("./rounds");
const EVENTS = require("./events");
const logger = require("../../core/utils/logger");
const overlayState = require("../../core/utils/overlayState");
const pointManager = require("../../core/points/pointManager");

class SiapaGameEngine extends EventEmitter {
    constructor() {
        super();
        this.status = "idle"; // "idle" | "lobby" | "running" | "eliminating" | "winner"
        this.players = new Map(); // username.toLowerCase() -> Player
        this.alivePlayers = []; // Array of active Player
        this.eliminatedPlayers = []; // Array of eliminated Player
        
        this.roundSchedule = [];
        this.currentRoundIndex = 0;
        this.currentRoundConfig = null;

        this.lobbyCountdown = 20; // Default 20 detik pendaftaran
        this.roundCountdown = 0;
        this.timer = null;
        this.roundStateTimer = null;

        this.lastEliminated = []; // Nama-nama yang baru saja gugur (max 15 untuk visual)
        this.recentJoined = []; // Nama-nama yang baru saja join (max 10 untuk visual)
        this.winner = null;
        this.runnerUp = null;
        this.finalPlayers = [];

        this.gameStartedAt = 0;
        this.initiator = "Streamer";
        this.speakHandler = null;
    }

    /**
     * Daftarkan handler TTS (Kak Jule)
     */
    setSpeakHandler(handler) {
        this.speakHandler = handler;
    }

    speak(text, priority = false) {
        if (typeof this.speakHandler === "function") {
            try {
                this.speakHandler(text, priority);
            } catch (_) {}
        }
    }

    isActive() {
        return this.status !== "idle";
    }

    isLobby() {
        return this.status === "lobby";
    }

    /**
     * Memulai game / lobby baru
     * @param {string} initiator
     * @param {number} [customLobbySeconds=20]
     */
    startLobby(initiator = "Streamer", customLobbySeconds = 20) {
        if (this.isActive()) {
            return {
                success: false,
                message: "⚠️ Game SIAPA sedang berlangsung! Tunggu sampai game selesai."
            };
        }

        this.resetInternal();
        this.status = "lobby";
        this.initiator = initiator;
        this.gameStartedAt = Date.now();
        this.lobbyCountdown = Math.max(10, Math.min(60, Number(customLobbySeconds) || 20));

        logger.info(`⚡ [SIAPA] GAME STARTED — Lobby dibuka oleh ${initiator}. Pendaftaran ${this.lobbyCountdown} detik.`);
        this.speak(`Game survival Siapa Yang Akan Bertahan telah dibuka! Ketik tanda seru join di chat sekarang untuk masuk arena!`, true);

        this.emit(EVENTS.GAME_STARTED, { initiator, countdown: this.lobbyCountdown });
        this.emit(EVENTS.LOBBY_START, { countdown: this.lobbyCountdown });
        this.syncOverlay();

        this.clearTimers();
        this.timer = setInterval(() => {
            this.lobbyCountdown--;
            this.emit(EVENTS.LOBBY_COUNTDOWN, { countdown: this.lobbyCountdown, playersCount: this.players.size });
            this.syncOverlay();

            if (this.lobbyCountdown <= 0) {
                this.closeLobbyAndStart();
            }
        }, 1000);

        return {
            success: true,
            message: `⚡ Arena SIAPA dibuka! Ketik !join untuk mendaftar (waktu: ${this.lobbyCountdown}s)`
        };
    }

    /**
     * Menambahkan pemain ke dalam arena
     * @param {string} rawUsername
     * @param {Object} [meta]
     */
    join(rawUsername, meta = {}) {
        if (this.status !== "lobby") {
            return { success: false, reason: "lobby_closed", message: "Pendaftaran SIAPA sudah ditutup atau game sedang berjalan." };
        }

        if (!rawUsername) return { success: false, reason: "invalid_username" };
        const cleanName = String(rawUsername).replace(/^@/, "").trim();
        const lowerName = cleanName.toLowerCase();

        if (this.players.has(lowerName)) {
            return { success: false, reason: "already_joined", message: "Kamu sudah terdaftar di arena ini!" };
        }

        if (this.players.size >= 1000) {
            return { success: false, reason: "arena_full", message: "Kapasitas arena penuh (maksimal 1000 pemain)!" };
        }

        const player = new Player(cleanName);
        player.addPoints(REWARDS.JOIN); // +10 poin registrasi
        this.players.set(lowerName, player);

        // Queue visual recent joined
        this.recentJoined.push(cleanName);
        if (this.recentJoined.length > 15) {
            this.recentJoined.shift();
        }

        logger.info(`[SIAPA] PLAYER JOINED: @${cleanName} (Total: ${this.players.size}/1000)`);
        this.emit(EVENTS.PLAYER_JOINED, {
            username: cleanName,
            totalPlayers: this.players.size,
            player: player.toJSON()
        });
        this.syncOverlay();

        return {
            success: true,
            username: cleanName,
            totalPlayers: this.players.size,
            points: player.points
        };
    }

    /**
     * Memproses aksi/pilihan challenge pemain saat ronde berlangsung
     * @param {string} rawUsername
     * @param {string} action
     */
    handlePlayerInput(rawUsername, action) {
        if (this.status !== "running" || !this.currentRoundConfig) return false;
        if (!rawUsername || !action) return false;

        const lowerName = String(rawUsername).replace(/^@/, "").trim().toLowerCase();
        const player = this.players.get(lowerName);

        if (!player || !player.alive) return false;

        const cleanAction = String(action).toLowerCase().trim();
        player.setAction(cleanAction);
        return true;
    }

    /**
     * Menutup pendaftaran dan memulai ronde 1
     */
    closeLobbyAndStart() {
        this.clearTimers();
        this.emit(EVENTS.LOBBY_CLOSED, { totalPlayers: this.players.size });

        const totalJoined = this.players.size;
        if (totalJoined < 2) {
            logger.warn(`⚠️ [SIAPA] Pemain kurang dari 2 (terdaftar: ${totalJoined}). Game dibatalkan.`);
            this.speak("Pemain yang bergabung kurang dari dua orang. Arena Siapa Yang Akan Bertahan dibatalkan. Yuk coba lagi nanti!", true);
            this.reset();
            return;
        }

        // Siapkan array alivePlayers
        this.alivePlayers = Array.from(this.players.values());
        this.roundSchedule = calculateRoundSchedule(totalJoined);
        this.currentRoundIndex = 0;

        logger.info(`[SIAPA] LOBBY CLOSED — Total: ${totalJoined} pemain. Jadwal ronde: ${this.roundSchedule.length} ronde.`);
        this.speak(`Pendaftaran ditutup! Sebanyak ${totalJoined} pemain telah memasuki arena! Ronde satu dimulai sekarang!`, true);
        this.syncOverlay();

        // Jeda 2 detik sebelum masuk ke Ronde 1
        setTimeout(() => {
            this.startNextRound();
        }, 2000);
    }

    /**
     * Memulai ronde berikutnya
     */
    startNextRound() {
        if (!this.isActive() || this.alivePlayers.length <= 1) {
            this.finalizeWinner();
            return;
        }

        if (this.currentRoundIndex >= this.roundSchedule.length) {
            // Jika ronde habis tetapi pemain masih > 1, paksa Final Duel
            this.currentRoundConfig = {
                roundNumber: this.currentRoundIndex + 1,
                targetSurvivors: 1,
                challenge: {
                    id: "FINAL_DUEL",
                    title: "⚔️ FINAL DUEL ⚔️",
                    badge: "PENENTUAN JUARA",
                    desc: "Duel terakhir penentuan juara!",
                    duration: 10
                }
            };
        } else {
            this.currentRoundConfig = this.roundSchedule[this.currentRoundIndex];
        }

        this.status = "running";
        const roundNum = this.currentRoundConfig.roundNumber;
        const totalRounds = this.roundSchedule.length;
        const challenge = this.currentRoundConfig.challenge;
        const aliveCount = this.alivePlayers.length;

        // Reset aksi pemain dari ronde sebelumnya
        for (const p of this.alivePlayers) {
            p.resetAction();
        }

        // Cek kondisi Final
        if (aliveCount <= 2) {
            this.finalPlayers = this.alivePlayers.map(p => p.toJSON());
            this.emit(EVENTS.FINAL_DUEL, { finalPlayers: this.finalPlayers });
        } else if (aliveCount <= 10) {
            this.emit(EVENTS.FINAL_STARTED, { aliveCount });
        }

        this.roundCountdown = challenge.duration || 10;
        logger.info(`[SIAPA] ROUND STARTED — Ronde ${roundNum}/${totalRounds}: ${challenge.title} | ${aliveCount} pemain bertahan`);

        // Suara pengumuman Kak Jule
        if (aliveCount === 2) {
            this.speak(`Final duel dua pemain terhebat! ${this.alivePlayers[0].username} melawan ${this.alivePlayers[1].username}! Siapa yang akan bertahan?`, true);
        } else if (roundNum === 1) {
            this.speak(`Ronde satu! Tantangan: ${challenge.title}. ${challenge.desc}`);
        } else {
            this.speak(`Ronde ${roundNum}! ${challenge.title}! ${challenge.desc}`);
        }

        this.emit(EVENTS.ROUND_STARTED, {
            round: roundNum,
            totalRounds,
            alive: aliveCount,
            totalPlayers: this.players.size,
            challenge,
            countdown: this.roundCountdown
        });
        this.syncOverlay();

        // Timer tantangan
        this.clearTimers();
        this.timer = setInterval(() => {
            this.roundCountdown--;
            this.emit(EVENTS.CHALLENGE_TICK, { countdown: this.roundCountdown });
            this.syncOverlay();

            if (this.roundCountdown <= 0) {
                this.executeElimination();
            }
        }, 1000);
    }

    /**
     * Menjalankan proses eliminasi ronde setelah countdown selesai
     */
    executeElimination() {
        this.clearTimers();
        this.status = "eliminating";

        const { survivors, eliminated, meta } = resolveRound(
            this.currentRoundConfig,
            this.alivePlayers,
            this.players.size
        );

        this.alivePlayers = survivors;
        for (const e of eliminated) {
            this.eliminatedPlayers.push(e);
        }

        // Simpan daftar pemain yang baru gugur untuk ditampilkan pada overlay
        this.lastEliminated = eliminated.slice(0, 12).map(e => ({
            username: e.username,
            rank: e.rank,
            round: e.round
        }));

        // Berikan reward poin bertahan ke seluruh survivor di ronde ini
        const roundPoints = getRoundSurvivalPoints(this.currentRoundConfig.roundNumber);
        for (const s of survivors) {
            s.addPoints(roundPoints);
        }

        logger.info(`[SIAPA] ROUND COMPLETED — Ronde ${this.currentRoundConfig.roundNumber}. Gugur: ${eliminated.length} | Selamat: ${survivors.length}. ${meta.detail}`);

        this.emit(EVENTS.ROUND_COMPLETED, {
            round: this.currentRoundConfig.roundNumber,
            totalRounds: this.roundSchedule.length,
            alive: survivors.length,
            eliminatedCount: eliminated.length,
            lastEliminated: this.lastEliminated,
            meta,
            survivorReward: roundPoints
        });
        this.syncOverlay();

        // Pengumuman suara eliminasi
        if (survivors.length > 1) {
            this.speak(`${eliminated.length} pemain tereliminasi! Tersisa ${survivors.length} pemain yang masih bertahan!`);
        }

        this.currentRoundIndex++;

        // Jeda transisi animasi dramatis (3.5 detik) sebelum lanjut ke ronde berikutnya
        this.roundStateTimer = setTimeout(() => {
            if (this.alivePlayers.length <= 1) {
                this.finalizeWinner();
            } else {
                this.startNextRound();
            }
        }, 3500);
    }

    /**
     * Menentukan dan mengumumkan pemenang akhir
     */
    finalizeWinner() {
        this.clearTimers();
        this.status = "winner";

        const winnerPlayer = this.alivePlayers[0] || this.eliminatedPlayers[this.eliminatedPlayers.length - 1];
        const runnerUpPlayer = this.eliminatedPlayers.find(p => p.rank === 2) || (this.alivePlayers.length > 1 ? this.alivePlayers[1] : null);

        if (winnerPlayer) {
            winnerPlayer.rank = 1;
            winnerPlayer.addPoints(REWARDS.WINNER); // +1000 poin kemenangan
        }

        if (runnerUpPlayer) {
            runnerUpPlayer.addPoints(REWARDS.RUNNER_UP); // +500 runner-up
        }

        const top3Player = this.eliminatedPlayers.find(p => p.rank === 3);
        if (top3Player) {
            top3Player.addPoints(REWARDS.TOP_3); // +300 top 3
        }

        this.winner = winnerPlayer ? winnerPlayer.toJSON() : null;
        this.runnerUp = runnerUpPlayer ? runnerUpPlayer.toJSON() : null;

        // Simpan hasil ke database SQLite secara atomik & persisten
        try {
            storage.recordGameResult({
                players: Array.from(this.players.values()).map(p => p.toJSON()),
                totalRounds: this.roundSchedule.length,
                winner: this.winner,
                runnerUp: this.runnerUp
            });

            // 🔥 Sinkronisasi seluruh poin pemain ke PointManager utama
            for (const p of this.players.values()) {
                if (p.points > 0) {
                    try {
                        const desc = p.rank === 1
                            ? `Juara 1 SIAPA (+${p.points} poin)`
                            : (p.rank === 2
                                ? `Runner Up SIAPA (+${p.points} poin)`
                                : (p.rank === 3
                                    ? `Top 3 SIAPA (+${p.points} poin)`
                                    : `Partisipasi SIAPA (${p.round || 1} ronde, +${p.points} poin)`));
                        pointManager.addPoints(p.username, p.points, "siapa", desc);
                    } catch (_) {}
                }
            }

            logger.info(`[SIAPA] POINTS AWARDED & SAVED TO PERSISTENT DATABASE`);
        } catch (err) {
            console.error("❌ [SIAPA ERROR] Gagal simpan hasil game ke database:", err.message);
        }

        const winnerStats = winnerPlayer ? storage.getPlayerStats(winnerPlayer.username) : null;
        const winnerName = winnerPlayer ? winnerPlayer.username : "Tidak Ada";

        logger.info(`[SIAPA] WINNER — 🏆 @${winnerName} berhasil bertahan dan menjadi Juara SIAPA!`);
        this.speak(`Luar biasa! Selamat kepada ${winnerName} yang berhasil menjadi satu-satunya yang bertahan di arena Siapa! Kamu memenangkan seribu poin!`, true);

        this.emit(EVENTS.WINNER, {
            winner: this.winner,
            runnerUp: this.runnerUp,
            stats: winnerStats
        });
        this.syncOverlay();

        // Durasi tampilan selebrasi pemenang (10 detik) sebelum game berakhir
        this.roundStateTimer = setTimeout(() => {
            this.endGame();
        }, 10000);
    }

    /**
     * Mengakhiri sesi game dan kembali ke standby
     */
    endGame() {
        this.clearTimers();
        logger.info(`[SIAPA] GAME ENDED — Arena kembali ke mode standby.`);
        this.emit(EVENTS.GAME_ENDED, { winner: this.winner });
        this.status = "idle";
        this.syncOverlay();
    }

    /**
     * Menghentikan game secara paksa oleh streamer / admin
     * @param {string} stoppedBy
     */
    stop(stoppedBy = "Streamer") {
        if (!this.isActive()) {
            return { success: false, message: "ℹ️ Tidak ada game SIAPA yang sedang berjalan." };
        }

        this.clearTimers();
        logger.warn(`[SIAPA] GAME STOPPED — Dihentikan oleh ${stoppedBy}.`);
        this.speak("Permainan Siapa Yang Akan Bertahan telah dihentikan.", true);

        // Poin yang sudah diberikan sebelum stop tetap tersimpan di storage dan PointManager
        try {
            storage.recordGameResult({
                players: Array.from(this.players.values()).map(p => p.toJSON()),
                totalRounds: this.currentRoundIndex + 1,
                winner: null,
                runnerUp: null
            });

            for (const p of this.players.values()) {
                if (p.points > 0) {
                    try {
                        pointManager.addPoints(p.username, p.points, "siapa", `Partisipasi SIAPA (+${p.points} poin)`);
                    } catch (_) {}
                }
            }
        } catch (_) {}

        this.emit(EVENTS.GAME_STOPPED, { stoppedBy });
        this.resetInternal();
        this.status = "idle";
        this.syncOverlay();

        return { success: true, message: "⏹️ Game SIAPA berhasil dihentikan." };
    }

    /**
     * Reset total state game
     */
    reset() {
        this.clearTimers();
        this.resetInternal();
        this.status = "idle";
        this.emit(EVENTS.GAME_ENDED, { reset: true });
        this.syncOverlay();
        return { success: true, message: "🔄 Game SIAPA berhasil di-reset ke status standby." };
    }

    resetInternal() {
        this.players.clear();
        this.alivePlayers = [];
        this.eliminatedPlayers = [];
        this.roundSchedule = [];
        this.currentRoundIndex = 0;
        this.currentRoundConfig = null;
        this.lastEliminated = [];
        this.recentJoined = [];
        this.winner = null;
        this.runnerUp = null;
        this.finalPlayers = [];
        this.gameStartedAt = 0;
    }

    clearTimers() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.roundStateTimer) {
            clearTimeout(this.roundStateTimer);
            this.roundStateTimer = null;
        }
    }

    /**
     * Mengembalikan status game saat ini untuk overlay & API
     */
    getPublicState() {
        const totalPlayers = this.players.size;
        const aliveCount = this.alivePlayers.length;
        const eliminatedCount = this.eliminatedPlayers.length;
        const totalRounds = this.roundSchedule.length || 1;
        const currentRound = this.currentRoundConfig ? this.currentRoundConfig.roundNumber : 0;

        let winnerStats = null;
        if (this.winner) {
            winnerStats = storage.getPlayerStats(this.winner.username);
        }

        return {
            game: "siapa",
            status: this.status, // "idle" | "lobby" | "running" | "eliminating" | "winner"
            round: currentRound,
            totalRounds,
            players: totalPlayers,
            alive: aliveCount,
            eliminated: eliminatedCount,
            countdown: this.status === "lobby" ? this.lobbyCountdown : this.roundCountdown,
            totalCountdown: this.status === "lobby" ? 20 : (this.currentRoundConfig?.challenge?.duration || 10),
            currentChallenge: this.currentRoundConfig ? this.currentRoundConfig.challenge : null,
            lastEliminated: this.lastEliminated,
            recentJoined: this.recentJoined,
            finalPlayers: this.finalPlayers,
            winner: this.winner ? {
                ...this.winner,
                stats: winnerStats
            } : null,
            runnerUp: this.runnerUp,
            leaderboard: storage.getLeaderboard(5),
            updatedAt: Date.now()
        };
    }

    /**
     * Sinkronkan state game dengan OverlayState OBS
     */
    syncOverlay() {
        try {
            if (this.isActive()) {
                overlayState.set({
                    mode: "siapa",
                    ...this.getPublicState()
                });
            } else {
                overlayState.set({
                    mode: "dashboard"
                });
            }
        } catch (_) {}
    }
}

module.exports = new SiapaGameEngine();
