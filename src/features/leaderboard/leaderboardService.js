// src/features/leaderboard/leaderboardService.js
// Leaderboard service for formatting, voice synthesis text, and OBS overlay updates
const pointManager = require("../points/pointManager");
const overlayState = require("../../core/state/overlayState");
const { MEDALS } = require("../../core/constants");
const { formatNumber } = require("../../core/utils/helpers");

let leaderboardTimer = null;

class LeaderboardService {
    getTop(limit = 10) {
        return pointManager.getLeaderboard(limit);
    }

    formatLeaderboardText(limit = 5) {
        const topList = this.getTop(limit);
        const lines = [`🏆 TOP ${limit} LEADERBOARD`];

        if (!topList || topList.length === 0) {
            lines.push("Belum ada data perolehan poin.");
        } else {
            topList.forEach((u, i) => {
                const medal = MEDALS[i] || `${i + 1}️⃣`;
                const padName = (u.displayName || u.username).padEnd(12, " ");
                lines.push(`${medal} ${padName} ${formatNumber(u.points)}`);
            });
        }

        return {
            text: lines.join("\n"),
            topList
        };
    }

    getSpeechAnnouncement(topList) {
        if (!topList || topList.length === 0) {
            return "Belum ada viewer yang mengumpulkan poin. Yuk aktif di live stream!";
        }
        if (topList.length === 1) {
            const top1 = topList[0];
            return `Top 1 saat ini adalah ${top1.displayName || top1.username} dengan ${formatNumber(top1.points)} poin! Klasemen tampil di layar.`;
        }
        if (topList.length === 2) {
            const u1 = topList[0];
            const u2 = topList[1];
            return `Top klasemen saat ini: Juara 1 ${u1.displayName || u1.username} dengan ${formatNumber(u1.points)} poin, disusul ${u2.displayName || u2.username} ${formatNumber(u2.points)} poin.`;
        }
        const u1 = topList[0];
        const u2 = topList[1];
        const u3 = topList[2];
        return `Top klasemen saat ini: Juara 1 ${u1.displayName || u1.username} ${formatNumber(u1.points)} poin, Juara 2 ${u2.displayName || u2.username} ${formatNumber(u2.points)} poin, dan Juara 3 ${u3.displayName || u3.username} ${formatNumber(u3.points)} poin!`;
    }

    async showOnOverlay(limit = 5, durationMs = 25000) {
        const topList = this.getTop(limit);
        const now = Date.now();

        await overlayState.set({
            mode: "leaderboard",
            title: `TOP ${limit} LEADERBOARD`,
            leaderboard: topList,
            updatedAt: now
        });

        if (leaderboardTimer) {
            clearTimeout(leaderboardTimer);
        }

        if (durationMs > 0) {
            leaderboardTimer = setTimeout(() => {
                try {
                    const current = overlayState.get();
                    if (current && current.mode === "leaderboard") {
                        overlayState.reset("dashboard", "Menunggu aktivitas...");
                        console.log("📺 [OVERLAY] Layar otomatis kembali ke standby dashboard.");
                    }
                } catch (_) {}
            }, durationMs);

            if (leaderboardTimer && typeof leaderboardTimer.unref === "function") {
                leaderboardTimer.unref();
            }
        }

        return topList;
    }

    async hideFromOverlay() {
        if (leaderboardTimer) {
            clearTimeout(leaderboardTimer);
            leaderboardTimer = null;
        }
        return overlayState.set({ mode: "dashboard", type: "idle" });
    }
}

module.exports = new LeaderboardService();
