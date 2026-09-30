// Standalone desktop app. Runs the vault-driven game in its own window, with
// no browser. Game files are served from an internal app:// address; Jev
// calls are made here in the main process, so the API key never reaches the
// game page.
//
//   npm run app
import { BrowserWindow, Menu, app, protocol, shell } from "electron";
import { watch } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { readApiKey } from "../lib/env.mjs";
import { MAX_REQUEST_BYTES, jevStatus, parseJevBody, proxyJevDecision } from "../lib/jev-proxy.mjs";
import { VAULT_DIR, compileVault } from "../scripts/compile-vault.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVED = ["player/", "js/", "data/", "game/assets/", "assets/fonts/", "assets/encounter/", "assets/vendor/"];
const MIME = {
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
const API_KEY = readApiKey(ROOT);
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
  if (path === "api/jev/status") return json(jevStatus(API_KEY));
  if (path === "api/jev/decision" && request.method === "POST") {
    const text = await request.text();
    if (text.length > MAX_REQUEST_BYTES) return json({ error: "Request body is too large." }, 413);
    let body;
    try {
      body = parseJevBody(text);
    } catch (error) {
      return json({ error: error.message }, 400);
    }
    const result = await proxyJevDecision(body, API_KEY);
    return json(result.body, result.status);
  }
  if (process.env.ENGINE_DEBUG) console.log(`[app] ${request.url} -> ${path}`);
  if (!SERVED.some((prefix) => path.startsWith(prefix))) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(join(ROOT, path));
    return new Response(body, { headers: { "Content-Type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream" } });
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
          { label: `Restart ${game}`, accelerator: "CmdOrCtrl+R", click: () => mainWindow?.reload() },
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
  // The game never leaves its own pages or opens other windows.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
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

app.on("mainWindow-all-closed", () => app.quit());
