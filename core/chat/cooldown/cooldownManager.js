// core/chat/cooldown/cooldownManager.js
class CooldownManager {
    constructor() {
        this.nextAllowedReply = 0;
        this.userCooldown = new Map();
    }

    check(userName, now, isCommand) {
        if (isCommand) return true;

        if (now < this.nextAllowedReply) return false;
        this.nextAllowedReply = now + 2000;

        const lastUser = this.userCooldown.get(userName) || 0;
        if (now - lastUser < 5000) return false;

        this.userCooldown.set(userName, now);

        // TTL cleanup
        if (this.userCooldown.size > 1000) {
            for (const [user, time] of this.userCooldown) {
                if (now - time > 60000) {
                    this.userCooldown.delete(user);
                }
            }
        }

        return true;
    }
}

module.exports = new CooldownManager();