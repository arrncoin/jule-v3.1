// games/siapa/scoring.js
// Configurable Point Rewards for SIAPA Survival Game

const REWARDS = {
    // Reward saat berhasil join lobby
    JOIN: 10,

    // Reward per ronde yang berhasil dilewati hidup-hidup
    ROUND_SURVIVE_BASE: {
        1: 10,
        2: 20,
        3: 30,
        4: 50,
        5: 75,
        6: 100,
        7: 150,
        8: 200,
        9: 250,
        10: 300
    },

    // Default reward jika ronde melebihi tabel
    DEFAULT_ROUND_SURVIVE: 100,

    // Bonus penempatan akhir
    TOP_3: 300,
    RUNNER_UP: 500,
    WINNER: 1000
};

/**
 * Menghitung poin reward bertahan di ronde tertentu
 * @param {number} roundNumber
 * @returns {number}
 */
function getRoundSurvivalPoints(roundNumber) {
    if (REWARDS.ROUND_SURVIVE_BASE[roundNumber]) {
        return REWARDS.ROUND_SURVIVE_BASE[roundNumber];
    }
    return REWARDS.DEFAULT_ROUND_SURVIVE;
}

module.exports = {
    REWARDS,
    getRoundSurvivalPoints
};
