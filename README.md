# 🤖 Jule V3.x — AI Interactive Livestream Bot & Leaderboard

Bot asisten livestream interaktif bertenaga AI untuk **YouTube Live** dan **TikTok Live**. Dilengkapi dengan karakter AI (Kak Jule), sistem suara (TTS), mini games (Tebak Kata & Puzzle PAZ), sistem voting penonton, serta **Persistent Interaction Points & Real-Time OBS Leaderboard** berbasis SQLite.

---

## 🌟 Fitur Utama

- 🎙️ **AI Voice & Karakter Interaktif**: Merespon penonton menggunakan Google Gemini AI dengan sintesis suara (TTS) ekspresif.
- 💰 **Persistent Interaction Points**:
  - Poin penonton tersimpan permanen di database lokal SQLite (`data/jule.db`).
  - Sistem pengenalan akun platform-agnostik (`platform_user_id`), sehingga poin tetap aman meskipun penonton mengganti nama akun (*display name*).
  - Isolasi akun terpisah antara YouTube dan TikTok.
- 🏆 **Real-Time Leaderboard Overlay (OBS Studio)**:
  - Tampilan overlay modern, elegan, dan transparan untuk OBS Browser Source.
  - Pembaruan instan berbasis **Server-Sent Events (SSE)** tanpa perlu refresh halaman.
  - Pop-up notifikasi animasi (*toast alert*) otomatis saat penonton memenangkan game atau memperoleh poin besar.
- 🎮 **Mini Games & Komunitas**:
  - **Tebak Kata**: Juara 1 (+5 poin), Juara 2 (+3 poin), Juara 3 (+1 poin).
  - **Puzzle PAZ**: Menyusun dan menebak potongan puzzle.
  - **Live Chat Points**: Reward pasif +1 poin untuk setiap penonton yang aktif di chat.
- 🛡️ **Anti-Spam Rate Limiter**: Cooldown cerdas (10 detik per viewer) untuk mencegah eksploitasi dan spam penambahan poin.
- 🗳️ **Interactive Voting**: Sistem jajak pendapat / voting instan untuk viewer di live chat (`!fot` / `!vot`).

---

## 📁 Struktur Direktori

```text
├── commands/               # Handler perintah chat (admin, game, voting, points)
│   ├── admin.js            # Dispatcher perintah utama
│   ├── owner.js            # Perintah khusus pemilik channel
│   ├── game.js             # Kontrol mini game
│   ├── voting.js           # Kontrol voting & polling
│   └── points.js           # Perintah viewer: !poin, !rank, !top
├── core/
│   ├── ai/                 # Integrasi Google Gemini & AI Story Generator
│   ├── audio/              # Audio playback & TTS engine
│   ├── chat/               # Router, guards, & message normalizer
│   ├── db/                 # Koneksi SQLite & skema database persistensi
│   ├── game/               # Engine game Tebak Kata & Puzzle PAZ
│   ├── points/             # PointManager, aturan skor, & rate limiter
│   ├── routes/             # Express API routes & SSE streaming
│   └── voting/             # Engine voting live stream
├── data/
│   └── jule.db             # Database SQLite persisten
├── overlay/                # Browser source untuk OBS Studio
│   ├── leaderboard.html    # Halaman HTML Leaderboard
│   ├── leaderboard.css     # Styling responsif & tema transparan
│   └── leaderboard.js      # Client SSE & auto-reconnect
├── index.js                # Entry point server Express (Port 3000)
├── indexV3p1.js            # Engine bot lengkap YouTube & TikTok
└── package.json            # Dependensi & skrip aplikasi
```

---

## 💬 Daftar Perintah Live Chat

### 👤 Perintah Viewer (Penonton)
Dapat diketikkan langsung oleh siapa saja di kolom komentar/chat:

| Perintah | Alternatif | Deskripsi |
| :--- | :--- | :--- |
| `!poin` | `!points` | Menampilkan total poin, peringkat, dan level viewer saat ini (anti-spam: 1x per 5 menit). |
| `!rank` | `!peringkat` | Mengecek posisi peringkat viewer di klasemen (anti-spam: 1x per 5 menit). |
| `[jawaban]` | — | Menjawab soal mini game aktif (Tebak Kata / PAZ). |
| `[pilihan]` | — | Memberikan suara saat sesi voting berlangsung. |

### 👑 Perintah Admin / Streamer
Perintah khusus untuk streamer/owner channel dan moderator:

| Perintah | Deskripsi |
| :--- | :--- |
| `!on` / `!off` | Mengaktifkan atau menonaktifkan respon bot di livestream. |
| `!top` / `!leaderboard` | Menampilkan klasemen penonton teratas di live chat, suara TTS, dan **otomatis memunculkan leaderboard di layar OBS**. |
| `!top hide` / `!top stop` | Menutup/menyembunyikan tampilan kartu leaderboard dari layar OBS secara manual. |
| `!game start [kategori]` | Memulai sesi permainan Tebak Kata. |
| `!game stop` | Menghentikan sesi permainan yang sedang berlangsung. |
| `!paz start` | Memulai mode game Puzzle PAZ. |
| `!fot start [opsi1, opsi2]` | Membuka sesi voting interaktif untuk penonton. |
| `!cerita [topik]` | Memerintahkan AI untuk membawakan cerita/dongeng. |

---

## ⚙️ Konfigurasi Environment (`.env`)

Salin berkas `.env.example` menjadi `.env` lalu sesuaikan kredensial Anda:

```env
# Application Port
PORT=3000

# Gemini AI Configuration (Dukung multi-key auto-rotation saat 429 quota tercapai)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TTS_MODEL=
GEMINI_TTS_VOICE=

# YouTube Live Chat Configuration
YT_CHANNEL_LIVE_ID=
YT_CHANNEL_LIVE_OWNER=
YT_CLIENT_ID=
YT_CLIENT_SECRET=
YT_REFRESH_TOKEN=

# TikTok Live Configuration
TIKTOK_USERNAME=
TIKTOOLS_API_KEY=

# Audio / Voice Synthesizer Configuration (Optional)
VOICE_ID=
ELEVENLABS_API_KEY_1=
ELEVENLABS_API_KEY_2=
ELEVENLABS_API_KEY_3=
ELEVENLABS_API_KEY_4=
ELEVENLABS_API_KEY_5=
```

---

## 🚀 Cara Menjalankan

### 1. Jalankan Aplikasi
```bash
# Menjalankan server aplikasi
npm start
# Atau mode development:
npm run dev
```
Server web akan berjalan di `http://localhost:3000`.

### 2. Jalankan Pengujian Sistem (Automated Tests)
Untuk memverifikasi persistensi database, sistem poin, anti-spam, dan sinkronisasi game:
```bash
node tests/point_system_test.js
```

---

## 📺 Panduan Pemasangan di OBS Studio

1. Buka **OBS Studio**, pilih scene livestream Anda.
2. Klik tombol **`+`** pada panel **Sources**, pilih **Browser**.
3. Beri nama (misal: `Jule Leaderboard`), lalu atur properti berikut:
   - **URL**: `http://localhost:3000/leaderboard` *(atau gunakan URL cloud deployment Anda)*
   - **Width**: `420`
   - **Height**: `650`
   - **Custom CSS**: Kosongkan (tampilan sudah dikonfigurasi transparan dari bawaan).
4. Klik **OK**. Leaderboard sekarang tampil di livestream dan otomatis terupdate secara realtime setiap kali penonton berinteraksi!

---

## 🔌 API Endpoints Reference

| Method | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| `GET` | `/leaderboard` | Halaman overlay interaktif untuk browser OBS. |
| `GET` | `/api/leaderboard` | Mendapatkan daftar top viewer berperingkat (JSON). |
| `GET` | `/api/leaderboard/stream` | Server-Sent Events (SSE) stream untuk update realtime. |
| `GET` | `/api/user/:id` | Mengambil detail profil, poin, level, dan rank user. |
| `GET` | `/api/user/:id/transactions`| Riwayat transaksi & log penambahan poin user. |
| `POST`| `/api/points/add` | Manual reward endpoint untuk menambahkan poin viewer. |
| `GET` | `/api/health` | Status kesehatan server dan koneksi bot. |

---

## 🛡️ Keamanan & Reliabilitas
- **Graceful Reconnect**: Client overlay di OBS memiliki mekanisme auto-reconnect cerdas jika koneksi internet sempat terputus.
- **Fail-Safe Persistence**: Transaksi poin menggunakan SQLite dengan transaksi ACID untuk memastikan integritas data skor penonton saat bot terhenti tiba-tiba.
- **Sanitasi Input**: Mencegah serangan XSS pada teks yang ditampilkan di overlay browser OBS.
