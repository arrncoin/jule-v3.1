// overlay/dashboard.js
// Modern HUD Companion Controller for Kak Jule OBS Live Stream Overlay

window.DashboardOverlay = {
  activeSpeechTimeout: null,

  init() {
    console.log("⚡ [OBS HUD] Dashboard Companion Overlay Initialized");
    this.pollLatestState();
  },

  async pollLatestState() {
    try {
      const res = await fetch("/api/overlay");
      if (!res.ok) return;
      const data = await res.json();
      this.update(data);
    } catch (_) {}
  },

  update(data) {
    if (!data) return;

    const modeEl = document.getElementById("mode");
    const descEl = document.getElementById("status-text");
    const bubbleEl = document.getElementById("companion-bubble");

    if (modeEl) {
      const rawMode = data.mode || "STANDBY";
      let displayMode = rawMode.toUpperCase();

      if (rawMode === "game") displayMode = "🎮 TEBAK KATA";
      else if (rawMode === "voting") displayMode = "📊 LIVE POLLING";
      else if (rawMode === "story") displayMode = "📖 CERITA AI";
      else if (rawMode === "leaderboard") displayMode = "🏆 LEADERBOARD";
      else if (rawMode === "dashboard") displayMode = "STANDBY";

      modeEl.textContent = displayMode;
    }

    if (descEl && data.message) {
      descEl.textContent = data.message;

      // Animate bubble bounce on new message
      if (bubbleEl) {
        bubbleEl.style.transform = "scale(1.02)";
        setTimeout(() => {
          bubbleEl.style.transform = "scale(1)";
        }, 200);
      }
    }
  },

  destroy() {
    if (this.activeSpeechTimeout) {
      clearTimeout(this.activeSpeechTimeout);
      this.activeSpeechTimeout = null;
    }
  }
};
