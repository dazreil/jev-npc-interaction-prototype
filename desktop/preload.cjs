// The only bridge between the game page and the desktop app.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("engineHost", {
  kind: "desktop",
  onVaultChanged: (callback) => ipcRenderer.on("vault-changed", () => callback())
});
