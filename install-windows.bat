@echo off
chcp 65001 >nul
title Setup & Install Dependensi - Kak Jule Bot
color 0B

echo ======================================================================
echo    📦 INSTALL DEPENDENSI KAK JULE BOT UNTUK WINDOWS 10/11
echo ======================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js belum terinstall!
    echo Unduh dan install Node.js LTS terlebih dahulu di:
    echo 👉 https://nodejs.org/
    pause
    exit /b 1
)

echo Mengunduh paket modul yang dibutuhkan...
call npm install

if %errorlevel% equ 0 (
    color 0A
    echo.
    echo ======================================================================
    echo [SUKSES] Instalasi selesai!
    echo Sekarang Anda dapat menjalankan aplikasi dengan mengklik ganda:
    echo 👉 start.bat
    echo ======================================================================
) else (
    color 0C
    echo [ERROR] Terjadi kesalahan saat instalasi dependensi.
)

pause
