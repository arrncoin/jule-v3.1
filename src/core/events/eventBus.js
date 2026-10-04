// src/core/events/eventBus.js
const EventEmitter = require("events");

class AppEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(Infinity);
    }
}

module.exports = new AppEventBus();
