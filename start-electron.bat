@echo off
setlocal enabledelayedexpansion
title Kak Jule Desktop (Electron) - Windows 10/11
color 0B

echo ======================================================================
echo    KAK JULE V3.1 - NATIVE ELECTRON DESKTOP APPLICATION
echo ======================================================================
echo.

REM 1. Cek Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js belum terpasang di komputer ini!
    echo Unduh dan pasang Node.js LTS di https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 2. Cek Dependensi
if not exist "node_modules\" (
    echo [INFO] Memasang dependensi aplikasi (npm install)...
    call npm install
)

REM 3. Verifikasi Kode Langganan
:check_license
node -e "const lm = require('./core/licensing/licenseManager'); process.exit(lm.getStatus().isUnlocked ? 0 : 1)" >nul 2>nul
if %errorlevel% neq 0 (
    color 0E
    echo ======================================================================
    echo   AKTIVASI KODE LANGGANAN DIPERLUKAN
    echo ======================================================================
    echo Format kode contoh: JULE-026A-CBE7-XXXX-XXXX-XXXX
    echo.
    set /p USER_KEY="Masukkan Kode Langganan Anda: "
    
    if "!USER_KEY!"=="" (
        echo [!] Kode tidak boleh kosong!
        goto check_license
    )

    node -e "const lm = require('./core/licensing/licenseManager'); const res = lm.activate('!USER_KEY!'); if(!res.success){ console.error('\n[GAGAL] ' + res.reason + '\n'); process.exit(1); } else { console.log('\n[SUKSES] ' + res.message + '\n'); process.exit(0); }"
    if %errorlevel% neq 0 (
        echo Silakan periksa kembali kode langganan Anda.
        echo.
        goto check_license
    )
)

color 0A
echo [OK] Lisensi aktif! Memulai antarmuka Electron Desktop...
echo.

call npm run electron:start
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERROR] Aplikasi desktop tertutup dengan kode error %errorlevel%.
    echo.
    pause
)

