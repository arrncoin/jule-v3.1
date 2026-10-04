// core/cerita/baca.js
const audio = require("../audio/stdV2"); // ⚠️ disamakan dengan router.js — konfirmasi ini expose stdV2 yang sama
const logger = require("../utils/logger");
const overlayState = require("../utils/overlayState");

let isStopped = false;
let isPlaying = false; // status lokal, untuk debugging/cross-check terhadap audio.isStoryActive()

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

    audio.addPriority("🎙️ Cerita siap, selamat mendengarkan.");

    if (story.title) audio.addPriority(`Judul cerita, ${story.title}.`);
    if (story.genre) audio.addPriority(`Genre cerita, ${story.genre}.`);

    // Catatan: loop di bawah ini berjalan sinkron tanpa titik `await`,
    // jadi stop() TIDAK BISA memotong di tengah loop ini — semua kalimat
    // akan selesai di-queue dulu. Interupsi sebenarnya terjadi lewat
    // audio.clearQueue() yang dipanggil stop() SETELAH loop ini selesai.
    for (let i = 0; i < totalParts; i++) {
      if (isStopped) break;

      const part = story.parts[i];
      if (!part) continue; // lindungi dari array sparse/index kosong

      const sentences = splitIntoSentences(part.text || "");

      for (let j = 0; j < sentences.length; j++) {
        if (isStopped) break;

        const sentence = sentences[j];

        audio.addToQueue({
          text: sentence,
          async onStart() {
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
        });
      }
    }

    if (!isStopped) {
      audio.addToQueue({
        text: "Sekian cerita dari Kak Jule. Terima kasih sudah mendengarkan.",
        async onStart() {
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
        async onEnd() {
          setTimeout(async () => {
            if (!isPlaying) {
              overlayState.reset("dashboard", "Cerita selesai. Menunggu aktivitas...");
            }
          }, 8000);
        }
      });
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
    if (typeof audio.clearQueue === "function") {
      audio.clearQueue();
    }
  } catch (err) {
    console.error("❌ Gagal membersihkan queue audio:", err.message);
  }

  overlayState.reset("dashboard", "Cerita dihentikan.");
}

async function playStoryFromFile(filePath) {
  try {
    const storyGenerator = require("../ai/storyGenerator");
    const story = await storyGenerator.loadStory(filePath);
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
  isPlaying: () => isPlaying, // opsional: bisa dipakai untuk cross-check dengan audio.isStoryActive()
};