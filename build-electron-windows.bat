@echo off
setlocal enabledelayedexpansion
title Build Windows EXE - Kak Jule Electron Builder
color 0E

REM Fix Working Directory: Memastikan script selalu berjalan di folder lokasi file .bat ini
cd /d "%~dp0"

echo ======================================================================
echo     BUILD KAK JULE WINDOWS DESKTOP (.EXE) DENGAN ELECTRON
echo ======================================================================
echo.

REM 1. Cek ketersediaan Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js belum terpasang atau belum masuk ke PATH Windows!
    echo Silakan download dan pasang Node.js LTS di https://nodejs.org/
    echo Setelah instalasi selesai, buka kembali file ini.
    echo.
    pause
    exit /b 1
)

REM 2. Cek ketersediaan NPM
where npm >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] NPM belum terpasang di sistem!
    echo.
    pause
    exit /b 1
)

REM 3. Cek dependensi node_modules
if not exist "node_modules\" (
    echo [INFO] Folder node_modules belum ditemukan.
    echo [INFO] Menjalankan npm install, mohon tunggu sebentar...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo [ERROR] Gagal memasang dependensi npm.
        echo Periksa koneksi internet Anda lalu coba lagi.
        echo.
        pause
        exit /b 1
    )
)

REM 4. Cek apakah electron-builder sudah terpasang
if not exist "node_modules\electron-builder\" (
    echo [INFO] electron-builder belum ditemukan di node_modules.
    echo [INFO] Memasang paket electron & electron-builder...
    echo.
    call npm install
)

REM Nonaktifkan pencarian otomatis sertifikat code signing jika tidak ada
set CSC_IDENTITY_AUTO_DISCOVERY=false

REM 5. Cek Hak Akses Administrator (diperlukan untuk symbolic link winCodeSign)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ----------------------------------------------------------------------
    echo [PENTING] Anda menjalankan file ini tanpa Administrator Privilege.
    echo Windows memerlukan izin Administrator untuk membuat Symbolic Link saat
    echo mengekstrak binary winCodeSign pertama kali.
    echo Jika muncul error 'Cannot create symbolic link', jalankan via:
    echo  - Klik Kanan 'build-electron-windows.bat' -^> 'Run as administrator'
    echo  - Atau aktifkan 'Developer Mode' di Windows Settings
    echo ----------------------------------------------------------------------
)

echo.
echo Pilih Jenis Paket Build Windows:
echo [1] Installer Setup (.exe NSIS) + Portable (.exe) [Rekomendasi]
echo [2] Hanya Portable (.exe) [Langsung klik tanpa install]
echo [3] Hanya Installer Setup (.exe)
echo [4] Unpacked Folder [Direktori aplikasi tanpa kompresi]
echo ======================================================================

set CHOICE=1
set /p CHOICE="Pilih nomor (1-4) [Default 1]: "

if "%CHOICE%"=="1" goto BUILD_ALL
if "%CHOICE%"=="2" goto BUILD_PORTABLE
if "%CHOICE%"=="3" goto BUILD_INSTALLER
if "%CHOICE%"=="4" goto BUILD_DIR

echo.
echo [PERINGATAN] Pilihan tidak valid, menggunakan default opsi 1.
goto BUILD_ALL

:BUILD_ALL
echo.
echo [INFO] Memulai build Installer (.exe NSIS) dan Portable (.exe) x64...
call npm run electron:dist
goto FINISH

:BUILD_PORTABLE
echo.
echo [INFO] Memulai build Portable (.exe) x64...
call npm run electron:dist:portable
goto FINISH

:BUILD_INSTALLER
echo.
echo [INFO] Memulai build Setup Installer (.exe NSIS) x64...
call npm run electron:dist:installer
goto FINISH

:BUILD_DIR
echo.
echo [INFO] Memulai pack folder uncompressed...
call npm run electron:pack
goto FINISH

:FINISH
if %errorlevel% equ 0 goto BUILD_SUCCESS
goto BUILD_FAIL

:BUILD_SUCCESS
color 0A
echo.
echo ======================================================================
echo  BUILD BERHASIL SELESAI!
echo ======================================================================
echo File aplikasi Windows .exe tersimpan di folder:
echo  dist-electron\
echo.
echo Silakan buka folder 'dist-electron' untuk menjalankan aplikasi.
echo ======================================================================
goto DONE

:BUILD_FAIL
color 0C
echo.
echo ======================================================================
echo  [ERROR] Terjadi kendala saat proses build [Kode: %errorlevel%]
echo ======================================================================
echo Tips solusi:
echo 1. Jika error 'Cannot create symbolic link' (winCodeSign):
echo    - Tutup jendela ini, klik kanan 'build-electron-windows.bat'
echo      lalu pilih 'Run as administrator' (Jalankan sebagai administrator).
echo    - ATAU aktifkan 'Developer Mode' di Windows Settings:
echo      Settings -^> Update ^& Security -^> For developers -^> Developer Mode (ON).
echo 2. Hapus folder cache jika korup:
echo    C:\Users\%USERNAME%\AppData\Local\electron-builder\Cache\winCodeSign
echo 3. Opsi cepat tanpa install NSIS:
echo    Pilih nomor [2] Hanya Portable (.exe) atau nomor [4] Unpacked Folder.
echo ======================================================================
goto DONE

:DONE
echo.
pause