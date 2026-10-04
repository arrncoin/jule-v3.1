// src/features/chat/guards/activeGuard.js
const context = require("../../../core/state/context");

module.exports = function activeGuard() {
    return context.isActive;
};