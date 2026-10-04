// core/platforms/youtubeChatClient.js
const EventEmitter = require("events");
const axios = require("axios");

class YouTubeLiveChat extends EventEmitter {
  constructor(options = {}) {
    super();
    this.channelId = options.channelId || options.liveId || "";
    this.liveId = options.liveId || "";
    this.handle = options.handle || "";
    this.interval = options.interval || 1500;
    this.timer = null;
    this.isPolling = false;
    this.seenMessageIds = new Set();
    this.continuation = null;
    this.apiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    this.clientVersion = "2.20260911.01.00";
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  }

  /**
   * Mengurai berbagai format input menjadi Video ID aktif
   */
  async resolveLiveId() {
    const raw = (this.liveId || this.channelId || this.handle || "").trim();
    if (!raw) {
      throw new Error("Channel ID, Video ID, atau Link Live YouTube belum diisi.");
    }

    // 1. Direct 11-char video ID (e.g. 4xDzrJKXOOY, bukan ID channel yang berawalan UC)
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw) && !raw.startsWith("UC")) {
      return raw;
    }

    // 2. URL parsing: watch?v=, /live/, youtu.be/
    const urlMatch = raw.match(/(?:watch\?v=|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (urlMatch) {
      return urlMatch[1];
    }

    // 3. Jika YOUTUBE_API_KEY diset di .env atau konfigurasi dashboard, prioritaskan API resmi (cepat & akurat)
    try {
      const ytApiKey = (process.env.YOUTUBE_API_KEY || "").trim();
      if (ytApiKey) {
        let channelIdToSearch = raw.startsWith("UC") ? raw : null;
        if (!channelIdToSearch) {
          const cleanH = raw.replace(/^https?:\/\/(?:www\.)?youtube\.com\//i, "").replace(/^@/, "");
          const chRes = await axios.get(
            `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(cleanH)}&key=${ytApiKey}`,
            { timeout: 5000 }
          );
          if (chRes.data?.items?.[0]?.id) {
            channelIdToSearch = chRes.data.items[0].id;
          }
        }

        if (channelIdToSearch) {
          const searchRes = await axios.get(
            `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelIdToSearch}&eventType=live&type=video&key=${ytApiKey}`,
            { timeout: 5000 }
          );
          if (searchRes.data?.items?.[0]?.id?.videoId) {
            return searchRes.data.items[0].id.videoId;
          }
        }
      }
    } catch (_) {}

    // 4. Format URL /channel/ atau handle (@...) via Web Scraping
    let channelLiveUrl = "";
    let channelStreamsUrl = "";

    if (raw.startsWith("UC") && raw.length >= 20) {
      channelLiveUrl = `https://www.youtube.com/channel/${raw}/live`;
      channelStreamsUrl = `https://www.youtube.com/channel/${raw}/streams`;
    } else {
      const cleanHandle = raw
        .replace(/^https?:\/\/(?:www\.)?youtube\.com\//i, "")
        .replace(/^@/, "");
      channelLiveUrl = `https://www.youtube.com/@${cleanHandle}/live`;
      channelStreamsUrl = `https://www.youtube.com/@${cleanHandle}/streams`;
    }

    // Percobaan A: Akses /live dengan follow redirect
    try {
      const res = await axios.get(channelLiveUrl, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept-Language": "en-US,en;q=0.9"
        },
        maxRedirects: 5,
        timeout: 6000
      });

      const finalUrl = res.request?.res?.responseUrl || res.config?.url || "";
      const vMatch = finalUrl.match(/(?:watch\?v=|\/live\/)([a-zA-Z0-9_-]{11})/i);
      if (vMatch) {
        return vMatch[1];
      }

      const html = res.data ? res.data.toString() : "";

      // Cek canonical atau meta itemprop
      const metaVid = html.match(/<meta itemprop="videoId" content="([a-zA-Z0-9_-]{11})">/i);
      if (metaVid) return metaVid[1];

      // Cek ytInitialPlayerResponse
      const pMatch = html.match(/var ytInitialPlayerResponse\s*=\s*({.+?});<\/script>/s);
      if (pMatch) {
        try {
          const p = JSON.parse(pMatch[1]);
          if (p.videoDetails?.videoId && (p.videoDetails?.isLive || p.videoDetails?.isLiveContent)) {
            return p.videoDetails.videoId;
          }
        } catch (_) {}
      }
    } catch (_) {}

    // Percobaan B: Akses tab /streams untuk mencari badge live aktif
    try {
      const res = await axios.get(channelStreamsUrl, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept-Language": "en-US,en;q=0.9"
        },
        timeout: 6000
      });

      const html = res.data ? res.data.toString() : "";
      const m = html.match(/ytInitialData\s*=\s*({.+?});/s);
      if (m) {
        const dataStr = m[1];

        // 1. Badge style THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE
        const targetMatch = dataStr.match(
          /\"animationActivationTargetId\":\s*\"([a-zA-Z0-9_-]{11})\"/
        );
        if (targetMatch) return targetMatch[1];

        const liveBadgeMatch =
          dataStr.match(/\"badgeStyle\":\"THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE\".{0,300}?\/vi\/([a-zA-Z0-9_-]{11})\//) ||
          dataStr.match(/\/vi\/([a-zA-Z0-9_-]{11})\/.{0,300}?\"badgeStyle\":\"THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE\"/);
        if (liveBadgeMatch) return liveBadgeMatch[1];

        // 2. BADGE_STYLE_TYPE_LIVE_NOW
        const badgeStyleMatch =
          dataStr.match(/\"style\":\"BADGE_STYLE_TYPE_LIVE_NOW\".{0,300}?\"videoId\":\"([a-zA-Z0-9_-]{11})\"/) ||
          dataStr.match(/\"videoId\":\"([a-zA-Z0-9_-]{11})\".{0,300}?\"style\":\"BADGE_STYLE_TYPE_LIVE_NOW\"/);
        if (badgeStyleMatch) return badgeStyleMatch[1];
      }
    } catch (_) {}

    // Percobaan D: Jika kredensial OAuth YouTube diset di .env, gunakan YouTube Data API v3
    try {
      const clientId = process.env.YT_CLIENT_ID || process.env.YT_CLIENT_ID_2;
      const clientSecret = process.env.YT_CLIENT_SECRET || process.env.YT_CLIENT_SECRET_2;
      const refreshToken = process.env.YT_REFRESH_TOKEN || process.env.YT_REFRESH_TOKEN_2;

      if (clientId && clientSecret && refreshToken && raw.startsWith("UC")) {
        const { google } = require("googleapis");
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const youtube = google.youtube({ version: "v3", auth: oauth2Client });

        const searchRes = await youtube.search.list({
          part: ["id"],
          channelId: raw,
          eventType: "live",
          type: ["video"],
          maxResults: 1
        });

        if (searchRes.data?.items?.[0]?.id?.videoId) {
          return searchRes.data.items[0].id.videoId;
        }
      }
    } catch (_) {}

    throw new Error(
      `Live stream belum ditemukan pada channel '${raw}'. ` +
      `Pastikan siaran live sudah online, atau masukkan langsung Video ID / Link Live (contoh: https://youtube.com/live/xxx atau 11 karakter Video ID) pada pengaturan.`
    );
  }

  /**
   * Memulai koneksi dan pendengaran live chat
   */
  async start() {
    if (this.isPolling) return true;

    try {
      this.lastError = null;
      const resolvedId = await this.resolveLiveId();
      this.liveId = resolvedId;

      // Akses halaman live chat YouTube khusus video ID
      const liveChatUrl = `https://www.youtube.com/live_chat?v=${resolvedId}`;
      const res = await axios.get(liveChatUrl, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept-Language": "en-US,en;q=0.9"
        },
        timeout: 10000
      });

      const html = res.data ? res.data.toString() : "";

      // Ambil INNERTUBE_API_KEY & clientVersion
      const apiKeyMatch = html.match(/['"]INNERTUBE_API_KEY['"]:\s*['"](.+?)['"]/);
      if (apiKeyMatch) {
        this.apiKey = apiKeyMatch[1];
      }

      const verMatch = html.match(/['"]clientVersion['"]:\s*['"]([\d.]+?)['"]/);
      if (verMatch) {
        this.clientVersion = verMatch[1];
      }

      // Ambil ytInitialData
      const m =
        html.match(/window\["ytInitialData"\]\s*=\s*({.+?});<\/script>/s) ||
        html.match(/ytInitialData\s*=\s*({.+?});/s);

      if (!m) {
        throw new Error("Data live chat tidak dapat dibaca dari halaman YouTube.");
      }

      const initData = JSON.parse(m[1]);
      const renderer = initData.contents?.liveChatRenderer;

      if (!renderer) {
        const errorText = initData.contents?.messageRenderer?.text?.runs?.[0]?.text;
        throw new Error(
          errorText || "Live chat dinonaktifkan atau belum tersedia pada video ini."
        );
      }

      const continuations = renderer.continuations || [];
      const firstCont = continuations[0];
      this.continuation =
        firstCont?.invalidationContinuationData?.continuation ||
        firstCont?.timedContinuationData?.continuation ||
        firstCont?.reloadContinuationData?.continuation;

      if (!this.continuation) {
        throw new Error("Token lanjutan live chat (continuation) tidak ditemukan.");
      }

      this.isPolling = true;
      this.emit("start", this.liveId);

      // Parse pesan awal yang ada di halaman pertama
      if (renderer.actions && Array.isArray(renderer.actions)) {
        this.parseActions(renderer.actions);
      }

      // Jadwalkan polling berikutnya
      this.scheduleNextPoll(this.interval);
      return true;
    } catch (err) {
      this.lastError = err;
      this.emit("error", err);
      return false;
    }
  }

  /**
   * Mengurai item aksi obrolan dari respon YouTube
   */
  parseActions(actions) {
    for (const act of actions) {
      const item =
        act.addChatItemAction?.item?.liveChatTextMessageRenderer ||
        act.addChatItemAction?.item?.liveChatPaidMessageRenderer;
      if (!item) continue;

      const id = item.id;
      if (id && this.seenMessageIds.has(id)) continue;
      if (id) {
        this.seenMessageIds.add(id);
        if (this.seenMessageIds.size > 2000) {
          const first = this.seenMessageIds.values().next().value;
          this.seenMessageIds.delete(first);
        }
      }

      const authorName = item.authorName?.simpleText || "";
      const authorId = item.authorExternalChannelId || "";
      const isOwner =
        item.authorBadges?.some(
          (b) => b.liveChatAuthorBadgeRenderer?.icon?.iconType === "OWNER"
        ) || false;
      const isModerator =
        item.authorBadges?.some(
          (b) => b.liveChatAuthorBadgeRenderer?.icon?.iconType === "MODERATOR"
        ) || false;
      const isMembership =
        item.authorBadges?.some(
          (b) => !!b.liveChatAuthorBadgeRenderer?.customThumbnail
        ) || false;

      const messageRuns = item.message?.runs || [];
      const text = messageRuns
        .map((r) => r.text || r.emoji?.shortcuts?.[0] || "")
        .join("");
      const timestamp = item.timestampUsec
        ? new Date(Number(item.timestampUsec) / 1000)
        : new Date();

      const isPaidMessage = Boolean(act.addChatItemAction?.item?.liveChatPaidMessageRenderer);
      const purchaseAmount = item.purchaseAmountText?.simpleText || "";

      this.emit("chat", {
        id,
        author: {
          name: authorName,
          channelId: authorId,
          isOwner,
          isModerator,
          isMembership
        },
        message: text,
        timestamp,
        isPaid: isPaidMessage,
        isSuperChat: isPaidMessage,
        purchaseAmount
      });
    }
  }

  scheduleNextPoll(delayMs = 1500) {
    if (!this.isPolling) return;
    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(async () => {
      await this.pollChat();
    }, Math.max(800, delayMs));
  }

  async pollChat() {
    if (!this.isPolling || !this.continuation) return;

    try {
      const url = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${this.apiKey}`;
      const res = await axios.post(
        url,
        {
          context: {
            client: {
              clientVersion: this.clientVersion,
              clientName: "WEB"
            }
          },
          continuation: this.continuation
        },
        {
          headers: {
            "User-Agent": this.userAgent,
            "Content-Type": "application/json"
          },
          timeout: 10000
        }
      );

      const contContents = res.data?.continuationContents?.liveChatContinuation;
      if (!contContents) {
        this.scheduleNextPoll(this.interval);
        return;
      }

      if (contContents.actions && Array.isArray(contContents.actions)) {
        this.parseActions(contContents.actions);
      }

      const nextCont = contContents.continuations?.[0];
      const nextToken =
        nextCont?.invalidationContinuationData?.continuation ||
        nextCont?.timedContinuationData?.continuation;
      const timeoutMs =
        nextCont?.invalidationContinuationData?.timeoutMs ||
        nextCont?.timedContinuationData?.timeoutMs ||
        this.interval;

      if (nextToken) {
        this.continuation = nextToken;
        this.scheduleNextPoll(timeoutMs);
      } else {
        this.emit("end");
        this.stop();
      }
    } catch (err) {
      this.emit("error", err);
      this.scheduleNextPoll(3000);
    }
  }

  stop(reason) {
    this.isPolling = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.emit("end", reason);
  }
}

module.exports = YouTubeLiveChat;
module.exports.YouTubeLiveChat = YouTubeLiveChat;
module.exports.LiveChat = YouTubeLiveChat;
