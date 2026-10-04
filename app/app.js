// app/app.js
// Client Controller for Kak Jule Windows Desktop Studio

const AppController = {
  statusPollTimer: null,
  clockTimer: null,
  uptimeTimer: null,
  
  // State
  botRunning: false,
  botStartedAt: null,
  license: { valid: false, isUnlocked: false, tier: "", remainingDays: 0 },
  currentConsoleTab: "chat", // "chat" | "system"
  chatLogFilter: "chat-all", // "chat-all" | "chat-user" | "chat-bot"
  systemLogFilter: "sys-all", // "sys-all" | "sys-info" | "sys-warn" | "sys-error"
  allLogs: [],
  userHasScrolledUp: false,
  currentLookupUser: null,
  leaderboardSSE: null,

  init() {
    console.log("⚡ [Kak Jule Studio] Desktop Controller Initialized");
    this.startClock();
    this.setupScrollListener();
    this.fetchStatus();
    this.fetchLogs();
    this.fetchConfig();
    this.fetchLeaderboard();
    this.initLeaderboardSSE();

    const obsUrlInput = document.getElementById("obs-source-url");
    if (obsUrlInput) obsUrlInput.value = `${window.location.origin}/overlay/index.html`;

    const subUrlInput = document.getElementById("obs-sub-url");
    if (subUrlInput) subUrlInput.value = `${window.location.origin}/overlay/sub.html`;

    // Start periodic status & log polling (1.5s interval)
    this.statusPollTimer = setInterval(() => {
      this.fetchStatus();
      this.fetchLogs();
    }, 1500);

    // Setup IPC listeners if running inside Electron
    if (window.electronAPI) {
      if (typeof window.electronAPI.onOpenSettings === "function") {
        window.electronAPI.onOpenSettings(() => this.toggleSettingsModal(true));
      }
    }
  },

  // ─────────────────────────────────────────────────────────────
  // ⏱️ CLOCK & UPTIME
  // ─────────────────────────────────────────────────────────────
  startClock() {
    const updateClock = () => {
      const el = document.getElementById("desktop-clock");
      if (el) {
        const now = new Date();
        el.textContent = now.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        });
      }

      // Update Uptime if bot is running
      if (this.botRunning && this.botStartedAt) {
        const diffSeconds = Math.max(0, Math.floor((Date.now() - this.botStartedAt) / 1000));
        const hrs = String(Math.floor(diffSeconds / 3600)).padStart(2, "0");
        const mins = String(Math.floor((diffSeconds % 3600) / 60)).padStart(2, "0");
        const secs = String(diffSeconds % 60).padStart(2, "0");
        const upEl = document.getElementById("uptime-display");
        if (upEl) upEl.textContent = `${hrs}:${mins}:${secs}`;
      } else {
        const upEl = document.getElementById("uptime-display");
        if (upEl) upEl.textContent = "00:00:00";
      }
    };

    updateClock();
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = setInterval(updateClock, 1000);
  },

  // ─────────────────────────────────────────────────────────────
  // 📡 STATUS & HEALTH
  // ─────────────────────────────────────────────────────────────
  async fetchStatus() {
    try {
      const res = await fetch("/api/bot/status");
      if (!res.ok) return;
      const data = await res.json();

      this.botRunning = Boolean(data.running);
      this.botStartedAt = data.startedAt;
      if (data.license) {
        this.license = data.license;
      }

      this.updateStatusUI(data);
    } catch (err) {
      console.warn("⚠️ Status poll failed:", err.message);
    }
  },

  updateStatusUI(data) {
    const statusBadge = document.getElementById("bot-status-badge");
    const statusText = document.getElementById("bot-status-text");
    const btnStart = document.getElementById("btn-start-bot");
    const btnStop = document.getElementById("btn-stop-bot");
    const licenseBanner = document.getElementById("license-banner");
    const licenseChip = document.getElementById("license-chip");
    const licenseChipText = document.getElementById("license-chip-text");

    const isUnlocked = Boolean(this.license.isUnlocked);

    // 1. License status display
    if (!isUnlocked) {
      licenseBanner?.classList.remove("hidden");
      if (licenseChip) {
        licenseChip.className = "license-chip unactivated";
      }
      if (licenseChipText) {
        licenseChipText.textContent = "Belum Teraktivasi";
      }

      // If unlicensed, bot cannot start
      if (statusBadge) statusBadge.className = "status-pill status-locked";
      if (statusText) statusText.textContent = "TERKUNCI";
      if (btnStart) btnStart.disabled = true;
      if (btnStop) btnStop.disabled = true;
      return;
    }

    // License is active
    licenseBanner?.classList.add("hidden");
    if (licenseChip) {
      licenseChip.className = "license-chip activated";
    }
    if (licenseChipText) {
      const tierName = this.license.tier ? this.license.tier.toUpperCase() : "VIP";
      licenseChipText.textContent = `${tierName} (${this.license.remainingDays || 365} Hari)`;
    }

    // 2. Bot running status
    if (this.botRunning) {
      if (statusBadge) statusBadge.className = "status-pill status-running";
      if (statusText) statusText.textContent = "ONLINE";
      if (btnStart) btnStart.disabled = true;
      if (btnStop) btnStop.disabled = false;
    } else {
      if (statusBadge) statusBadge.className = "status-pill status-standby";
      if (statusText) statusText.textContent = "STANDBY";
      if (btnStart) btnStart.disabled = false;
      if (btnStop) btnStop.disabled = true;
    }

    // 3. Platform states
    const ytState = data.platforms?.youtube;
    const ttState = data.platforms?.tiktok;

    const ytBadge = document.getElementById("yt-status-badge");
    const ytChannel = document.getElementById("yt-channel-text");
    const ytOwner = document.getElementById("yt-owner-text");
    if (ytBadge && ytState) {
      if (ytState.connected || ytState.isLive) {
        ytBadge.className = "platform-state state-online";
        const vCount = Number(ytState.viewerCount || 0);
        const viewerLabel = vCount > 0 ? ` • ${vCount.toLocaleString("id-ID")} Viewers` : "";
        ytBadge.textContent = ytState.activeVideoId ? `Online (${ytState.activeVideoId})${viewerLabel}` : `Live${viewerLabel}`;
      } else if (ytState.starting) {
        ytBadge.className = "platform-state state-connecting";
        ytBadge.textContent = "Mencari Live...";
      } else {
        ytBadge.className = "platform-state state-offline";
        ytBadge.textContent = ytState.configured ? (ytState.lastError ? "Menunggu Live" : "Offline") : "Belum Diset";
      }
      if (ytChannel) {
        const baseId = ytState.liveChannelId || ytState.channelId || "Belum Dikonfigurasi";
        ytChannel.textContent = ytState.activeVideoId ? `${baseId} • [${ytState.activeVideoId}]` : baseId;
      }
      if (ytOwner) {
        ytOwner.textContent = ytState.ownerChannelId || "Sama dengan Sumber Live";
      }
    }

    const ttBadge = document.getElementById("tt-status-badge");
    const ttUser = document.getElementById("tt-user-text");
    if (ttBadge && ttState) {
      if (ttState.connected || ttState.isLive) {
        ttBadge.className = "platform-state state-online";
        const vCount = Number(ttState.viewerCount || 0);
        ttBadge.textContent = vCount > 0 ? `Live (${vCount.toLocaleString("id-ID")} Viewers)` : "Terhubung";
      } else if (ttState.starting) {
        ttBadge.className = "platform-state state-connecting";
        ttBadge.textContent = "Mencari Live...";
      } else {
        ttBadge.className = "platform-state state-offline";
        ttBadge.textContent = ttState.configured ? "Offline" : "Belum Diset";
      }
      if (ttUser) {
        ttUser.textContent = ttState.username ? `@${ttState.username.replace('@','')}` : "Belum Dikonfigurasi";
      }
    }
  },

  // ─────────────────────────────────────────────────────────────
  // ▶️ START / STOP BOT CONTROLS
  // ─────────────────────────────────────────────────────────────
  async startBot() {
    if (!this.license.isUnlocked) {
      this.showToast("Aplikasi terkunci! Masukkan kode lisensi terlebih dahulu.", "error");
      this.toggleLicenseModal(true);
      return;
    }

    const btnStart = document.getElementById("btn-start-bot");
    if (btnStart) btnStart.disabled = true;

    try {
      const res = await fetch("/api/bot/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();

      if (data.success) {
        this.botRunning = true;
        this.botStartedAt = Date.now();
        this.showToast("▶️ Bot Kak Jule dijalankan!");
        this.fetchStatus();
      } else {
        this.showToast(data.reason || "Gagal memulai bot.", "error");
        if (btnStart) btnStart.disabled = false;
      }
    } catch (err) {
      this.showToast("Gagal menghubungi server internal: " + err.message, "error");
      if (btnStart) btnStart.disabled = false;
    }
  },

  async stopBot() {
    const btnStop = document.getElementById("btn-stop-bot");
    if (btnStop) btnStop.disabled = true;

    try {
      const res = await fetch("/api/bot/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();

      if (data.success) {
        this.botRunning = false;
        this.botStartedAt = null;
        this.showToast("⏹️ Bot Kak Jule dihentikan (Standby).");
        this.fetchStatus();
      } else {
        this.showToast(data.reason || "Gagal menghentikan bot.", "error");
        if (btnStop) btnStop.disabled = false;
      }
    } catch (err) {
      this.showToast("Gagal menghentikan bot: " + err.message, "error");
      if (btnStop) btnStop.disabled = false;
    }
  },

  // ─────────────────────────────────────────────────────────────
  // 📋 REAL-TIME LOGS & CONSOLE FEED
  // ─────────────────────────────────────────────────────────────
  setupScrollListener() {
    const feed = document.getElementById("terminal-feed");
    if (!feed) return;
    feed.addEventListener("scroll", () => {
      const isAtBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 30;
      this.userHasScrolledUp = !isAtBottom;
    });
  },

  async fetchLogs() {
    try {
      const res = await fetch("/api/bot/logs");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.logs)) {
        this.allLogs = data.logs;
        this.renderLogs();
      }
    } catch (err) {
      // quiet catch on polling
    }
  },

  switchConsoleTab(tab) {
    this.currentConsoleTab = tab;

    const btnChat = document.getElementById("tab-btn-chat");
    const btnSystem = document.getElementById("tab-btn-system");
    const chatFilters = document.getElementById("chat-subfilters");
    const systemFilters = document.getElementById("system-subfilters");
    const simFooter = document.getElementById("chat-simulator-footer");

    if (btnChat) btnChat.classList.toggle("active", tab === "chat");
    if (btnSystem) btnSystem.classList.toggle("active", tab === "system");

    if (chatFilters) chatFilters.classList.toggle("hidden", tab !== "chat");
    if (systemFilters) systemFilters.classList.toggle("hidden", tab !== "system");
    if (simFooter) simFooter.classList.toggle("hidden", tab !== "chat");

    this.renderLogs();
  },

  setLogFilter(filter) {
    if (this.currentConsoleTab === "chat") {
      this.chatLogFilter = filter;
      const chatFilters = document.getElementById("chat-subfilters");
      if (chatFilters) {
        chatFilters.querySelectorAll(".filter-btn").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.filter === filter);
        });
      }
    } else {
      this.systemLogFilter = filter;
      const systemFilters = document.getElementById("system-subfilters");
      if (systemFilters) {
        systemFilters.querySelectorAll(".filter-btn").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.filter === filter);
        });
      }
    }
    this.renderLogs();
  },

  async clearLogs() {
    try {
      await fetch("/api/bot/clear-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: this.currentConsoleTab })
      });
    } catch (_) {}

    if (this.currentConsoleTab === "chat") {
      this.allLogs = this.allLogs.filter(l => l.level !== "chat" && l.level !== "bot");
      this.showToast("Log aktivitas obrolan dibersihkan.");
    } else {
      this.allLogs = this.allLogs.filter(l => l.level === "chat" || l.level === "bot");
      this.showToast("Log sistem dibersihkan.");
    }
    this.renderLogs();
  },

  renderLogs() {
    const feed = document.getElementById("terminal-feed");
    const chatBadge = document.getElementById("chat-count-badge");
    const sysBadge = document.getElementById("system-count-badge");
    if (!feed) return;

    const chatLogs = this.allLogs.filter(l => l.level === "chat" || l.level === "bot");
    const sysLogs = this.allLogs.filter(l => l.level === "info" || l.level === "warn" || l.level === "error");

    if (chatBadge) chatBadge.textContent = chatLogs.length;
    if (sysBadge) sysBadge.textContent = sysLogs.length;

    let displayList = [];
    if (this.currentConsoleTab === "chat") {
      if (this.chatLogFilter === "chat-user") {
        displayList = this.allLogs.filter(l => l.level === "chat");
      } else if (this.chatLogFilter === "chat-bot") {
        displayList = this.allLogs.filter(l => l.level === "bot");
      } else {
        displayList = chatLogs;
      }
    } else {
      if (this.systemLogFilter === "sys-info") {
        displayList = this.allLogs.filter(l => l.level === "info");
      } else if (this.systemLogFilter === "sys-warn") {
        displayList = this.allLogs.filter(l => l.level === "warn");
      } else if (this.systemLogFilter === "sys-error") {
        displayList = this.allLogs.filter(l => l.level === "error");
      } else {
        displayList = sysLogs;
      }
    }

    if (displayList.length === 0) {
      if (this.currentConsoleTab === "chat") {
        feed.innerHTML = `
          <div class="terminal-placeholder">
            <div class="placeholder-icon">💬</div>
            <p>Menunggu aktivitas obrolan & respon AI...</p>
            <span class="placeholder-tip">Pesan chat penonton dan respon Kak Jule akan tampil di sini. Uji coba dengan form di bawah!</span>
          </div>
        `;
      } else {
        feed.innerHTML = `
          <div class="terminal-placeholder">
            <div class="placeholder-icon">🖥️</div>
            <p>Belum ada log sistem tercatat...</p>
            <span class="placeholder-tip">Aktivitas mesin bot, koneksi platform, game, dan status audio akan tampil di sini.</span>
          </div>
        `;
      }
      return;
    }

    feed.innerHTML = displayList.map(item => {
      let badgeClass = "badge-info";
      let badgeText = item.level;

      if (item.level === "chat") {
        badgeClass = "badge-chat";
        badgeText = item.meta?.platform ? item.meta.platform.toUpperCase() : "CHAT";
      } else if (item.level === "bot") {
        badgeClass = "badge-bot";
        badgeText = "KAK JULE";
      } else if (item.level === "warn") {
        badgeClass = "badge-warn";
        badgeText = "WARN";
      } else if (item.level === "error") {
        badgeClass = "badge-error";
        badgeText = "ERR";
      } else if (item.level === "info") {
        badgeClass = "badge-info";
        badgeText = "SYSTEM";
      }

      return `
        <div class="log-entry" id="log-${item.id}">
          <span class="log-time">${item.time}</span>
          <span class="log-badge ${badgeClass}">${badgeText}</span>
          <span class="log-text">${this.escapeHtml(item.message)}</span>
        </div>
      `;
    }).join("");

    // Auto-scroll down unless user explicitly scrolled up to read earlier entries
    if (!this.userHasScrolledUp) {
      feed.scrollTop = feed.scrollHeight;
    }
  },

  // ─────────────────────────────────────────────────────────────
  // 💬 CHAT SIMULATOR
  // ─────────────────────────────────────────────────────────────
  async simulateChat(e) {
    e.preventDefault();
    const authorInput = document.getElementById("sim-author");
    const msgInput = document.getElementById("sim-message");
    const btnSend = document.getElementById("btn-send-sim");

    const message = msgInput?.value?.trim();
    const author = authorInput?.value?.trim() || "Streamer";

    if (!message) return;

    if (btnSend) btnSend.disabled = true;

    try {
      const res = await fetch("/api/bot/simulate-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName: author, message })
      });
      const data = await res.json();

      if (data.success) {
        msgInput.value = "";
        this.showToast(`Pesan terkirim ke bot: "${message}"`);
        this.fetchLogs();
      } else {
        this.showToast(data.reason || "Gagal mengirim simulasi.", "error");
      }
    } catch (err) {
      this.showToast("Error simulasi: " + err.message, "error");
    } finally {
      if (btnSend) btnSend.disabled = false;
    }
  },

  // ─────────────────────────────────────────────────────────────
  // 📺 OBS INTEGRATION & PREVIEW
  // ─────────────────────────────────────────────────────────────
  currentPreviewTab: "index",

  switchPreviewTab(tab) {
    this.currentPreviewTab = tab;
    const iframe = document.getElementById("obs-preview-iframe");
    const tabIndex = document.getElementById("tab-obs-index");
    const tabSub = document.getElementById("tab-obs-sub");

    if (tab === "sub") {
      if (iframe) iframe.src = `/overlay/sub.html?t=${Date.now()}`;
      tabSub?.classList.add("active");
      tabIndex?.classList.remove("active");
    } else {
      if (iframe) iframe.src = `/overlay/index.html?t=${Date.now()}`;
      tabIndex?.classList.add("active");
      tabSub?.classList.remove("active");
    }
  },

  copyObsUrl() {
    const urlInput = document.getElementById("obs-source-url");
    const fullUrl = `${window.location.origin}/overlay/index.html`;

    if (urlInput) urlInput.value = fullUrl;

    navigator.clipboard?.writeText(fullUrl).then(() => {
      this.showToast("📋 URL Browser Source OBS berhasil disalin!");
      const btn = document.getElementById("copy-btn-text");
      if (btn) {
        const oldText = btn.textContent;
        btn.textContent = "✓ Tersalin!";
        setTimeout(() => { btn.textContent = oldText; }, 2000);
      }
    }).catch(() => {
      this.showToast(`Salin manual: ${fullUrl}`);
    });
  },

  copySubUrl() {
    const urlInput = document.getElementById("obs-sub-url");
    const fullUrl = `${window.location.origin}/overlay/sub.html`;

    if (urlInput) urlInput.value = fullUrl;

    navigator.clipboard?.writeText(fullUrl).then(() => {
      this.showToast("📋 URL Overlay Penonton (sub.html) berhasil disalin!");
      const btn = document.getElementById("copy-sub-text");
      if (btn) {
        const oldText = btn.textContent;
        btn.textContent = "✓ Tersalin!";
        setTimeout(() => { btn.textContent = oldText; }, 2000);
      }
    }).catch(() => {
      this.showToast(`Salin manual: ${fullUrl}`);
    });
  },

  reloadOverlayPreview() {
    const iframe = document.getElementById("obs-preview-iframe");
    if (iframe) {
      const target = this.currentPreviewTab === "sub" ? "/overlay/sub.html" : "/overlay/index.html";
      iframe.src = `${target}?t=${Date.now()}`;
      this.showToast("Pratinjau overlay dimuat ulang.");
    }
  },

  async setOverlayMode(mode, type) {
    try {
      const res = await fetch("/api/overlay/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, type })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Mode overlay diubah ke: ${mode.toUpperCase()}`);
        this.reloadOverlayPreview();
      }
    } catch (err) {
      this.showToast("Gagal mengubah mode overlay: " + err.message, "error");
    }
  },

  // ─────────────────────────────────────────────────────────────
  // 🏆 KLASEMEN POIN & INTERAKSI PENONTON (LEADERBOARD HUB)
  // ─────────────────────────────────────────────────────────────
  async fetchLeaderboard() {
    try {
      const res = await fetch("/api/leaderboard?limit=10");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        this.renderLeaderboard(json.data);
      }
    } catch (err) {
      console.warn("⚠️ [Studio] Fetch leaderboard failed:", err.message);
    }
  },

  renderLeaderboard(items) {
    const tbody = document.getElementById("hub-leaderboard-body");
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="hub-table-empty">Belum ada aktivitas poin penonton.</td></tr>`;
      return;
    }

    const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };
    tbody.innerHTML = items.map((user, idx) => {
      const rank = user.rank || idx + 1;
      const rankDisplay = medals[rank] || `#${rank}`;
      const name = this.escapeHtml(user.displayName || user.username || "Viewer");
      const isTt = user.platform === "tiktok";
      const pClass = isTt ? "platform-tiktok" : "platform-youtube";
      const pTag = isTt ? "TT" : "YT";
      const pts = Number(user.points || 0).toLocaleString("id-ID");
      const lv = user.level || 1;

      return `
        <tr>
          <td class="hub-rank-cell">${rankDisplay}</td>
          <td>
            <div class="hub-user-cell">
              <span class="platform-tag ${pClass}">${pTag}</span>
              <span class="hub-username" title="${name}">${name}</span>
            </div>
          </td>
          <td><span class="hub-level-badge">Lv.${lv}</span></td>
          <td class="hub-points-cell">${pts}</td>
        </tr>
      `;
    }).join("");
  },

  initLeaderboardSSE() {
    if (this.leaderboardSSE) return;
    try {
      this.leaderboardSSE = new EventSource("/api/leaderboard/stream");

      this.leaderboardSSE.addEventListener("point_added", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data.leaderboard)) {
            this.renderLeaderboard(data.leaderboard);
          } else {
            this.fetchLeaderboard();
          }

          const notif = data.notification || data;
          if (notif && (notif.user || notif.username)) {
            const u = notif.user || notif;
            const uname = u.displayName || u.username || notif.username || "Viewer";
            const amt = notif.amount || 0;
            this.showToast(`✨ ${uname} +${amt} Poin! (${notif.source || "Interaksi"})`);
          }
        } catch (_) {}
      });

      this.leaderboardSSE.addEventListener("error", () => {
        const badge = document.getElementById("lb-sync-badge");
        if (badge) {
          badge.textContent = "○ Syncing";
          badge.style.color = "#fbbf24";
        }
      });

      this.leaderboardSSE.addEventListener("open", () => {
        const badge = document.getElementById("lb-sync-badge");
        if (badge) {
          badge.textContent = "● Real-time";
          badge.style.color = "#34d399";
        }
      });
    } catch (e) {
      console.warn("SSE leaderboard not supported:", e.message);
    }
  },

  async lookupViewerPoints(e) {
    if (e && e.preventDefault) e.preventDefault();
    const input = document.getElementById("input-lookup-viewer");
    const resultBox = document.getElementById("viewer-lookup-result");
    const query = input?.value?.trim();

    if (!query) {
      this.showToast("Masukkan nama viewer untuk dicari.", "error");
      return;
    }

    try {
      const res = await fetch(`/api/user/lookup?query=${encodeURIComponent(query)}`);
      const json = await res.json();

      if (!json.success || !json.data) {
        this.showToast(`Penonton "${query}" belum memiliki catatan poin.`, "error");
        resultBox?.classList.add("hidden");
        this.currentLookupUser = null;
        return;
      }

      const u = json.data;
      this.currentLookupUser = u;

      resultBox?.classList.remove("hidden");
      const nameEl = document.getElementById("lookup-name");
      const rankEl = document.getElementById("lookup-rank");
      const lvEl = document.getElementById("lookup-level");
      const ptsEl = document.getElementById("lookup-points");
      const pTag = document.getElementById("lookup-platform-tag");

      if (nameEl) nameEl.textContent = u.displayName || u.username;
      if (rankEl) rankEl.textContent = `#${u.rank || 1}`;
      if (lvEl) lvEl.textContent = `Lv.${u.level || 1}`;
      if (ptsEl) ptsEl.textContent = `${Number(u.points || 0).toLocaleString("id-ID")} Poin`;
      if (pTag) {
        const isTt = u.platform === "tiktok";
        pTag.className = `platform-tag ${isTt ? "platform-tiktok" : "platform-youtube"}`;
        pTag.textContent = isTt ? "TT" : "YT";
      }

      this.showToast(`Ditemukan: ${u.displayName || u.username} (${u.points} poin, Rank #${u.rank})`);
    } catch (err) {
      this.showToast("Gagal mencari viewer: " + err.message, "error");
    }
  },

  async grantBonusPoints(amount) {
    if (!this.currentLookupUser) {
      this.showToast("Cari nama viewer terlebih dahulu!", "error");
      return;
    }

    try {
      const res = await fetch("/api/points/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: {
            platform: this.currentLookupUser.platform,
            platformUserId: this.currentLookupUser.platformUserId || this.currentLookupUser.platform_user_id || this.currentLookupUser.username,
            username: this.currentLookupUser.username,
            displayName: this.currentLookupUser.displayName || this.currentLookupUser.username
          },
          amount: Number(amount),
          source: "manual",
          description: `Bonus streamer (+${amount} poin)`
        })
      });

      const json = await res.json();
      if (json.success && json.data) {
        this.showToast(`🎉 Berhasil memberikan +${amount} poin kepada ${this.currentLookupUser.username}!`);
        // Refresh data
        await this.lookupViewerPoints();
        await this.fetchLeaderboard();
      } else {
        this.showToast(json.error || "Gagal memberikan bonus poin", "error");
      }
    } catch (err) {
      this.showToast("Error bonus poin: " + err.message, "error");
    }
  },

  // ─────────────────────────────────────────────────────────────
  // 🔊 AUDIO & TTS TEST
  // ─────────────────────────────────────────────────────────────
  async testTTS() {
    const input = document.getElementById("tts-sample-text");
    const btn = document.getElementById("btn-test-tts");
    const text = input?.value?.trim() || "Halo! Ini adalah tes suara Kak Jule.";

    if (btn) btn.disabled = true;

    try {
      const res = await fetch("/api/bot/test-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast("🔊 Memutar sampel suara Kak Jule...");
      } else {
        this.showToast(data.reason || "Gagal memutar audio.", "error");
      }
    } catch (err) {
      this.showToast("Error test TTS: " + err.message, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // ─────────────────────────────────────────────────────────────
  // 🔑 LICENSE MODAL & ACTIVATION
  // ─────────────────────────────────────────────────────────────
  toggleLicenseModal(forceOpen = null) {
    const modal = document.getElementById("license-modal");
    if (!modal) return;

    const isHidden = modal.classList.contains("hidden");
    const shouldOpen = forceOpen !== null ? forceOpen : isHidden;

    if (shouldOpen) {
      modal.classList.remove("hidden");
      this.renderLicenseModalContent();
    } else {
      modal.classList.add("hidden");
    }
  },

  renderLicenseModalContent() {
    const activeInfo = document.getElementById("license-active-info");
    const msgBox = document.getElementById("license-msg-box");
    if (msgBox) msgBox.className = "msg-box hidden";

    if (this.license && this.license.isUnlocked) {
      activeInfo?.classList.remove("hidden");
      const tierVal = document.getElementById("lic-tier-val");
      const daysVal = document.getElementById("lic-days-val");
      const expVal = document.getElementById("lic-exp-val");

      if (tierVal) tierVal.textContent = (this.license.tier || "VIP").toUpperCase();
      if (daysVal) daysVal.textContent = `${this.license.remainingDays || 365} Hari`;
      if (expVal) {
        expVal.textContent = this.license.expiresAt ? new Date(this.license.expiresAt).toLocaleDateString("id-ID") : "Aktif Selamanya (LIFETIME)";
      }
    } else {
      activeInfo?.classList.add("hidden");
    }
  },

  async submitLicense(e) {
    e.preventDefault();
    const keyInput = document.getElementById("input-license-key");
    const streamerInput = document.getElementById("input-streamer-name");
    const btnSubmit = document.getElementById("btn-submit-license");
    const msgBox = document.getElementById("license-msg-box");

    const key = keyInput?.value?.trim();
    const streamerName = streamerInput?.value?.trim();

    if (!key) {
      this.showMsgBox(msgBox, "Silakan masukkan kode lisensi.", "error");
      return;
    }

    if (btnSubmit) btnSubmit.disabled = true;
    this.showMsgBox(msgBox, "Memverifikasi kode lisensi...", "info");

    try {
      const res = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, streamerName })
      });
      const data = await res.json();

      if (data.success) {
        this.showMsgBox(msgBox, `✓ Lisensi berhasil diaktifkan! Paket: ${data.license?.tier || "VIP"}`, "success");
        this.showToast("🎉 Lisensi Berhasil Diaktifkan! Semua fitur bot kini terbuka.");
        await this.fetchStatus();
        setTimeout(() => {
          this.toggleLicenseModal(false);
        }, 1200);
      } else {
        this.showMsgBox(msgBox, `❌ Aktivasi Gagal: ${data.reason || "Kode lisensi tidak valid atau telah kedaluwarsa."}`, "error");
      }
    } catch (err) {
      this.showMsgBox(msgBox, "Gagal menghubungi server: " + err.message, "error");
    } finally {
      if (btnSubmit) btnSubmit.disabled = false;
    }
  },

  // ─────────────────────────────────────────────────────────────
  // ⚙️ SETTINGS MODAL & CONFIG
  // ─────────────────────────────────────────────────────────────
  toggleSettingsModal(forceOpen = null) {
    const modal = document.getElementById("settings-modal");
    if (!modal) return;

    const isHidden = modal.classList.contains("hidden");
    const shouldOpen = forceOpen !== null ? forceOpen : isHidden;

    if (shouldOpen) {
      modal.classList.remove("hidden");
      this.fetchConfig();
    } else {
      modal.classList.add("hidden");
    }
  },

  toggleKeyVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
      input.type = input.type === "password" ? "text" : "password";
    }
  },

  syncOwnerWithLive() {
    const liveInput = document.getElementById("set-yt-live-channel") || document.getElementById("set-yt-channel");
    const ownerInput = document.getElementById("set-yt-owner-channel");
    if (liveInput && ownerInput) {
      const val = liveInput.value.trim();
      if (!val) {
        this.showToast("Isi Sumber Livestream terlebih dahulu!", "error");
        return;
      }
      ownerInput.value = val;
      this.showToast("ID Pengelola disamakan dengan Sumber Live.");
    }
  },

  async fetchConfig() {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) return;
      const data = await res.json();

      const keyInput = document.getElementById("set-gemini-key");
      const ytLiveInput = document.getElementById("set-yt-live-channel") || document.getElementById("set-yt-channel");
      const ytOwnerInput = document.getElementById("set-yt-owner-channel");
      const ytApiKeyInput = document.getElementById("set-yt-api-key");
      const ttInput = document.getElementById("set-tiktok-user");
      const tiktoolsInput = document.getElementById("set-tiktools-key");
      const modelSelect = document.getElementById("set-model");
      const voiceSelect = document.getElementById("set-voice-speed");

      if (keyInput) keyInput.value = data.geminiKey || "";
      if (ytLiveInput) ytLiveInput.value = data.ytChannelLiveId || "";
      if (ytOwnerInput) ytOwnerInput.value = data.ytChannelLiveOwner || "";
      if (ytApiKeyInput) ytApiKeyInput.value = data.youtubeApiKey || "";
      if (ttInput) ttInput.value = data.tiktokUsername || "";
      if (tiktoolsInput) tiktoolsInput.value = data.tiktoolsApiKey || "";
      if (modelSelect && data.model) {
        modelSelect.value = data.model;
      }
      if (voiceSelect && data.voiceSpeed) {
        voiceSelect.value = data.voiceSpeed;
      }
    } catch (err) {
      console.warn("Could not load config:", err.message);
    }
  },

  async submitSettings(e) {
    e.preventDefault();
    const keyInput = document.getElementById("set-gemini-key");
    const ytLiveInput = document.getElementById("set-yt-live-channel") || document.getElementById("set-yt-channel");
    const ytOwnerInput = document.getElementById("set-yt-owner-channel");
    const ytApiKeyInput = document.getElementById("set-yt-api-key");
    const ttInput = document.getElementById("set-tiktok-user");
    const tiktoolsInput = document.getElementById("set-tiktools-key");
    const modelSelect = document.getElementById("set-model");
    const voiceSelect = document.getElementById("set-voice-speed");
    const btnSave = document.getElementById("btn-save-settings");
    const msgBox = document.getElementById("settings-msg-box");

    const liveChannelId = ytLiveInput?.value?.trim() || "";
    const ownerChannelId = ytOwnerInput?.value?.trim() || "";

    const payload = {
      geminiApiKey: keyInput?.value?.trim() || "",
      ytChannelLiveId: liveChannelId,
      ytChannelLiveOwner: ownerChannelId,
      youtubeApiKey: ytApiKeyInput?.value?.trim() || "",
      tiktokUsername: ttInput?.value?.trim() || "",
      tiktoolsApiKey: tiktoolsInput?.value?.trim() || "",
      model: modelSelect?.value || "gemini-3.5-flash-lite",
      voiceSpeed: voiceSelect?.value || "normal"
    };

    if (btnSave) btnSave.disabled = true;

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        this.showMsgBox(msgBox, "✓ Konfigurasi berhasil disimpan dan diterapkan langsung!", "success");
        this.showToast("⚙️ Konfigurasi berhasil disimpan & diterapkan!");
        setTimeout(() => {
          this.toggleSettingsModal(false);
          this.fetchStatus();
          this.fetchLogs();
        }, 800);
      } else {
        this.showMsgBox(msgBox, "Gagal menyimpan: " + (data.reason || "Error"), "error");
      }
    } catch (err) {
      this.showMsgBox(msgBox, "Gagal simpan konfigurasi: " + err.message, "error");
    } finally {
      if (btnSave) btnSave.disabled = false;
    }
  },

  // ─────────────────────────────────────────────────────────────
  // 🧰 UTILS & TOASTS
  // ─────────────────────────────────────────────────────────────
  handleModalBackdrop(e, modalId) {
    if (e.target.id === modalId) {
      document.getElementById(modalId)?.classList.add("hidden");
    }
  },

  showMsgBox(el, text, type = "info") {
    if (!el) return;
    el.className = `msg-box ${type}`;
    el.textContent = text;
    el.classList.remove("hidden");
  },

  showToast(message, type = "info") {
    const toast = document.getElementById("app-toast");
    if (!toast) return;

    toast.textContent = message;
    if (type === "error") {
      toast.style.borderColor = "rgba(244, 63, 94, 0.4)";
      toast.style.color = "#fb7185";
    } else {
      toast.style.borderColor = "rgba(255, 255, 255, 0.15)";
      toast.style.color = "#f8fafc";
    }

    toast.classList.add("visible");
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, 3200);
  },

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};

// Start application controller when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  AppController.init();
});
