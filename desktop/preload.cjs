// The only bridge between the game page and the desktop app.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("engineHost", {
  kind: "desktop",
  onVaultChanged: (callback) => ipcRenderer.on("vault-changed", () => callback()),
  // The screen editor (Cmd+E) saves card boxes and UI element positions.
  saveEdits: (edits) => ipcRenderer.invoke("save-edits", edits),
  onToggleEditor: (callback) => ipcRenderer.on("toggle-editor", () => callback()),
  // The Characters workspace: make a character, run an art card, import a picture.
  studio: (action, request) => ipcRenderer.invoke("studio", action, request)
});
