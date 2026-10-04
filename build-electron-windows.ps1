# build-electron-windows.ps1
# PowerShell build script for Kak Jule Electron Windows Executable

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   BUILD KAK JULE WINDOWS DESKTOP (.EXE) DENGAN ELECTRON (POWERSHELL)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Cek Node.js
if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js belum terpasang di sistem!" -ForegroundColor Red
    Write-Host "Silakan unduh dan pasang Node.js LTS dari https://nodejs.org/" -ForegroundColor Yellow
    pause
    exit 1
}

# 2. Cek npm
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] npm belum terpasang di sistem!" -ForegroundColor Red
    pause
    exit 1
}

# 3. Cek node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Memasang dependensi proyek (npm install)..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "Pilih Jenis Paket Build Windows:" -ForegroundColor Yellow
Write-Host "[1] Installer Setup (.exe NSIS) + Portable (.exe) [Rekomendasi]"
Write-Host "[2] Hanya Portable (.exe) [Langsung klik tanpa install]"
Write-Host "[3] Hanya Installer Setup (.exe)"
Write-Host "[4] Unpacked Folder [Direktori aplikasi tanpa kompresi]"
Write-Host "======================================================================"

$choice = Read-Host "Pilih nomor (1-4) [Default 1]"
if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

switch ($choice) {
    "1" {
        Write-Host "`n[INFO] Menjalankan build Installer NSIS + Portable x64..." -ForegroundColor Green
        npm run electron:dist
    }
    "2" {
        Write-Host "`n[INFO] Menjalankan build Portable .exe x64..." -ForegroundColor Green
        npm run electron:dist:portable
    }
    "3" {
        Write-Host "`n[INFO] Menjalankan build Installer NSIS .exe x64..." -ForegroundColor Green
        npm run electron:dist:installer
    }
    "4" {
        Write-Host "`n[INFO] Menjalankan pack folder uncompressed..." -ForegroundColor Green
        npm run electron:pack
    }
    Default {
        Write-Host "`n[INFO] Menjalankan build default (Installer + Portable)..." -ForegroundColor Green
        npm run electron:dist
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n======================================================================" -ForegroundColor Green
    Write-Host " BUILD BERHASIL SELESAI!" -ForegroundColor Green
    Write-Host "File aplikasi Windows .exe tersimpan di folder:" -ForegroundColor Green
    Write-Host "👉 dist-electron\" -ForegroundColor Cyan
    Write-Host "======================================================================" -ForegroundColor Green
} else {
    Write-Host "`n[ERROR] Terjadi kendala saat proses build." -ForegroundColor Red
}

pause
