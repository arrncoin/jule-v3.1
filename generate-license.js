#!/usr/bin/env node
// generate-license.js
// Tool Generator Kode Langganan Bot Kak Jule untuk Streamer / Pengguna

const readline = require("readline");
const licenseManager = require("./core/licensing/licenseManager");

const args = process.argv.slice(2);

// Jika argumen diberikan langsung lewat CLI:
// node generate-license.js <hari|lifetime> [nama_klien] [tier_code]
if (args.length > 0) {
    const rawDays = args[0].toUpperCase();
    const clientName = args[1] || "Pelanggan";
    let days = 30;
    let tierCode = 2;

    if (rawDays === "LIFETIME" || rawDays === "FOREVER") {
        days = "LIFETIME";
        tierCode = 5;
    } else if (rawDays === "7" || rawDays === "TRIAL") {
        days = 7;
        tierCode = 1;
    } else if (rawDays === "90" || rawDays === "PRO") {
        days = 90;
        tierCode = 3;
    } else if (rawDays === "365" || rawDays === "TAHUNAN") {
        days = 365;
        tierCode = 4;
    } else {
        days = parseInt(rawDays, 10) || 30;
        tierCode = 2;
    }

    printResult(days, tierCode, clientName);
    process.exit(0);
}

// Mode interaktif jika tanpa argumen
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\n=======================================================");
console.log("   🔑 GENERATOR KODE LANGGANAN BOT KAK JULE V3.1");
console.log("=======================================================");
console.log("Pilih Durasi Paket Langganan:");
console.log("1. 7 Hari    (Trial / Uji Coba)");
console.log("2. 30 Hari   (Standar / Bulanan)");
console.log("3. 90 Hari   (Pro / 3 Bulan)");
console.log("4. 365 Hari  (Tahunan / 1 Tahun)");
console.log("5. Lifetime  (Selamanya / VIP)");
console.log("=======================================================");

rl.question("Masukkan pilihan (1-5) [default 2]: ", (choice) => {
    let days = 30;
    let tierCode = 2;

    switch (choice.trim()) {
        case "1": days = 7; tierCode = 1; break;
        case "2": days = 30; tierCode = 2; break;
        case "3": days = 90; tierCode = 3; break;
        case "4": days = 365; tierCode = 4; break;
        case "5": days = "LIFETIME"; tierCode = 5; break;
        default: days = 30; tierCode = 2;
    }

    rl.question("Nama Klien / Streamer [default: Streamer]: ", (client) => {
        const clientName = client.trim() || "Streamer";
        printResult(days, tierCode, clientName);
        rl.close();
    });
});

function printResult(days, tierCode, clientName) {
    const key = licenseManager.generateKey(days, tierCode, clientName);
    const verify = licenseManager.verifyKey(key);

    console.log("\n-------------------------------------------------------");
    console.log("✅ KODE LANGGANAN BERHASIL DIBUAT!");
    console.log("-------------------------------------------------------");
    console.log(`KODE SERIAL : \x1b[32m\x1b[1m${key}\x1b[0m`);
    console.log(`Penerima    : ${clientName}`);
    console.log(`Paket       : ${verify.tier}`);
    console.log(`Masa Aktif  : ${verify.remainingDays} hari (s/d ${verify.expiresAt})`);
    console.log("-------------------------------------------------------");
    console.log("Berikan kode serial di atas kepada pengguna untuk dimasukkan di");
    console.log("Windows Launcher atau menu Aktivasi di Dashboard Web.");
    console.log("-------------------------------------------------------\n");
}
