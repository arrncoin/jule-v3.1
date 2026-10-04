# 🚀 Panduan Menjalankan di Windows 10/11 & Sistem Kode Langganan (Kak Jule V3.1)

Aplikasi **Kak Jule V3.1** kini telah dilengkapi dengan modul sistem lisensi langganan terenkripsi (HMAC-SHA256) dan launcher otomatis untuk sistem operasi **Windows 10 / Windows 11**.

---

## 💻 Cara Menjalankan Aplikasi di Windows 10/11

Pengguna (streamer) cukup melakukan langkah berikut:

### 1. Prasyarat Pertama Kali
- Pastikan komputer sudah terpasang **Node.js (LTS)**:  
  👉 Unduh gratis di [https://nodejs.org/](https://nodejs.org/)

### 2. Jalankan Aplikasi (One-Click Launcher)
1. **Klik ganda file `start.bat`** (atau `jalankan-kak-jule.bat`).
2. Program akan secara otomatis:
   - Memeriksa instalasi Node.js.
   - Memasang dependensi modul secara otomatis jika belum terpasang.
   - Memeriksa masa aktif **Kode Langganan**.
   - Jika belum ada lisensi atau sudah kadaluarsa, program akan meminta memasukkan kode:
     ```text
     👉 Masukkan Kode Langganan Anda: JULE-026A-CBE8-XXXX-XXXX-XXXX
     ```
   - Membuka browser secara otomatis ke Web Dashboard HUD: `http://localhost:3000/overlay/index.html`.
   - Mengaktifkan server bot & overlay untuk OBS Studio.

---

## 🔑 Cara Membuat / Generate Kode Langganan (Untuk Pemilik / Admin)

Sebagai pembuat bot, Anda dapat membuat kode serial baru kapan saja untuk diserahkan kepada pembeli / penyewa bot.

### Cara 1: Menggunakan File Batch (Klik Ganda di Windows)
- Klik ganda file **`buat-kode-langganan.bat`**
- Pilih paket durasi:
  - `1` : Trial (7 Hari)
  - `2` : Standar (30 Hari)
  - `3` : Pro (90 Hari)
  - `4` : Tahunan (365 Hari)
  - `5` : Lifetime VIP (Selamanya)
- Masukkan nama pembeli / streamer.
- Kode serial serial siap disalin (contoh: `JULE-026A-CBE8-3905-1ED0-1637`).

### Cara 2: Lewat Baris Perintah (Terminal / CMD)
```bash
# Membuat kode 30 hari untuk "Budi Gaming"
node generate-license.js 30 "Budi Gaming"

# Membuat kode 90 hari (3 bulan)
node generate-license.js 90 "Rian Streamer"

# Membuat kode 1 tahun (365 hari)
node generate-license.js 365 "Gamer Pro"

# Membuat kode Lifetime (selamanya)
node generate-license.js lifetime "Owner VIP"
```

---

## 🌐 Aktivasi Langganan Lewat Web Dashboard

Pengguna tidak harus memasukkan kode lewat terminal. Mereka juga bisa mengaktifkannya langsung dari antarmuka Web Dashboard:
1. Buka dashboard di browser (`http://localhost:3000/`).
2. Klik kartu **KODE LANGGANAN** atau tombol **🔑 Lisensi** di bagian bawah.
3. Masukkan kode serial `JULE-XXXX-XXXX-XXXX-XXXX-XXXX`.
4. Klik **Aktifkan Kode**. Masa aktif langsung terupdate secara *real-time* tanpa perlu merestart server.

---

## 🖥️ Versi Native Desktop (Electron) & Build Installer (.EXE)

Aplikasi kini juga mendukung antarmuka **Native Desktop Electron** tanpa perlu membuka peramban web eksternal:

### 1. Menjalankan Versi Desktop Langsung
- Klik ganda **`start-electron.bat`** (atau jalankan `npm run electron:start` di terminal).
- Aplikasi akan terbuka sebagai jendela desktop native mandiri dengan:
  - Tampilan Obsidian Dark UI beresolusi tajam.
  - Dukungan **System Tray** di taskbar pojok kanan bawah Windows.
  - Pintasan keyboard (F11 Fullscreen, F12 DevTools, Ctrl+R Reload).
  - Server bot internal otomatis berjalan di latar belakang.

### 2. Mem-build Menjadi File Installer `.exe` atau Portable
Untuk mengemas seluruh aplikasi menjadi file installer `.exe` yang siap dibagikan kepada streamer/klien:

#### Cara 1: Menggunakan Script Otomatis
1. Klik ganda file **`build-electron-windows.bat`**.
2. Pilih jenis paket:
   - `1` : **Installer NSIS (.exe)** + **Portable (.exe)** *(Rekomendasi)*
   - `2` : Hanya **Portable (.exe)** (aplikasi langsung jalan tanpa instalasi)
   - `3` : Hanya **Setup Installer (.exe)**
3. File `.exe` yang sudah jadi akan tersimpan di folder **`dist-electron/`**.

#### Cara 2: Lewat Baris Perintah
```bash
# Build Installer & Portable Windows x64
npm run electron:dist

# Build hanya file Portable .exe
npm run electron:dist:portable

# Build hanya Setup Installer NSIS .exe
npm run electron:dist:installer
```

---

## 🛡️ Keamanan Sistem Lisensi
- **Enkripsi HMAC-SHA256**: Kode lisensi mengandung payload terenkripsi dengan checksum yang tidak dapat dipalsukan tanpa kunci rahasia (*secret salt*).
- **Auto Expiry Verification**: Tanggal kadaluarsa dihitung otomatis berdasarkan timestamp. Ketika waktu habis, bot otomatis terkunci hingga pengguna memperpanjang kode baru.
- **Tersimpan Aman**: Data aktivasi disimpan di file `license.json` dan terbaca otomatis pada setiap startup.
