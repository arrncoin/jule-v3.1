// core/chat/utils/fuzzy.js
const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

const isFuzzyMatch = (text, keyword) => {
    const t = normalize(text);
    const k = normalize(keyword);

    if (!t || !k) return false;
    if (t.includes(k)) return true;

    let mismatch = 0;
    for (let i = 0; i < Math.min(t.length, k.length); i++) {
        if (t[i] !== k[i]) mismatch++;
    }

    const similarity = 1 - mismatch / k.length;
    return similarity > 0.7;
};

module.exports = { isFuzzyMatch };