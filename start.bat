@echo off
chcp 65001 >nul
title Kak Jule V3.1 - Live Stream Assistant & Bot
color 0B

echo ======================================================================
echo    ⚡ KAK JULE V3.1 - WINDOWS LIVE STREAM ASSISTANT & BOT ⚡
echo ======================================================================
echo.

:: 1. Cek Instalasi Node.js di Windows
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js tidak ditemukan di komputer ini!
    echo.
    echo Silakan install Node.js (LTS version) terlebih dahulu:
    echo 👉 https://nodejs.org/
    echo.
    echo Setelah selesai install Node.js, buka kembali file ini.
    echo ======================================================================
    pause
    exit /b 1
)

:: 2. Cek Folder node_modules
if not exist "node_modules\" (
    echo [INFO] Dependensi belum terinstall. Menginstall modul otomatis...
    echo Harap tunggu sebentar...
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo [ERROR] Gagal menginstall dependensi npm!
        pause
        exit /b 1
    )
    echo [OK] Dependensi berhasil diinstall!
    echo.
)

:: 3. Verifikasi Kode Langganan
:check_license
node -e "const lm = require('./core/licensing/licenseManager'); process.exit(lm.getStatus().isUnlocked ? 0 : 1)" >nul 2>nul
if %errorlevel% neq 0 (
    color 0E
    echo ======================================================================
    echo   🔑 AKTIVASI KODE LANGGANAN DIPERLUKAN
    echo ======================================================================
    echo Aplikasi ini membutuhkan kode langganan aktif untuk dapat dijalankan.
    echo Format kode contoh: JULE-026A-CBE7-XXXX-XXXX-XXXX
    echo.
    set /p USER_KEY="👉 Masukkan Kode Langganan Anda: "
    
    if "%USER_KEY%"=="" (
        echo [!] Kode tidak boleh kosong!
        goto check_license
    )

    node -e "const lm = require('./core/licensing/licenseManager'); const res = lm.activate('%USER_KEY%'); if(!res.success){ console.error('\n❌ ' + res.reason + '\n'); process.exit(1); } else { console.log('\n✅ ' + res.message + '\n'); process.exit(0); }"
    if %errorlevel% neq 0 (
        echo Silakan coba lagi dengan kode yang benar atau hubungi penyedia bot.
        echo.
        goto check_license
    )
)

color 0A
echo ======================================================================
node -e "const lm = require('./core/licensing/licenseManager'); const s = lm.getStatus(); console.log('✅ STATUS LANGGANAN: ' + s.tier + ' (Sisa ' + s.remainingDays + ' hari | Exp: ' + s.expiresAt + ')');"
echo ======================================================================
echo.
echo [1/2] Membuka App Control Center di browser...
timeout /t 2 /nobreak >nul
start http://localhost:3000/app/index.html

echo [2/2] Memulai Server Bot Kak Jule...
echo.
echo ======================================================================
echo   Aplikasi sedang berjalan! Jangan tutup jendela ini selama live.
echo   Tekan CTRL + C untuk berhenti.
echo ======================================================================
echo.

node index.js

pause
