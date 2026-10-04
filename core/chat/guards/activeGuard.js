// core/chat/guards/activeGuard.js
const context = require("../../../utils/context");

module.exports = function activeGuard() {
    return context.isActive;
};