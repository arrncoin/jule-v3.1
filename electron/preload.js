// electron/preload.js
// Secure Context Bridge for Kak Jule Desktop App

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    platform: process.platform,
    minimize: () => ipcRenderer.send("window-minimize"),
    maximize: () => ipcRenderer.send("window-maximize"),
    close: () => ipcRenderer.send("window-close"),
    openExternal: (url) => ipcRenderer.send("open-external", url),
    getAppVersion: () => ipcRenderer.invoke("get-app-version"),
    getLicenseStatus: () => ipcRenderer.invoke("get-license-status"),
    onOpenSettings: (callback) => ipcRenderer.on("open-settings", (_event, ...args) => callback(...args))
});
