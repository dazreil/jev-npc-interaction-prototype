// Standalone desktop app. Runs the vault-driven game in its own window, with
// no browser. Game files are served from an internal app:// address; Jev
// calls are made here in the main process, so the API key never reaches the
// game page.
//
//   npm run app
import { BrowserWindow, Menu, app, dialog, ipcMain, protocol, shell } from "electron";
import { watch } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readApiKey } from "../lib/env.mjs";
import { MAX_REQUEST_BYTES, jevStatus, parseJevBody, proxyJevDecision } from "../lib/jev-proxy.mjs";
import { applyEdits } from "../lib/editor-save.mjs";


const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Select the game before importing the compiler: its vault paths are also
// used by the editor and asset tools. Remember the choice between launches.
const selectionFile = join(app.getPath("userData"), "selected-game.json");
if (!process.env.GAME_VAULT) {
  try {
    const saved = JSON.parse(await readFile(selectionFile, "utf8"));
    await readFile(join(ROOT, saved.folder, "Game.md"), "utf8");
    process.env.GAME_VAULT = saved.folder;
  } catch { /* First launch (or a removed game): use the default game. */ }
}
const { VAULT_DIR, VAULT_URL_PREFIX, compileVault } = await import("../scripts/compile-vault.mjs");
const games = [];
for (const entry of await readdir(ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
  try {
    const text = await readFile(join(ROOT, entry.name, "Game.md"), "utf8");
    const title = text.match(/^title:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, "") ?? entry.name;
    games.push({ folder: entry.name, title });
  } catch { /* Only game folders appear in the picker. */ }
}
games.sort((a, b) => a.title.localeCompare(b.title));
async function selectGame(folder) {
  if (resolve(ROOT, folder) === VAULT_DIR) return;
  const choice = await dialog.showMessageBox(mainWindow, {
    type: "question", buttons: ["Switch game", "Cancel"], defaultId: 0, cancelId: 1,
    message: `Open ${games.find((game) => game.folder === folder)?.title ?? folder}?`,
    detail: "The app will restart. Save any unfinished editor changes first."
  });
  if (choice.response !== 0) return;
  try {
    await mkdir(dirname(selectionFile), { recursive: true });
    await writeFile(selectionFile, JSON.stringify({ folder }));
    process.env.GAME_VAULT = folder;
    app.relaunch();
    app.quit();
  } catch (error) {
    dialog.showErrorBox("Could not switch games", error.message);
  }
}
const SERVED = ["player/", "js/", "data/", VAULT_URL_PREFIX, "assets/fonts/", "assets/encounter/", "assets/vendor/"];
const MIME = {
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".onnx": "application/octet-stream"
};
const START_URL = "app://game/player/index.html";
// Read on each use, so a key saved in the Library (Keys) works without a restart.
const apiKey = () => readApiKey(ROOT);
const SMOKE_TEST = process.env.ENGINE_SMOKE_TEST === "1";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

let vault = await compileVault();
let mainWindow = null;

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function handle(request) {
  const path = normalize(decodeURIComponent(new URL(request.url).pathname)).replace(/^[/\\]+/, "");
  if (path === "vault.json") return json(vault);
  if (path === "api/jev/status") return json(jevStatus(apiKey()));
  if (path === "api/jev/decision" && request.method === "POST") {
    const text = await request.text();
    if (text.length > MAX_REQUEST_BYTES) return json({ error: "Request body is too large." }, 413);
    let body;
    try {
      body = parseJevBody(text);
    } catch (error) {
      return json({ error: error.message }, 400);
    }
    const result = await proxyJevDecision(body, apiKey());
    return json(result.body, result.status);
  }
  if (process.env.ENGINE_DEBUG) console.log(`[app] ${request.url} -> ${path}`);
  if (!SERVED.some((prefix) => path.startsWith(prefix)) || path.includes("/.")) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(join(ROOT, path));
    // no-store: after an edit, a restart always shows the new code and art.
    return new Response(body, { headers: { "Content-Type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" } });
  } catch (error) {
    if (process.env.ENGINE_DEBUG) console.log(`[app] ${error.message}`);
    return new Response("Not found", { status: 404 });
  }
}

function buildMenu() {
  const game = vault.notes.Game?.props.title ?? "Game";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      {
        label: "Game",
        submenu: [
          { label: "Open game", submenu: games.map((game) => ({
            label: game.title, type: "radio", checked: resolve(ROOT, game.folder) === VAULT_DIR,
            click: () => selectGame(game.folder)
          })) },
          { type: "separator" },
          { label: `Restart ${game}`, accelerator: "CmdOrCtrl+R", click: () => mainWindow?.reload() },
          { label: "Edit screen", accelerator: "CmdOrCtrl+E", click: () => mainWindow?.webContents.send("toggle-editor") },
          { role: "togglefullscreen" },
          { type: "separator" },
          { role: "quit" }
        ]
      },
      {
        label: "Develop",
        submenu: [{ role: "toggleDevTools" }, { label: "Open vault folder", click: () => shell.openPath(VAULT_DIR) }]
      }
    ])
  );
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: "#030610",
    title: vault.notes.Game?.props.title ?? "Game",
    show: !SMOKE_TEST,
    webPreferences: { preload: join(ROOT, "desktop", "preload.cjs"), contextIsolation: true, sandbox: true }
  });
  // The game never leaves its own pages or opens other windows. The one
  // exception: the Keys panel's "get a key" pages open in your own browser.
  const { LIBRARY_LINKS, SERVICES } = await import("../lib/services.mjs");
  const keyPages = new Set([...Object.values(SERVICES).map((service) => service.site), ...Object.values(LIBRARY_LINKS)]);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // …and a music pattern opened in Strudel (strudel.cc, the code in the link).
    if (keyPages.has(url) || url.startsWith("https://strudel.cc/#")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://game/")) event.preventDefault();
  });
  mainWindow.webContents.on("console-message", (event) => {
    if (event.level === "error" || event.level === "warning") console.log(`[game ${event.level}] ${event.message}`);
    else if (SMOKE_TEST && /^Voice/.test(event.message)) console.log(`[game] ${event.message}`);
  });
  await mainWindow.loadURL(START_URL);

  if (SMOKE_TEST) {
    // npm run app:smoke — renders, saves screenshots, and quits.
    // ENGINE_SMOKE_WAIT_MS gives the voice time to download on a first run.
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.ENGINE_SMOKE_WAIT_MS) || 2500));
    const image = await mainWindow.webContents.capturePage();
    await mkdir(join(ROOT, "build"), { recursive: true });
    await writeFile(join(ROOT, "build", "app-smoke.png"), image.toPNG());
    // Then use the intercom, which must open in place on the same screen.
    await mainWindow.webContents.executeJavaScript(
      `document.querySelector('[data-ui-id="intercom-hotspot"]').click()`
    );
    // Wait for the greeting: it logs which voice spoke ("Voice: piper").
    await new Promise((resolve) => setTimeout(resolve, 9000));
    const opened = await mainWindow.webContents.capturePage();
    await writeFile(join(ROOT, "build", "app-smoke-intercom.png"), opened.toPNG());
    console.log("Smoke test screenshots: build/app-smoke.png, build/app-smoke-intercom.png");
    app.quit();
  }
}

app.whenReady().then(async () => {
  protocol.handle("app", handle);
  // The screen editor saves straight into the vault; the watcher then redraws.
  ipcMain.handle("save-edits", async (_event, edits) => {
    try {
      const result = await applyEdits(VAULT_DIR, edits);
      // Rebuild now, so the page can load what was just saved (a new screen).
      if (result.saved?.length) vault = await compileVault();
      return result;
    } catch (error) {
      return { saved: [], conflicts: [], error: error.message };
    }
  });
  // The Characters workspace (lib/studio.mjs): new character, run a card, import a picture.
  ipcMain.handle("studio", async (_event, action, request) => {
    try {
      const studio = await import("../lib/studio.mjs");
      const work = studio.ACTIONS[action];
      if (!work) throw new Error(`Unknown studio action ${action}`);
      const result = await work(VAULT_DIR, request ?? {});
      if (["new", "run", "import", "saveLibrary"].includes(action)) vault = await compileVault();
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  buildMenu();
  await createWindow();

  // While you edit the vault in Obsidian, the open game redraws on save.
  if (!app.isPackaged && !SMOKE_TEST) {
    let timer = null;
    watch(VAULT_DIR, { recursive: true }, (_event, file) => {
      if (!file || file.startsWith(".obsidian")) return;
      clearTimeout(timer);
      timer = setTimeout(async function rebuild(retry = true) {
        vault = await compileVault();
        mainWindow?.webContents.send("vault-changed");
        // Obsidian saves some files by replacing them, so a file can be
        // missing for a moment. Try once more before reporting a problem.
        if (vault.errors.length && retry) setTimeout(() => rebuild(false), 500);
      }, 150);
    });
  }
});

app.on("window-all-closed", () => app.quit());
