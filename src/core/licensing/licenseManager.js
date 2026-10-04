// src/core/licensing/licenseManager.js
// Subscription and License Verification Engine for Kak Jule Bot Windows App
const fs = require("fs");
const crypto = require("crypto");
const { getWritablePath, getAppRootPath } = require("../utils/paths");

const SECRET_SALT = process.env.LICENSE_SECRET_SALT || "KAK_JULE_BOT_V31_LICENSING_SECRET_2026";

function getLicenseFilePath() {
    const writablePath = getWritablePath("license.json");
    if (fs.existsSync(writablePath)) {
        return writablePath;
    }
    const appRootPath = getAppRootPath("license.json");
    if (fs.existsSync(appRootPath)) {
        return appRootPath;
    }
    return writablePath;
}

const TIER_NAMES = {
    1: "TRIAL (7 Hari)",
    2: "STANDAR (30 Hari)",
    3: "PRO (90 Hari)",
    4: "TAHUNAN (365 Hari)",
    5: "LIFETIME VIP"
};

class LicenseManager {
    constructor() {
        this.cache = null;
        this.lastChecked = 0;
        this.init();
    }

    init() {
        const filePath = getLicenseFilePath();
        if (!fs.existsSync(filePath)) {
            try {
                fs.writeFileSync(
                    filePath,
                    JSON.stringify({
                        licenseKey: "",
                        registeredTo: "",
                        tier: "",
                        activatedAt: null
                    }, null, 2),
                    "utf8"
                );
            } catch (err) {
                console.error("Gagal membuat license.json awal:", err.message);
            }
        }
    }

    generateKey(days = 30, tierCode = 2, clientName = "Pelanggan") {
        const issuedAt = Math.floor(Date.now() / 1000);
        const expAt = days === "LIFETIME" || Number(tierCode) === 5 ? 0 : issuedAt + (parseInt(days, 10) * 86400);

        const buf = Buffer.alloc(10);
        buf.writeUInt8(Number(tierCode) || 2, 0);
        buf.writeUInt32BE(expAt === 0 ? 0 : expAt, 1);
        buf.writeUInt16BE(crypto.randomBytes(2).readUInt16BE(0), 5);

        const hmac = crypto.createHmac("sha256", SECRET_SALT).update(buf.subarray(0, 7)).digest();
        buf[7] = hmac[0];
        buf[8] = hmac[1];
        buf[9] = hmac[2];

        const hex = buf.toString("hex").toUpperCase();
        return `JULE-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}`;
    }

    verifyKey(key) {
        if (!key || typeof key !== "string") {
            return { valid: false, reason: "Kode langganan belum dimasukkan." };
        }

        const clean = key.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!clean.startsWith("JULE")) {
            return { valid: false, reason: "Format kode tidak valid (harus diawali JULE-)." };
        }

        const hex = clean.slice(4);
        if (hex.length !== 20) {
            return { valid: false, reason: "Panjang kode langganan tidak valid." };
        }

        try {
            const buf = Buffer.from(hex, "hex");
            const tierCode = buf.readUInt8(0);
            const expAt = buf.readUInt32BE(1);

            const hmac = crypto.createHmac("sha256", SECRET_SALT).update(buf.subarray(0, 7)).digest();
            if (buf[7] !== hmac[0] || buf[8] !== hmac[1] || buf[9] !== hmac[2]) {
                return { valid: false, reason: "Kode langganan salah atau tidak terdaftar!" };
            }

            const now = Math.floor(Date.now() / 1000);
            if (expAt !== 0 && now > expAt) {
                return {
                    valid: false,
                    expired: true,
                    reason: "Masa langganan telah berakhir. Silakan perpanjang kode.",
                    tier: TIER_NAMES[tierCode] || "EXPIRED",
                    tierCode,
                    remainingDays: 0,
                    expiresAt: new Date(expAt * 1000).toLocaleDateString("id-ID", {
                        day: "numeric", month: "long", year: "numeric"
                    })
                };
            }

            const remainingDays = expAt === 0 ? "LIFETIME" : Math.max(0, Math.ceil((expAt - now) / 86400));
            return {
                valid: true,
                expired: false,
                tier: TIER_NAMES[tierCode] || "PREMIUM",
                tierCode,
                remainingDays,
                expiresAt: expAt === 0 ? "Selamanya (LIFETIME)" : new Date(expAt * 1000).toLocaleDateString("id-ID", {
                    day: "numeric", month: "long", year: "numeric"
                })
            };
        } catch (err) {
            return { valid: false, reason: "Gagal memproses kode lisensi." };
        }
    }

    getStatus() {
        let currentKey = process.env.LICENSE_KEY;
        const filePath = getLicenseFilePath();

        if (!currentKey && fs.existsSync(filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
                currentKey = data.licenseKey;
            } catch (_) {}
        }

        if (!currentKey || !currentKey.trim()) {
            return {
                valid: false,
                reason: "Belum ada kode langganan yang diaktifkan.",
                isUnlocked: false,
                tier: "Belum Aktif",
                remainingDays: 0,
                expiresAt: "-",
                maskedKey: "",
                rawKey: ""
            };
        }

        const verification = this.verifyKey(currentKey);
        const maskedKey = currentKey.length > 10 
            ? `${currentKey.slice(0, 9)}...${currentKey.slice(-4)}`
            : currentKey;

        return {
            ...verification,
            isUnlocked: verification.valid,
            maskedKey,
            rawKey: currentKey
        };
    }

    activate(newKey, registeredTo = "Pengguna") {
        const verification = this.verifyKey(newKey);
        if (!verification.valid) {
            return { success: false, reason: verification.reason };
        }

        try {
            const data = {
                licenseKey: newKey.trim().toUpperCase(),
                registeredTo,
                tier: verification.tier,
                activatedAt: new Date().toISOString()
            };

            const targetPath = getWritablePath("license.json");
            fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), "utf8");
            this.cache = null;

            return {
                success: true,
                message: `Langganan berhasil diaktifkan! Paket: ${verification.tier}. Sisa masa aktif: ${verification.remainingDays} hari.`,
                status: this.getStatus()
            };
        } catch (err) {
            return { success: false, reason: `Gagal menyimpan lisensi: ${err.message}` };
        }
    }

    checkCli() {
        const status = this.getStatus();
        if (status.valid) {
            console.log(`✅ Lisensi Aktif: ${status.tier} | Sisa Waktu: ${status.remainingDays} hari (${status.expiresAt})`);
            process.exit(0);
        } else {
            console.log(`❌ ${status.reason}`);
            process.exit(1);
        }
    }
}

module.exports = new LicenseManager();
