// overlay/soal.js
// Modern HUD Controller for Kak Jule Tebak Kata Overlay

window.SoalOverlay = (() => {
    let clueEl;
    let wordEl;
    let answerEl;
    let answerCardEl;
    let leaderboardEl;
    let timerEl;
    let timerCardEl;
    let timerRingEl;
    let qNoEl;
    let wordLenHintEl;
    let lbHeadingEl;

    let timerInterval = null;
    let totalTimerSeconds = 20;
    const RING_CIRCUMFERENCE = 113.1; // 2 * Math.PI * 18

    function init() {
        clueEl = document.getElementById("clue");
        wordEl = document.getElementById("word");
        answerEl = document.getElementById("answer");
        answerCardEl = document.getElementById("answer-card");
        leaderboardEl = document.getElementById("leaderboard");
        timerEl = document.getElementById("timer");
        timerCardEl = document.getElementById("timer-card");
        timerRingEl = document.getElementById("timer-ring");
        qNoEl = document.getElementById("q-no");
        wordLenHintEl = document.getElementById("word-len-hint");
        lbHeadingEl = document.getElementById("lb-heading");

        console.log("🎯 [Kak Jule] Modern Soal Overlay Controller Initialized");
    }

    function cleanText(text = "") {
        return String(text)
            .replace(/\n/g, " ")
            .replace(/\r/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function escapeHTML(text = "") {
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function safe(text) {
        return escapeHTML(cleanText(text));
    }

    function updateTimerRing(remaining, total) {
        if (!timerRingEl) return;
        const fraction = Math.max(0, Math.min(1, remaining / (total || 20)));
        const offset = RING_CIRCUMFERENCE * (1 - fraction);
        timerRingEl.style.strokeDashoffset = offset.toFixed(1);
    }

    function startTimer(seconds) {
        clearInterval(timerInterval);

        totalTimerSeconds = Number(seconds) || 20;
        let time = totalTimerSeconds;

        if (timerEl) timerEl.textContent = time;
        if (timerCardEl) timerCardEl.classList.remove("danger");
        updateTimerRing(time, totalTimerSeconds);

        timerInterval = setInterval(() => {
            time--;

            if (timerEl) timerEl.textContent = Math.max(0, time);
            updateTimerRing(time, totalTimerSeconds);

            if (time <= 5 && timerCardEl) {
                timerCardEl.classList.add("danger");
            }

            if (time <= 0) {
                clearInterval(timerInterval);
            }
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        if (timerCardEl) timerCardEl.classList.remove("danger");
    }

    function renderWordTiles(text) {
        const cleaned = cleanText(text);
        if (!cleaned) return "";

        // Tokens are separated by space (from letterClue or masked representation)
        const tokens = cleaned.split(/\s+/);
        return tokens.map(tok => {
            if (tok === "_") {
                return `<span class="letter-tile masked">_</span>`;
            } else if (tok === "") {
                return `<span class="letter-tile space">&nbsp;</span>`;
            } else {
                return `<span class="letter-tile revealed">${escapeHTML(tok)}</span>`;
            }
        }).join("");
    }

    function renderClueAndWord(data) {
        if (qNoEl && data.no) {
            qNoEl.textContent = `#${data.no}`;
        }

        if (clueEl) {
            clueEl.textContent = cleanText(data.clue) || "Menunggu soal...";
        }

        if (wordLenHintEl && data.answerLength) {
            wordLenHintEl.textContent = `${data.answerLength} HURUF`;
        }

        if (wordEl) {
            const rawClue = data.letterClue || (data.answerLength ? Array(Number(data.answerLength)).fill("_").join(" ") : "");
            wordEl.innerHTML = renderWordTiles(rawClue);
        }
    }

    function update(data) {
        if (!clueEl) init();
        if (!data || !data.type) return;

        switch (data.type) {
            case "question":
                stopTimer();
                renderClueAndWord(data);

                if (answerEl) answerEl.textContent = "";
                if (answerCardEl) answerCardEl.classList.remove("show");
                if (leaderboardEl) leaderboardEl.innerHTML = "";
                if (lbHeadingEl) lbHeadingEl.textContent = "TOP PENJAWAB TERCEPAT";

                const staticTime = Number(data.time) || 20;
                totalTimerSeconds = staticTime;
                if (timerEl) timerEl.textContent = staticTime;
                updateTimerRing(staticTime, staticTime);
                break;

            case "timerStart":
                renderClueAndWord(data);
                startTimer(data.time);
                break;

            case "result":
                stopTimer();

                const answerText = cleanText(data.answer);
                if (answerEl) {
                    answerEl.textContent = answerText.toUpperCase();
                }
                if (answerCardEl) {
                    answerCardEl.classList.add("show");
                }

                // Tampilkan huruf lengkap di word box
                if (wordEl && answerText) {
                    const fullLetters = answerText.split("").join(" ");
                    wordEl.innerHTML = renderWordTiles(fullLetters);
                }

                if (leaderboardEl) {
                    const winners = data.winners || [];
                    if (winners.length === 0) {
                        leaderboardEl.innerHTML = `
                            <div class="no-winners">
                                ⏳ Belum ada yang menjawab tepat waktu ronde ini!
                            </div>
                        `;
                    } else {
                        leaderboardEl.innerHTML = winners.map((w, i) => {
                            const rank = i + 1;
                            const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`;
                            return `
                                <div class="player-row rank-${rank}">
                                    <div class="player-left">
                                        <span class="player-rank-badge">${medal}</span>
                                        <span class="player-name">${safe(w.name)}</span>
                                    </div>
                                    <span class="player-point-pill">+${Number(w.point) || 0} POIN</span>
                                </div>
                            `;
                        }).join("");
                    }
                }
                break;

            case "leaderboard":
                stopTimer();

                if (clueEl) clueEl.textContent = "Pertandingan selesai! Terima kasih semua yang sudah bermain.";
                if (wordEl) wordEl.innerHTML = '<span class="round-over-badge">🏆 GAME SELESAI</span>';
                if (wordLenHintEl) wordLenHintEl.textContent = "";
                if (answerCardEl) answerCardEl.classList.remove("show");
                if (lbHeadingEl) lbHeadingEl.textContent = "🏆 HASIL AKHIR LEADERBOARD";

                if (leaderboardEl) {
                    const players = data.data || [];
                    if (players.length === 0) {
                        leaderboardEl.innerHTML = `
                            <div class="no-winners">
                                Belum ada pemenang yang tercatat.
                            </div>
                        `;
                    } else {
                        leaderboardEl.innerHTML = players.map((p, i) => {
                            const rank = i + 1;
                            const medal = rank === 1 ? "👑" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`;
                            return `
                                <div class="player-row rank-${rank}">
                                    <div class="player-left">
                                        <span class="player-rank-badge">${medal}</span>
                                        <span class="player-name">${safe(p.name)}</span>
                                    </div>
                                    <span class="player-point-pill">${Number(p.score) || 0} POIN</span>
                                </div>
                            `;
                        }).join("");
                    }
                }
                break;
        }
    }

    function destroy() {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    return {
        init,
        update,
        destroy
    };
})();
