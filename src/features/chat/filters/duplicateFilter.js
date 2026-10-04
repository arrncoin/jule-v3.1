// core/chat/filters/duplicateFilter.js
class DuplicateFilter {
    constructor() {
        this.lastMessages = new Map();
    }

    check(userName, message) {
        const last = this.lastMessages.get(userName);
        if (last === message) return false;

        this.lastMessages.set(userName, message);

        if (this.lastMessages.size > 1000) {
            this.lastMessages.clear();
        }

        return true;
    }
}

module.exports = new DuplicateFilter();