// The game as a player sees it: the start screen from the vault, full
// window, no tools. Runs in the desktop app (npm run app).
import { PlaySession, bindUiKeys } from "/js/engine/session.js";
import { createSound } from "/js/engine/sound.js";
import { chooseNpcAction as chooseJevAction } from "/js/providers/jev.js";
import { chooseNpcAction as chooseMockAction } from "/js/providers/mock.js";

const stage = document.querySelector("#stage");
const toast = document.querySelector("#toast");

const load = (url) => fetch(url, { cache: "no-store" }).then((response) => response.json());
const [vault, npcTemplate, dialogueData, jev] = await Promise.all([
  load("/vault.json"),
  load("/data/arthur.json"),
  load("/data/dialogue.json"),
  load("/api/jev/status").catch(() => ({}))
]);
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
  npcTemplate,
  dialogueData,
  providers: { mock: chooseMockAction, jev: chooseJevAction },
  providerId: jev.configured ? "jev" : "mock",
  onChange: (options) => render(options),
  onLog: (text) => console.info(text)
});

const reported = new Set();

function render(options = {}) {
  const { problems } = session.render(stage, {
    ...options,
    maxWidth: window.innerWidth,
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
  const text = session.status || voiceNote;
  toast.hidden = !text;
  toast.textContent = text;
}

// M mutes and unmutes all sound (not while typing).
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "m" || event.target.closest?.("input, textarea")) return;
  sound.setMuted(!sound.muted);
  voiceNote = sound.muted ? "Sound off (M)" : "";
  showToast();
  if (!sound.muted) setTimeout(showToast, 1500);
});

session.start();
render();
bindUiKeys(stage);
window.addEventListener("resize", () => render());

// Desktop app in development: redraw when a note is saved in Obsidian.
window.engineHost?.onVaultChanged(async () => {
  session.setVault(await load("/vault.json"));
  render();
});
