// games/siapa/rounds.js
// Dynamic Round Scaling, Event Types, and Fair Elimination Mechanics

const crypto = require("crypto");

/**
 * Fisher-Yates fair shuffle algorithm
 */
function fairShuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        // High-entropy random integer
        const j = crypto.randomInt(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Challenge Event Definitions
 */
const CHALLENGES = [
    {
        id: "CHOOSE",
        title: "ZONA KIRI ATAU KANAN",
        badge: "PILIH SISI",
        desc: "Ketik !kiri atau !kanan di chat! Salah satu sisi akan dihantam laser bahaya!",
        prompt: "PILIH: !kiri ATAU !kanan",
        duration: 10,
        type: "choice"
    },
    {
        id: "NUMBER",
        title: "KODE BRANKAS AMAN",
        badge: "PILIH ANGKA",
        desc: "Ketik !pilih 1 sampai !pilih 5 di chat! Temukan nomor pintu perlindungan!",
        prompt: "PILIH: !pilih 1 s/d !pilih 5",
        duration: 10,
        type: "number"
    },
    {
        id: "FREEZE",
        title: "DON'T MOVE! FREEZE!",
        badge: "SENSOR LASER",
        desc: "Sensor getaran aktif! Tahan napasmu dan jangan bergerak!",
        prompt: "TAHAN POSISI! SENSOR LASER AKTIF!",
        duration: 8,
        type: "freeze"
    },
    {
        id: "METEOR",
        title: "METEOR STRIKE",
        badge: "ZONA METEOR",
        desc: "Meteor menghujam arena! Sektor aman: 1 (Alpha), 2 (Beta), 3 (Gamma)!",
        prompt: "PILIH SEKTOR: !pilih 1, 2, atau 3",
        duration: 10,
        type: "sector"
    },
    {
        id: "DUEL",
        title: "BATTLE ROYALE DUEL",
        badge: "CLASH 1 VS 1",
        desc: "Arena memasangkan pemain secara acak 1 lawan 1! Yang terkuat bertahan!",
        prompt: "DUEL CLASH OTOMATIS BERLANGSUNG!",
        duration: 8,
        type: "duel"
    },
    {
        id: "SURVIVAL",
        title: "PULSE ENERGY SURVIVAL",
        badge: "GELOMBANG ENERGI",
        desc: "Gelombang radiasi arena menyapu seluruh peserta! Bertahanlah sekuat tenaga!",
        prompt: "GELOMBANG RADIASI MENYAPU ARENA!",
        duration: 8,
        type: "survival"
    }
];

const FINAL_CHALLENGE = {
    id: "FINAL_DUEL",
    title: "⚔️ FINAL DUEL ⚔️",
    badge: "PENENTUAN JUARA",
    desc: "Dua pemain terhebat bertarung untuk supremasi juara bertahan!",
    prompt: "DUEL TERAKHIR! SIAPA YANG AKAN BERTAHAN?",
    duration: 12,
    type: "final"
};

/**
 * Menghitung jadwal ronde dinamis berdasarkan jumlah pemain awal
 * @param {number} totalPlayers
 * @returns {Array<{ roundNumber: number, targetSurvivors: number, challenge: Object }>}
 */
function calculateRoundSchedule(totalPlayers) {
    const N = Math.max(2, totalPlayers);
    const schedule = [];

    if (N === 2) {
        return [
            { roundNumber: 1, targetSurvivors: 1, challenge: FINAL_CHALLENGE }
        ];
    }

    if (N === 3) {
        return [
            { roundNumber: 1, targetSurvivors: 2, challenge: CHALLENGES[0] },
            { roundNumber: 2, targetSurvivors: 1, challenge: FINAL_CHALLENGE }
        ];
    }

    // Tentukan target langkah survivor bertahap
    const survivorTargets = [];

    if (N <= 10) {
        // 4 - 10 players -> 3-4 rounds
        const mid = Math.max(3, Math.floor(N * 0.55));
        survivorTargets.push(mid);
        if (mid > 3) survivorTargets.push(3);
        survivorTargets.push(2);
        survivorTargets.push(1);
    } else if (N <= 50) {
        // 11 - 50 players -> 4-5 rounds
        survivorTargets.push(Math.floor(N * 0.60));
        survivorTargets.push(Math.floor(N * 0.35));
        survivorTargets.push(Math.min(10, Math.floor(N * 0.18)));
        survivorTargets.push(2);
        survivorTargets.push(1);
    } else if (N <= 100) {
        // 51 - 100 players -> 5-6 rounds
        survivorTargets.push(Math.floor(N * 0.65));
        survivorTargets.push(Math.floor(N * 0.40));
        survivorTargets.push(Math.floor(N * 0.22));
        survivorTargets.push(10);
        survivorTargets.push(2);
        survivorTargets.push(1);
    } else if (N <= 500) {
        // 101 - 500 players -> 6-7 rounds
        survivorTargets.push(Math.floor(N * 0.65));
        survivorTargets.push(Math.floor(N * 0.40));
        survivorTargets.push(Math.floor(N * 0.22));
        survivorTargets.push(Math.floor(N * 0.10));
        survivorTargets.push(12);
        survivorTargets.push(2);
        survivorTargets.push(1);
    } else {
        // 501 - 1000 players -> 7-8 rounds
        survivorTargets.push(Math.floor(N * 0.65));
        survivorTargets.push(Math.floor(N * 0.42));
        survivorTargets.push(Math.floor(N * 0.25));
        survivorTargets.push(Math.floor(N * 0.12));
        survivorTargets.push(40);
        survivorTargets.push(12);
        survivorTargets.push(2);
        survivorTargets.push(1);
    }

    // Bersihkan target: pastikan selalu menurun dan unik
    const cleanTargets = [];
    let last = N;
    for (const target of survivorTargets) {
        if (target < last && target >= 1) {
            cleanTargets.push(target);
            last = target;
        }
    }
    if (cleanTargets[cleanTargets.length - 1] !== 1) {
        cleanTargets.push(1);
    }

    // Pasangkan dengan challenge acak (tanpa pengulangan beruntun)
    const shuffledChallenges = fairShuffle(CHALLENGES);
    let challengeIdx = 0;

    cleanTargets.forEach((target, index) => {
        const roundNum = index + 1;
        let challenge;
        if (target === 1) {
            challenge = FINAL_CHALLENGE;
        } else {
            challenge = shuffledChallenges[challengeIdx % shuffledChallenges.length];
            challengeIdx++;
        }

        schedule.push({
            roundNumber: roundNum,
            targetSurvivors: target,
            challenge
        });
    });

    return schedule;
}

/**
 * Memproses eliminasi ronde secara fair dan adil
 * @param {Object} roundConfig - Ronde saat ini
 * @param {Array<Player>} alivePlayers - Pemain yang masih bertahan
 * @param {number} totalOriginalPlayers - Total pemain dari awal game
 * @returns {{ survivors: Array<Player>, eliminated: Array<Player>, meta: Object }}
 */
function resolveRound(roundConfig, alivePlayers, totalOriginalPlayers) {
    const currentAlive = [...alivePlayers];
    const targetCount = Math.max(1, Math.min(roundConfig.targetSurvivors, currentAlive.length - 1));
    const challenge = roundConfig.challenge;

    const meta = {
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        safeChoice: null,
        detail: ""
    };

    let rankedCandidates = [];

    switch (challenge.id) {
        case "CHOOSE": {
            // Zona aman KIRI atau KANAN
            const safeSide = crypto.randomInt(0, 2) === 0 ? "kiri" : "kanan";
            const dangerSide = safeSide === "kiri" ? "kanan" : "kiri";
            meta.safeChoice = safeSide.toUpperCase();
            meta.detail = `Zona Aman: ${safeSide.toUpperCase()}! Zona Bahaya ${dangerSide.toUpperCase()} Tereliminasi!`;

            // Cek pilihan pemain (jika pemain belum milih, acak fair)
            const matchedSafe = [];
            const matchedDanger = [];

            for (const p of currentAlive) {
                const choice = (p.currentAction || "").toLowerCase().trim();
                if (choice === safeSide) {
                    matchedSafe.push(p);
                } else if (choice === dangerSide) {
                    matchedDanger.push(p);
                } else {
                    // Belum memilih: 50% random fair assign
                    if (crypto.randomInt(0, 2) === 0) {
                        matchedSafe.push(p);
                    } else {
                        matchedDanger.push(p);
                    }
                }
            }

            // Gabungkan kandidat: yang memilih aman berada di atas, danger di bawah
            rankedCandidates = [...fairShuffle(matchedSafe), ...fairShuffle(matchedDanger)];
            break;
        }

        case "NUMBER": {
            // Pilih 1 dari 5 angka aman
            const safeNumber = String(crypto.randomInt(1, 6)); // 1 s/d 5
            meta.safeChoice = `Nomor ${safeNumber}`;
            meta.detail = `Nomor Pintu Perlindungan: ${safeNumber}!`;

            const matched = [];
            const unmatched = [];

            for (const p of currentAlive) {
                const choice = String(p.currentAction || "").replace(/\D/g, "");
                if (choice === safeNumber) {
                    matched.push(p);
                } else {
                    unmatched.push(p);
                }
            }

            rankedCandidates = [...fairShuffle(matched), ...fairShuffle(unmatched)];
            break;
        }

        case "METEOR": {
            // 3 Sektor (1, 2, 3)
            const safeSector = String(crypto.randomInt(1, 4));
            const sectorNames = { "1": "Alpha", "2": "Beta", "3": "Gamma" };
            meta.safeChoice = `Sektor ${sectorNames[safeSector] || safeSector}`;
            meta.detail = `Meteor Menghantam Sektor Lain! Sektor ${sectorNames[safeSector]} Selamat!`;

            const matched = [];
            const unmatched = [];

            for (const p of currentAlive) {
                const choice = String(p.currentAction || "").replace(/\D/g, "");
                if (choice === safeSector) {
                    matched.push(p);
                } else {
                    unmatched.push(p);
                }
            }

            rankedCandidates = [...fairShuffle(matched), ...fairShuffle(unmatched)];
            break;
        }

        case "DUEL": {
            // Pairing 1 vs 1 secara acak
            meta.detail = "Duel 1 lawan 1 sengit di arena!";
            const shuffled = fairShuffle(currentAlive);
            const winners = [];
            const losers = [];

            for (let i = 0; i < shuffled.length; i += 2) {
                if (i + 1 < shuffled.length) {
                    const p1 = shuffled[i];
                    const p2 = shuffled[i + 1];
                    // High entropy duel roll
                    if (crypto.randomInt(0, 2) === 0) {
                        winners.push(p1);
                        losers.push(p2);
                    } else {
                        winners.push(p2);
                        losers.push(p1);
                    }
                } else {
                    // Bye player (ganjil) otomatis lanjut
                    winners.push(shuffled[i]);
                }
            }

            rankedCandidates = [...fairShuffle(winners), ...fairShuffle(losers)];
            break;
        }

        case "FINAL_DUEL": {
            meta.detail = "Puncak pertempuran final duel live arena!";
            // Acak pemenang final duel secara 50:50 murni
            rankedCandidates = fairShuffle(currentAlive);
            break;
        }

        case "FREEZE":
        case "SURVIVAL":
        default: {
            // Roll survival score fair
            meta.detail = "Sensor arena mengeliminasi pemain dengan skor terendah!";
            const scored = currentAlive.map(p => ({
                player: p,
                score: crypto.randomInt(1000, 999999)
            }));
            scored.sort((a, b) => b.score - a.score);
            rankedCandidates = scored.map(s => s.player);
            break;
        }
    }

    // Potong sesuai kuota target survivors
    const survivors = rankedCandidates.slice(0, targetCount);
    const eliminated = rankedCandidates.slice(targetCount);

    // Tandai pemain yang gugur dan berikan rank
    const currentRoundNum = roundConfig.roundNumber;
    // Rank dihitung dari total pemain saat ini mundur
    eliminated.forEach((p, idx) => {
        // Misal sisa 10 pemain, 5 dieliminasi -> rank #10, #9, #8, #7, #6
        const rank = currentAlive.length - idx;
        p.eliminate(rank, currentRoundNum);
    });

    return {
        survivors,
        eliminated,
        meta
    };
}

module.exports = {
    CHALLENGES,
    FINAL_CHALLENGE,
    calculateRoundSchedule,
    resolveRound,
    fairShuffle
};
