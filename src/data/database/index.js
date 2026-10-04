// src/data/database/index.js
// Central Database Facade
const { getConnection, getDbPath } = require("./connection");
const userRepository = require("../repositories/userRepository");
const pointsRepository = require("../repositories/pointsRepository");

class DatabaseFacade {
    constructor() {
        this.init();
    }

    init() {
        const db = getConnection();
        if (db) {
            userRepository.deduplicateAndMigrate();
            userRepository.syncHistoricalData();
        }
        return db;
    }

    get db() {
        return getConnection();
    }

    getDbPath() {
        return getDbPath();
    }

    // Delegate to UserRepository
    findExactUser(platform, platformUserId) {
        return userRepository.findExactUser(platform, platformUserId);
    }

    findUser(platform, platformUserId, username = null) {
        return userRepository.findUser(platform, platformUserId, username);
    }

    findUserById(id) {
        return userRepository.findUserById(id);
    }

    upsertUser(platform, platformUserId, username, displayName) {
        return userRepository.upsertUser(platform, platformUserId, username, displayName);
    }

    getUserRank(points = 0) {
        return userRepository.getUserRank(points);
    }

    deduplicateAndMigrate() {
        return userRepository.deduplicateAndMigrate();
    }

    syncHistoricalData() {
        return userRepository.syncHistoricalData();
    }

    // Delegate to PointsRepository
    isEventProcessed(eventId) {
        return pointsRepository.isEventProcessed(eventId);
    }

    applyPoints(userId, amount, source, description, eventId = null) {
        return pointsRepository.applyPoints(userId, amount, source, description, eventId);
    }

    getLeaderboard(limit = 10) {
        return pointsRepository.getLeaderboard(limit);
    }

    getUserTransactions(userId, limit = 20) {
        return pointsRepository.getUserTransactions(userId, limit);
    }
}

const db = new DatabaseFacade();
module.exports = db;
