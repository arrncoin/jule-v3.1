// overlay/leaderboard.js

window.LeaderboardOverlay = {
    listEl: null,
    titleEl: null,
    badgeEl: null,
    statusEl: null,
    toastEl: null,
    toastTitle: null,
    toastSub: null,
    toastIcon: null,
    toastTimeout: null,
    eventSource: null,

    init() {
        console.log("🏆 [LeaderboardOverlay] Initialized in dynamic router");
        this.listEl = document.getElementById("leaderboard-list");
        this.titleEl = document.getElementById("lb-title");
        this.badgeEl = document.getElementById("lb-badge");
        this.statusEl = document.getElementById("connection-status");
        this.toastEl = document.getElementById("point-toast");
        this.toastTitle = document.getElementById("toast-title");
        this.toastSub = document.getElementById("toast-sub");
        this.toastIcon = document.getElementById("toast-icon");

        this.initSSE();
        this.fetchData();
    },

    update(data) {
        if (!this.listEl) this.init();
        if (!data) return;

        if (data.title && this.titleEl) {
            this.titleEl.textContent = data.title;
        }

        if (Array.isArray(data.leaderboard) && data.leaderboard.length > 0) {
            this.renderList(data.leaderboard);
        } else {
            this.fetchData();
        }
    },

    async fetchData() {
        try {
            const res = await fetch("/api/leaderboard?limit=10");
            if (!res.ok) return;
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                this.renderList(json.data);
            }
        } catch (err) {
            console.warn("⚠️ [LeaderboardOverlay] Fetch error:", err.message);
        }
    },

    renderList(items) {
        if (!this.listEl) return;
        if (!items || items.length === 0) {
            this.listEl.innerHTML = '<div class="empty-state">Belum ada data interaksi penonton.</div>';
            return;
        }

        const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };
        const html = items.map((user, idx) => {
            const rank = user.rank || idx + 1;
            const rankDisplay = medals[rank] || `#${rank}`;
            const rankClass = rank <= 3 ? `top-rank rank-${rank}` : "normal-rank";
            const name = this.escapeHtml(user.displayName || user.username || "Viewer");
            const points = Number(user.points || 0).toLocaleString("id-ID");
            const level = user.level || 1;
            const isTiktok = user.platform === "tiktok";
            const platformClass = isTiktok ? "platform-tiktok" : "platform-youtube";
            const platformLabel = isTiktok ? "TT" : "YT";

            return `
                <div class="leaderboard-item ${rankClass}">
                    <div class="col-rank"><span class="rank-badge">${rankDisplay}</span></div>
                    <div class="col-user user-cell">
                        <span class="platform-tag ${platformClass}">${platformLabel}</span>
                        <span class="user-name" title="${name}">${name}</span>
                    </div>
                    <div class="col-level level-cell"><span class="level-badge">Lv.${level}</span></div>
                    <div class="col-points points-cell">${points}</div>
                </div>
            `;
        }).join("");

        this.listEl.innerHTML = html;
    },

    initSSE() {
        if (this.eventSource) return;

        try {
            this.eventSource = new EventSource("/api/leaderboard/stream");

            this.eventSource.addEventListener("open", () => {
                if (this.statusEl) {
                    this.statusEl.className = "status-connected";
                    this.statusEl.textContent = "● Live";
                }
            });

            this.eventSource.addEventListener("point_added", (event) => {
                try {
                    const data = JSON.parse(event.data);
                    const notif = data.notification || data;
                    if (notif && (notif.user || notif.username)) {
                        this.showToast(notif);
                    }
                    if (Array.isArray(data.leaderboard) && data.leaderboard.length > 0) {
                        this.renderList(data.leaderboard);
                    } else {
                        this.fetchData();
                    }
                } catch (e) {
                    console.error("Error handling SSE point_added:", e);
                }
            });

            this.eventSource.addEventListener("leaderboard_update", (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (Array.isArray(data)) {
                        this.renderList(data);
                    }
                } catch (e) {
                    console.error("Error handling SSE leaderboard_update:", e);
                }
            });

            this.eventSource.addEventListener("error", () => {
                if (this.statusEl) {
                    this.statusEl.className = "status-connecting";
                    this.statusEl.textContent = "○ Reconnecting";
                }
            });
        } catch (err) {
            console.warn("SSE not available:", err.message);
        }
    },

    showToast(notif) {
        if (!this.toastEl) return;

        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }

        const user = notif.user || { username: notif.username, displayName: notif.displayName };
        const name = this.escapeHtml(user.displayName || user.username || notif.displayName || notif.username || "Viewer");
        const totalPoints = Number(notif.totalPoints || notif.points || user.points || 0).toLocaleString("id-ID");
        const added = Number(notif.amount || 0).toLocaleString("id-ID");
        const source = notif.source || "chat";
        const level = notif.level || user.level || 1;
        const isLevelUp = Boolean(notif.isLevelUp || (notif.oldLevel && notif.level > notif.oldLevel));

        let sourceLabel = "Interaksi Chat";
        let icon = "💬";
        if (source === "tebak_kata") {
            sourceLabel = "Juara Tebak Kata";
            icon = "🏆";
        } else if (source === "paz") {
            sourceLabel = "Pemenang Puzzle";
            icon = "🧩";
        } else if (source === "siapa") {
            sourceLabel = "Arena SIAPA";
            icon = "⚔️";
        } else if (source === "vote") {
            sourceLabel = "Live Polling";
            icon = "📊";
        } else if (source === "gift") {
            sourceLabel = "Gift TikTok";
            icon = "🎁";
        } else if (source === "superchat") {
            sourceLabel = "Super Chat";
            icon = "💎";
        } else if (source === "follow") {
            sourceLabel = "Follow Baru";
            icon = "🌟";
        } else if (source === "share") {
            sourceLabel = "Bagikan Live";
            icon = "🔁";
        } else if (source === "like") {
            sourceLabel = "Like Live";
            icon = "❤️";
        } else if (source === "manual") {
            sourceLabel = "Bonus Streamer";
            icon = "⭐";
        }

        if (isLevelUp) {
            icon = "🆙";
            if (this.toastTitle) this.toastTitle.textContent = `LEVEL UP! ${name} ke Lv.${level}!`;
            if (this.toastSub) this.toastSub.textContent = `+${added} Poin (${sourceLabel}) • Total: ${totalPoints}`;
        } else {
            if (this.toastTitle) this.toastTitle.textContent = `${name} +${added} Poin!`;
            if (this.toastSub) this.toastSub.textContent = `${sourceLabel} • Lv.${level} • Total: ${totalPoints}`;
        }
        if (this.toastIcon) this.toastIcon.textContent = icon;

        this.toastEl.classList.remove("hidden");

        this.toastTimeout = setTimeout(() => {
            this.toastEl.classList.add("hidden");
        }, 5000);
    },

    escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    destroy() {
        if (this.eventSource) {
            try { this.eventSource.close(); } catch (_) {}
            this.eventSource = null;
        }
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
            this.toastTimeout = null;
        }
    }
};