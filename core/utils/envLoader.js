// core/utils/envLoader.js (Compatibility Bridge)
const config = require("../../src/config");

module.exports = {
    loadEnvironment: () => config.loadEnvironment(),
    saveConfigVariable: (key, val) => config.saveConfigVariable(key, val)
};
