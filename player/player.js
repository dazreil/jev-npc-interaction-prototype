// The game as a player sees it: the start screen from the vault, full
// window, no tools. Runs in the desktop app (npm run app).
import { PlaySession, bindUiKeys } from "/js/engine/session.js";
import { createSound } from "/js/engine/sound.js";
import { createEditor } from "/player/editor.js";
import { chooseNpcAction as chooseJevAction } from "/js/providers/jev-vault.js";
import { chooseNpcAction as chooseMockAction } from "/js/providers/mock.js";

const stage = document.querySelector("#stage");
let editor = null;
const toast = document.querySelector("#toast");

const load = (url) => fetch(url, { cache: "no-store" }).then((response) => response.json());

// Pictures: crunchy (the 90s CD-ROM look) or clean (the same pictures
// without the crunch, from their clean twins). P switches; it is remembered.
let cleanPictures = false;
try {
  cleanPictures = localStorage.getItem("pictures") === "clean";
} catch {
  // No storage here: crunchy, as made.
}
/** The vault with every crunched picture swapped for its clean twin, in clean mode. */
const withPictures = (data) => (cleanPictures && data.clean ? JSON.parse(JSON.stringify(data), (_key, value) => (typeof value === "string" && data.clean[value]) || value) : data);
let rawVault = null;
const loadVault = async () => withPictures((rawVault = await load("/vault.json")));

const [vault, jev] = await Promise.all([loadVault(), load("/api/jev/status").catch(() => ({}))]);
document.title = vault.notes.Game?.props.title ?? "Game";

// The voice model downloads once (about 60 MB), then it is cached.
let voiceNote = "";
let lastReported = -1;
const sound = createSound({
  onProgress: ({ loaded, total }) => {
    const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
    voiceNote = percent < 100 ? `Loading Arthur's voice… ${percent}%` : "";
    if (percent % 25 === 0 && percent !== lastReported) console.info(`Voice loading ${(lastReported = percent)}%`);
    showToast();
  }
});

const session = new PlaySession({
  sound,
  vault,
  providers: { mock: chooseMockAction, jev: chooseJevAction },
  providerId: jev.configured ? "jev" : "mock",
  onChange: (options) => render(options),
  onLog: (text) => console.info(text)
});

const reported = new Set();

function render(options = {}) {
  const { problems } = session.render(stage, {
    ...options,
    maxWidth: window.innerWidth - (editor?.panelWidth() ?? 0),
    maxHeight: window.innerHeight,
    maxScale: 4
  });
  for (const problem of problems) {
    if (reported.has(problem)) continue;
    reported.add(problem);
    console.warn(problem);
  }
  showToast();
}

function showToast() {
  const text = session.status || pictureNote || voiceNote;
  toast.hidden = !text;
  toast.textContent = text;
}

// P switches the pictures between crunchy and clean (not while typing).
let pictureNote = "";
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "p" || event.metaKey || event.ctrlKey || event.target.closest?.("input, textarea, select")) return;
  if (editor?.dirty) return;
  cleanPictures = !cleanPictures;
  try {
    localStorage.setItem("pictures", cleanPictures ? "clean" : "crunchy");
  } catch {
    // Not remembered, but still switched.
  }
  session.setVault(withPictures(rawVault));
  pictureNote = cleanPictures ? "Pictures: clean (P)" : "Pictures: crunchy (P)";
  render();
  setTimeout(() => {
    pictureNote = "";
    showToast();
  }, 1500);
});

// M mutes and unmutes all sound (not while typing).
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "m" || event.target.closest?.("input, textarea")) return;
  sound.setMuted(!sound.muted);
  voiceNote = sound.muted ? "Sound off (M)" : "";
  showToast();
  if (!sound.muted) setTimeout(showToast, 1500);
});

// The screen editor (Cmd+E, or Game → Edit screen). In the desktop app it
// saves through the app; on the workbench server, through its save endpoint.
const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((response) => response.json());
const editorHost = window.engineHost ?? {
  saveEdits: (edits) => post("/api/editor/save", edits),
  studio: (action, request) => post(`/api/studio/${action}`, request)
};
// After a save that adds a screen, the editor loads the rebuilt vault.
const reloadVault = async () => {
  session.setVault(await loadVault());
  render();
};
editor = createEditor({ session, stage, render: () => render(), host: editorHost, reloadVault });
window.engineHost?.onToggleEditor?.(() => editor.toggle());
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e" && !window.engineHost) {
    event.preventDefault();
    editor.toggle();
  }
});

session.start();
render();
bindUiKeys(stage);
window.addEventListener("resize", () => {
  render();
  editor.redraw();
});

// Desktop app in development: redraw when a note is saved in Obsidian.
window.engineHost?.onVaultChanged(async () => {
  // Unsaved editor changes live in this copy of the vault; keep it.
  if (editor.dirty) return editor.markStale();
  session.setVault(await loadVault());
  render();
  editor.redraw();
});
