// index.js — Kak Jule V3.1 (MODULAR LIVE STREAM BOT & OVERLAY)
const { startServer } = require("./src/app/bootstrap");

const instance = startServer();

module.exports = instance;
