// overlay/voting.js

class VotingOverlay {
    constructor() {
        this.container = null;
        this.optionsContainer = null;
        this.totalVotesEl = null;
    }

    /**
     * Dipanggil otomatis oleh script.js setelah HTML disisipkan ke DOM
     */
    init() {
        this.container = document.getElementById("voting-container");
        this.optionsContainer = document.getElementById("voting-options");
        this.totalVotesEl = document.getElementById("total-votes");

        if (this.container) {
            this.container.classList.remove("hidden");
        }
    }

    /**
     * Dipanggil otomatis oleh script.js setiap kali data overlay.json berubah
     * @param {Object} data - Contoh isi: { mode: "voting", title: "Siapa Pilihanmu?", options: ["ronaldo", "messi"], tally: { ronaldo: 2, messi: 5 }, winners: ["messi"] }
     */
    update(data) {
        if (!data) return;

        const options = data.options || [];
        const tally = data.tally || {};
        const winners = data.winners || [];

        // Tampilkan/sembunyikan panel sesuai mode dari backend.
        // mode "voting" mencakup baik saat aktif maupun saat menampilkan
        // pemenang sesaat setelah stop(); "dashboard" berarti idle/reset.
        if (this.container) {
            const shouldShow = data.mode === "voting" || options.length > 0;
            this.container.classList.toggle("hidden", !shouldShow);
        }

        if (!options.length) return;

        // 1. Update judul voting (jika ada)
        const titleEl = document.getElementById("voting-title");
        if (titleEl && data.title) {
            titleEl.innerText = data.title.toUpperCase();
        }

        // 2. Jika opsi belum di-render atau berubah, render ulang DOM opsi
        if (this.optionsContainer && this.optionsContainer.children.length !== options.length) {
            this.renderOptions(options);
        }

        // 3. Update angka, progress bar, urutan (leaderboard), dan status leading/winner
        this.updateVotes(options, tally, winners);
    }

    /**
     * Render elemen HTML untuk setiap opsi
     */
    renderOptions(options) {
        if (!this.optionsContainer) return;
        this.optionsContainer.innerHTML = "";

        options.forEach((opt) => {
            const item = document.createElement("div");
            item.className = "option-item";
            item.id = `opt-${this.sanitizeId(opt)}`;

            item.innerHTML = `
                <div class="progress-bar" id="bar-${this.sanitizeId(opt)}"></div>
                <div class="option-content">
                    <span class="option-name">${opt}</span>
                    <span class="option-percentage" id="stats-${this.sanitizeId(opt)}">0%</span>
                </div>
            `;

            this.optionsContainer.appendChild(item);
        });
    }

    /**
     * Hitung perolehan suara, sesuaikan progress bar, urutkan opsi
     * dari suara terbanyak (biar terasa scoreboard beneran), lalu
     * tandai opsi yang sedang unggul (live) atau pemenang (final).
     */
    updateVotes(options, tally, winners) {
        let total = 0;
        Object.values(tally).forEach(count => total += Number(count) || 0);

        if (this.totalVotesEl) {
            this.totalVotesEl.innerText = total;
        }

        let maxCount = 0;

        options.forEach((opt) => {
            const count = tally[opt] || 0;
            if (count > maxCount) maxCount = count;

            const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;

            const bar = document.getElementById(`bar-${this.sanitizeId(opt)}`);
            const stats = document.getElementById(`stats-${this.sanitizeId(opt)}`);

            if (bar) bar.style.width = `${percentage}%`;
            if (stats) stats.innerText = `${count} (${percentage}%)`;
        });

        // Urutkan DOM dari suara terbanyak ke paling sedikit
        const sorted = [...options].sort((a, b) => (tally[b] || 0) - (tally[a] || 0));
        sorted.forEach((opt) => {
            const el = document.getElementById(`opt-${this.sanitizeId(opt)}`);
            if (el && this.optionsContainer) this.optionsContainer.appendChild(el);
        });

        // Tandai status tiap opsi
        const hasWinners = winners.length > 0;
        options.forEach((opt) => {
            const el = document.getElementById(`opt-${this.sanitizeId(opt)}`);
            if (!el) return;

            const count = tally[opt] || 0;
            const isWinner = hasWinners && winners.includes(opt);
            const isLeading = !hasWinners && total > 0 && count === maxCount && count > 0;

            el.classList.toggle("winner", isWinner);
            el.classList.toggle("leading", isLeading);
        });
    }

    sanitizeId(text) {
        return String(text).replace(/[^a-z0-9]/gi, "_").toLowerCase();
    }
}

// Inisialisasi ke Window Object sesuai properti `global: "VotingOverlay"`
window.VotingOverlay = new VotingOverlay();