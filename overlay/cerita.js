// overlay/cerita.js
window.CeritaOverlay = (() => {

    let titleEl;
    let genreEl;
    let progressEl;
    let progressFillEl;
    let textEl;

    let typingTimer = null;

    function init() {

        titleEl = document.getElementById("storyTitle");
        genreEl = document.getElementById("storyGenre");
        progressEl = document.getElementById("storyProgress");
        progressFillEl = document.getElementById("storyProgressFill");
        textEl = document.getElementById("storyText");

        console.log("📖 Story Overlay Loaded");
    }

    function cleanText(text = "") {
        return String(text)
            .replace(/\n/g, "\n")
            .trim();
    }

    function update(data) {
        if (!titleEl) init();
        if (!data) return;

        titleEl.textContent =
            cleanText(data.title || "Tanpa Judul");

        genreEl.textContent =
            cleanText(data.genre || "");

        const current = data.currentPart ?? data.part ?? 0;
        const total = data.totalParts ?? data.total ?? 0;

        progressEl.textContent = `${current} / ${total}`;

        const percent = total > 0
            ? (current / total) * 100
            : 0;

        progressFillEl.style.width = percent + "%";

        textEl.textContent =
            cleanText(data.text || "");

    }

    function destroy() {

        clearInterval(typingTimer);

    }

    return {

        init,
        update,
        destroy

    };

})();