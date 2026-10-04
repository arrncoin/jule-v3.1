// src/features/story/storyPlayer.js
// Story audio playback engine with OBS overlay synchronized narration
const storyAudio = require("../audio/storyAudio");
const logger = require("../../core/logger/logger");
const overlayState = require("../../core/state/overlayState");

let isStopped = false;
let isPlaying = false;

async function updateOverlay(data) {
    overlayState.set({ mode: "story", ...data });
}

function splitIntoSentences(text) {
    if (!text) return [];
    return text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

async function playStory(story) {
    if (isPlaying) {
        console.warn("⚠️ playStory dipanggil saat cerita lain masih aktif, dihentikan dulu.");
        await stop();
    }

    isStopped = false;
    isPlaying = true;

    try {
        if (!story?.parts || !Array.isArray(story.parts)) {
            throw new Error("Format story tidak valid.");
        }

        const totalParts = story.parts.length;

        await updateOverlay({
            type: "start",
            title: story.title,
            genre: story.genre,
            part: 0,
            totalParts: totalParts,
            text: "",
        });

        storyAudio.addToQueue("🎙️ Cerita siap, selamat mendengarkan.");

        if (story.title) storyAudio.addToQueue(`Judul cerita, ${story.title}.`);
        if (story.genre) storyAudio.addToQueue(`Genre cerita, ${story.genre}.`);

        for (let i = 0; i < totalParts; i++) {
            if (isStopped) break;

            const part = story.parts[i];
            if (!part) continue;

            const sentences = splitIntoSentences(part.text || "");

            for (let j = 0; j < sentences.length; j++) {
                if (isStopped) break;

                const sentence = sentences[j];

                storyAudio.addToQueue(
                    sentence,
                    async () => {
                        if (isStopped) return;
                        await updateOverlay({
                            type: "reading",
                            title: story.title,
                            genre: story.genre,
                            currentPart: i + 1,
                            totalParts: totalParts,
                            sentenceIndex: j + 1,
                            totalSentences: sentences.length,
                            text: sentence,
                        });
                    },
                    null
                );
            }
        }

        if (!isStopped) {
            storyAudio.addToQueue(
                "Sekian cerita dari Kak Jule. Terima kasih sudah mendengarkan.",
                async () => {
                    if (isStopped) return;

                    logger.info(`📖 [CERITA] Cerita "${story.title}" selesai dibacakan.`);
                    logger.bot("Kak Jule: Sekian cerita dari Kak Jule. Terima kasih sudah mendengarkan.");

                    await updateOverlay({
                        type: "finished",
                        title: story.title,
                        genre: story.genre,
                        currentPart: totalParts,
                        totalParts: totalParts,
                        text: "Tamat.",
                    });
                },
                async () => {
                    setTimeout(async () => {
                        if (!isPlaying) {
                            overlayState.reset("dashboard", "Cerita selesai. Menunggu aktivitas...");
                        }
                    }, 8000);
                }
            );
        }
    } catch (err) {
        console.error("❌ Error saat memutar cerita:", err.message);
    } finally {
        isPlaying = false;
    }
}

async function stop() {
    isStopped = true;
    isPlaying = false;

    logger.warn("📕 [CERITA] Pembacaan cerita dihentikan.");
    logger.bot("Kak Jule: Pembacaan cerita dihentikan.");

    try {
        if (typeof storyAudio.clearQueue === "function") {
            storyAudio.clearQueue();
        }
    } catch (err) {
        console.error("❌ Gagal membersihkan queue audio:", err.message);
    }

    overlayState.reset("dashboard", "Cerita dihentikan.");
}

async function playStoryFromFile(filePath) {
    try {
        const storyService = require("../../integrations/gemini/storyService");
        const story = await storyService.loadStory(filePath);
        if (!story) {
            throw new Error(`File cerita tidak ditemukan atau format tidak valid: ${filePath}`);
        }
        return await playStory(story);
    } catch (err) {
        console.error("❌ Gagal membaca cerita dari file:", err.message);
        throw err;
    }
}

module.exports = {
    playStory,
    playStoryFromFile,
    stop,
    isPlaying: () => isPlaying
};
