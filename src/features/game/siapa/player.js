// games/siapa/player.js
// Lightweight, High-Performance Player Model for SIAPA Survival Game

class Player {
    /**
     * @param {string} username
     * @param {string|null} id
     */
    constructor(username, id = null) {
        this.username = String(username || "").trim();
        this.id = id || `p_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        this.points = 0;
        this.alive = true;
        this.eliminated = false;
        this.rank = 0;
        this.round = 0;
        this.joinTime = Date.now();
        
        // Data aksi per ronde (misal: "kiri", "kanan", "3")
        this.currentAction = null;
        this.actionTime = 0;
    }

    /**
     * Set aksi pemain pada tantangan ronde
     * @param {string} action
     */
    setAction(action) {
        this.currentAction = action;
        this.actionTime = Date.now();
    }

    /**
     * Reset aksi pemain saat ronde baru dimulai
     */
    resetAction() {
        this.currentAction = null;
        this.actionTime = 0;
    }

    /**
     * Tandai pemain gugur
     * @param {number} rank
     * @param {number} round
     */
    eliminate(rank, round) {
        this.alive = false;
        this.eliminated = true;
        this.rank = rank;
        this.round = round;
    }

    /**
     * Tambah poin sementara dalam game
     * @param {number} pts
     */
    addPoints(pts) {
        this.points += Number(pts) || 0;
    }

    /**
     * Representasi ringkas untuk serialisasi JSON / State broadcast
     */
    toJSON() {
        return {
            username: this.username,
            id: this.id,
            points: this.points,
            alive: this.alive,
            eliminated: this.eliminated,
            rank: this.rank,
            round: this.round,
            joinTime: this.joinTime
        };
    }
}

module.exports = Player;
