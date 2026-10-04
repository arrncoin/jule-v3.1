// core/chat/filters/responseFilter.js
const { isFuzzyMatch } = require("../utils/fuzzy");

const keywords = ["jule", "tante", "kakak", "kak", "bg do"];

module.exports = function shouldRespond(message, isCommand) {
    if (isCommand) return true;

    const lower = message.toLowerCase();

    const hasKeyword = keywords.some(k => isFuzzyMatch(lower, k));
    if (hasKeyword) return true;

    if (message.includes("?") && Math.random() < 0.5) return true;
    if (Math.random() < 0.02) return true;

    return false;
};