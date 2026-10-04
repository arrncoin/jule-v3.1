// overlay/siapa/app.js
// High-Performance OBS Overlay Client for SIAPA Interactive Survival Game

(function () {
    "use strict";

    // =========================================================
    // 1. CANVAS PARTICLE & CONFETTI ENGINE (High-Perf, Low CPU)
    // =========================================================
    const canvas = document.getElementById("fx-canvas");
    const ctx = canvas.getContext("2d");
    let particles = [];
    let confettis = [];
    let shockwaves = [];
    let animationFrameId = null;

    function resizeCanvas() {
        canvas.width = 800;
        canvas.height = 1000;
    }
    resizeCanvas();

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * 800;
            this.y = 1000 + Math.random() * 50;
            this.vx = (Math.random() - 0.5) * 1.5;
            this.vy = -(Math.random() * 2 + 1);
            this.size = Math.random() * 3 + 1;
            this.alpha = Math.random() * 0.7 + 0.3;
            this.color = Math.random() > 0.5 ? "rgba(6, 182, 212," : "rgba(236, 72, 153,";
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.alpha -= 0.003;
            if (this.y < -10 || this.alpha <= 0) {
                this.reset();
            }
        }
        draw(ctx) {
            ctx.fillStyle = `${this.color}${this.alpha})`;
            ctx.shadowBlur = 8;
            ctx.shadowColor = this.color.includes("182") ? "#06b6d4" : "#ec4899";
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    class Confetti {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 12 + 4;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed - 6;
            this.gravity = 0.35;
            this.size = Math.random() * 8 + 4;
            this.rotation = Math.random() * 360;
            this.rotSpeed = (Math.random() - 0.5) * 15;
            this.colors = ["#fbbf24", "#06b6d4", "#ec4899", "#10b981", "#ffffff", "#f472b6"];
            this.color = this.colors[Math.floor(Math.random() * this.colors.length)];
            this.alpha = 1;
        }
        update() {
            this.vy += this.gravity;
            this.x += this.vx;
            this.y += this.vy;
            this.rotation += this.rotSpeed;
            if (this.y > 600) {
                this.alpha -= 0.015;
            }
        }
        draw(ctx) {
            if (this.alpha <= 0) return;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate((this.rotation * Math.PI) / 180);
            ctx.globalAlpha = Math.max(0, this.alpha);
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 0.6);
            ctx.restore();
        }
    }

    class Shockwave {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.radius = 10;
            this.maxRadius = 450;
            this.alpha = 1;
        }
        update() {
            this.radius += 18;
            this.alpha = 1 - this.radius / this.maxRadius;
        }
        draw(ctx) {
            if (this.alpha <= 0) return;
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(239, 68, 68, ${this.alpha})`;
            ctx.lineWidth = 6;
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#ef4444";
            ctx.stroke();
            ctx.restore();
        }
    }

    // Initialize ambient particles
    for (let i = 0; i < 40; i++) {
        const p = new Particle();
        p.y = Math.random() * 1000;
        particles.push(p);
    }

    function triggerConfettiBurst() {
        for (let i = 0; i < 90; i++) {
            confettis.push(new Confetti(400, 450));
        }
    }

    function triggerShockwaveBurst() {
        shockwaves.push(new Shockwave(400, 500));
    }

    function renderLoop() {
        ctx.clearRect(0, 0, 800, 1000);

        // Draw ambient particles
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw(ctx);
        }

        // Draw shockwaves
        for (let i = shockwaves.length - 1; i >= 0; i--) {
            shockwaves[i].update();
            shockwaves[i].draw(ctx);
            if (shockwaves[i].alpha <= 0) {
                shockwaves.splice(i, 1);
            }
        }

        // Draw confettis
        for (let i = confettis.length - 1; i >= 0; i--) {
            confettis[i].update();
            confettis[i].draw(ctx);
            if (confettis[i].alpha <= 0 || confettis[i].y > 1050) {
                confettis.splice(i, 1);
            }
        }

        animationFrameId = requestAnimationFrame(renderLoop);
    }
    renderLoop();

    // =========================================================
    // 2. STATE SYNC & DOM MANAGEMENT
    // =========================================================
    const views = {
        idle: document.getElementById("view-idle"),
        lobby: document.getElementById("view-lobby"),
        round: document.getElementById("view-round"),
        eliminating: document.getElementById("view-eliminating"),
        final: document.getElementById("view-final"),
        winner: document.getElementById("view-winner")
    };

    // Header elements
    const arenaBadge = document.getElementById("arena-badge");
    const roundLabelText = document.getElementById("round-label-text");
    const headerAliveVal = document.getElementById("header-alive-val");
    const roundDots = document.getElementById("round-dots");

    // Lobby elements
    const lobbyCountdownNumber = document.getElementById("lobby-countdown-number");
    const lobbyPlayersCount = document.getElementById("lobby-players-count");
    const lobbyProgressFill = document.getElementById("lobby-progress-fill");
    const radialProgressBar = document.getElementById("radial-progress-bar");
    const recentJoinedList = document.getElementById("recent-joined-list");

    // Round elements
    const roundAliveRatio = document.getElementById("round-alive-ratio");
    const roundAliveFill = document.getElementById("round-alive-fill");
    const challengeBadge = document.getElementById("challenge-badge");
    const challengeTitle = document.getElementById("challenge-title");
    const challengeDesc = document.getElementById("challenge-desc");
    const challengePrompt = document.getElementById("challenge-prompt");
    const challengeTimerVal = document.getElementById("challenge-timer-val");
    const challengeTimerFill = document.getElementById("challenge-timer-fill");
    const roundActivityFeed = document.getElementById("round-activity-feed");

    // Eliminating elements
    const eliminationStrobe = document.getElementById("elimination-strobe");
    const eliminatingResultDetail = document.getElementById("eliminating-result-detail");
    const elimCountVal = document.getElementById("elim-count-val");
    const survivorCountVal = document.getElementById("survivor-count-val");
    const victimsList = document.getElementById("victims-list");

    // Final elements
    const finalModeBadge = document.getElementById("final-mode-badge");
    const finalDuelBox = document.getElementById("final-duel-box");
    const finalGeneralBox = document.getElementById("final-general-box");
    const duelP1Name = document.getElementById("duel-p1-name");
    const duelP1Points = document.getElementById("duel-p1-points");
    const duelP2Name = document.getElementById("duel-p2-name");
    const duelP2Points = document.getElementById("duel-p2-points");
    const finalAliveNum = document.getElementById("final-alive-num");

    // Winner elements
    const winnerUsername = document.getElementById("winner-username");
    const winnerStatPoints = document.getElementById("winner-stat-points");
    const winnerStatWins = document.getElementById("winner-stat-wins");
    const winnerStatRank = document.getElementById("winner-stat-rank");

    // Idle element
    const idleLeaderboardList = document.getElementById("idle-leaderboard-list");

    let lastState = null;
    let lastRenderedView = null;
    let winnerCelebrated = false;

    function switchView(activeViewKey) {
        if (lastRenderedView === activeViewKey) return;
        lastRenderedView = activeViewKey;

        Object.keys(views).forEach(key => {
            if (key === activeViewKey) {
                views[key].classList.remove("hidden");
                views[key].classList.add("active");
            } else {
                views[key].classList.add("hidden");
                views[key].classList.remove("active");
            }
        });
    }

    function updateRoundDots(currentRound, totalRounds) {
        roundDots.innerHTML = "";
        const count = Math.max(1, totalRounds || 6);
        for (let i = 1; i <= count; i++) {
            const dot = document.createElement("div");
            dot.className = "round-dot";
            if (i < currentRound) {
                dot.classList.add("done");
            } else if (i === currentRound) {
                dot.classList.add("active");
            }
            roundDots.appendChild(dot);
        }
    }

    function render(state) {
        if (!state) return;

        const isGameActive = state.status && state.status !== "idle";
        const currentStatus = state.status || "idle";

        // Header status
        headerAliveVal.textContent = state.alive || 0;
        const totalRounds = Math.max(1, state.totalRounds || 6);
        const currentRound = state.round || (currentStatus === "lobby" ? 1 : 0);
        roundLabelText.textContent = `ROUND 0${currentRound} / 0${totalRounds}`;
        updateRoundDots(currentRound, totalRounds);

        // Badge
        if (!isGameActive) {
            arenaBadge.textContent = "STANDBY";
            arenaBadge.className = "arena-badge badge-standby";
        } else if (currentStatus === "eliminating") {
            arenaBadge.textContent = "DANGER";
            arenaBadge.className = "arena-badge badge-danger";
        } else {
            arenaBadge.textContent = "LIVE";
            arenaBadge.className = "arena-badge badge-active";
        }

        // View Routing
        switch (currentStatus) {
            case "idle": {
                winnerCelebrated = false;
                switchView("idle");
                if (Array.isArray(state.leaderboard) && state.leaderboard.length > 0) {
                    idleLeaderboardList.innerHTML = state.leaderboard.slice(0, 5).map((p, idx) => `
                        <div class="leader-row">
                            <span>${idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`} ${p.username}</span>
                            <span class="pts">${p.totalPoints} PTS (${p.wins}W)</span>
                        </div>
                    `).join("");
                }
                break;
            }

            case "lobby": {
                winnerCelebrated = false;
                switchView("lobby");

                const countdown = Math.max(0, state.countdown || 0);
                const totalCd = state.totalCountdown || 20;
                lobbyCountdownNumber.textContent = countdown;

                // Radial circle animation (circumference = 2 * PI * 88 ~= 552.92)
                const circumference = 552.92;
                const offset = circumference - (countdown / totalCd) * circumference;
                radialProgressBar.style.strokeDashoffset = offset;

                // Players counter
                const count = state.players || 0;
                lobbyPlayersCount.textContent = `${count} / 1000`;
                const progressPct = Math.min(100, (count / 1000) * 100);
                lobbyProgressFill.style.width = `${progressPct}%`;

                // Recent joined chips
                if (Array.isArray(state.recentJoined)) {
                    recentJoinedList.innerHTML = state.recentJoined.slice(-8).map(name => `
                        <div class="joined-tag">@${name}</div>
                    `).join("");
                }
                break;
            }

            case "running": {
                winnerCelebrated = false;
                const alive = state.alive || 0;
                const total = Math.max(1, state.players || 1);

                // Check for Final Duel (2 players) or Final 10
                if (alive <= 2 && Array.isArray(state.finalPlayers) && state.finalPlayers.length === 2) {
                    switchView("final");
                    finalModeBadge.textContent = "⚔️ FINAL DUEL ⚔️";
                    finalDuelBox.classList.remove("hidden");
                    finalGeneralBox.classList.add("hidden");

                    const p1 = state.finalPlayers[0];
                    const p2 = state.finalPlayers[1];
                    duelP1Name.textContent = p1.username;
                    duelP1Points.textContent = `+${p1.points || 0} PTS`;
                    duelP2Name.textContent = p2.username;
                    duelP2Points.textContent = `+${p2.points || 0} PTS`;
                } else if (alive <= 10) {
                    switchView("final");
                    finalModeBadge.textContent = alive === 3 ? "🔥 FINAL THREE 🔥" : `🔥 FINAL ${alive} 🔥`;
                    finalDuelBox.classList.add("hidden");
                    finalGeneralBox.classList.remove("hidden");
                    finalAliveNum.textContent = alive;
                } else {
                    switchView("round");
                    const pct = Math.round((alive / total) * 100);
                    roundAliveRatio.textContent = `${alive} / ${total} (${pct}%)`;
                    roundAliveFill.style.width = `${pct}%`;

                    const ch = state.currentChallenge || {};
                    challengeBadge.textContent = ch.badge || "TANTANGAN";
                    challengeTitle.textContent = ch.title || "SURVIVAL ROUND";
                    challengeDesc.textContent = ch.desc || "Bertahanlah dari eliminasi arena!";
                    challengePrompt.textContent = ch.prompt || "IKUTI INSTRUKSI DI CHAT!";

                    const cd = Math.max(0, state.countdown || 0);
                    const totalCd = ch.duration || 10;
                    challengeTimerVal.textContent = `${cd}s`;
                    const cdPct = (cd / totalCd) * 100;
                    challengeTimerFill.style.width = `${cdPct}%`;
                }
                break;
            }

            case "eliminating": {
                winnerCelebrated = false;
                switchView("eliminating");

                // Trigger screen shake and strobe
                eliminationStrobe.classList.remove("hidden");
                setTimeout(() => {
                    eliminationStrobe.classList.add("hidden");
                }, 300);
                triggerShockwaveBurst();

                elimCountVal.textContent = state.lastEliminated ? state.lastEliminated.length : state.eliminated;
                survivorCountVal.textContent = state.alive || 0;

                const detail = state.currentChallenge?.detail || (state.currentChallenge ? `${state.currentChallenge.title} Telah Berakhir!` : "Eliminasi Berlangsung!");
                eliminatingResultDetail.textContent = detail;

                if (Array.isArray(state.lastEliminated)) {
                    victimsList.innerHTML = state.lastEliminated.map(p => `
                        <div class="victim-chip">
                            <span>@${p.username}</span>
                            <span class="rank">#${p.rank || "?"}</span>
                        </div>
                    `).join("");
                }
                break;
            }

            case "winner": {
                switchView("winner");
                if (!winnerCelebrated) {
                    winnerCelebrated = true;
                    triggerConfettiBurst();
                    setInterval(triggerConfettiBurst, 2500);
                }

                if (state.winner) {
                    winnerUsername.textContent = `@${state.winner.username}`;
                    const stats = state.winner.stats || {};
                    winnerStatPoints.textContent = Number(stats.totalPoints || state.winner.points || 1000).toLocaleString();
                    winnerStatWins.textContent = stats.wins || 1;
                    winnerStatRank.textContent = `#${stats.bestRank || 1}`;
                }
                break;
            }
        }

        lastState = state;
    }

    // =========================================================
    // 3. POLLING SYNC MECHANISM (350ms Low-Latency Poller)
    // =========================================================
    async function fetchState() {
        try {
            const res = await fetch("/api/siapa/state?t=" + Date.now(), { cache: "no-store" });
            if (res.ok) {
                const data = await res.json();
                render(data);
                return;
            }
        } catch (_) {
            // Fallback to unified overlay endpoint
            try {
                const res2 = await fetch("/state/overlay.json?t=" + Date.now(), { cache: "no-store" });
                if (res2.ok) {
                    const data2 = await res2.json();
                    if (data2 && data2.game === "siapa") {
                        render(data2);
                    }
                }
            } catch (err) {}
        }
    }

    fetchState();
    setInterval(fetchState, 350);

    // Initial Leaderboard Load
    async function loadInitialLeaderboard() {
        try {
            const res = await fetch("/api/siapa/leaderboard?limit=5", { cache: "no-store" });
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.leaderboard)) {
                    idleLeaderboardList.innerHTML = data.leaderboard.map((p, idx) => `
                        <div class="leader-row">
                            <span>${idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`} ${p.username}</span>
                            <span class="pts">${p.totalPoints} PTS (${p.wins}W)</span>
                        </div>
                    `).join("");
                }
            }
        } catch (_) {}
    }
    loadInitialLeaderboard();

})();
