// Local-only workbench (ENGINE_SPEC.md section 12). Serves the UI preview,
// compiles the vault in memory, and tells open pages to redraw each time a
// note is saved in Obsidian. It never writes to the vault.
//
//   npm run workbench    then open http://localhost:5174
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { readApiKey } from "../lib/env.mjs";
import { MAX_REQUEST_BYTES, jevStatus, parseJevBody, proxyJevDecision } from "../lib/jev-proxy.mjs";
import { applyEdits } from "../lib/editor-save.mjs";
import { VAULT_DIR, VAULT_URL_PREFIX, compileVault } from "./compile-vault.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.WORKBENCH_PORT) || 5174;
const SERVED = ["workbench/", "player/", "js/", "data/", VAULT_URL_PREFIX, "assets/fonts/", "assets/encounter/", "assets/vendor/"];
const MIME = {
  ".mp3": "audio/mpeg",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".onnx": "application/octet-stream",
  ".json": "application/json; charset=utf-8"
};

const API_KEY = readApiKey(ROOT);

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

let vault = await compileVault();
const listeners = new Set();
let timer = null;

watch(VAULT_DIR, { recursive: true }, (_event, file) => {
  if (!file || file.startsWith(".obsidian")) return;
  clearTimeout(timer);
  timer = setTimeout(async function rebuild(retry = true) {
    vault = await compileVault();
    console.log(`Vault rebuilt (${Object.keys(vault.notes).length} notes, ${vault.errors.length} errors) after ${file}`);
    for (const response of listeners) response.write(`data: ${vault.builtAt}\n\n`);
    // A file Obsidian is replacing can be missing for a moment; try again once.
    if (vault.errors.length && retry) setTimeout(() => rebuild(false), 500);
  }, 150);
});

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, "http://localhost");
  if (pathname === "/vault.json") {
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(vault));
    return;
  }
  if (request.method === "GET" && pathname === "/api/jev/status") {
    sendJson(response, 200, jevStatus(API_KEY));
    return;
  }
  if (request.method === "POST" && pathname === "/api/jev/decision") {
    let body;
    try {
      body = parseJevBody(await readBody(request));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    const result = await proxyJevDecision(body, API_KEY);
    sendJson(response, result.status, result.body);
    return;
  }
  // The screen editor on /player/ saves here (local dev only, like the app).
  if (request.method === "POST" && pathname === "/api/editor/save") {
    try {
      const result = await applyEdits(VAULT_DIR, JSON.parse(await readBody(request)));
      // Rebuild now, so the page can load what was just saved (a new screen).
      if (result.saved?.length) vault = await compileVault();
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, { saved: [], conflicts: [], error: error.message });
    }
    return;
  }
  if (pathname === "/events") {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    response.write(": connected\n\n");
    listeners.add(response);
    request.on("close", () => listeners.delete(response));
    return;
  }

  const path = normalize(decodeURIComponent(pathname === "/" ? "/workbench/index.html" : pathname)).replace(/^\/+/, "");
  if (!SERVED.some((prefix) => path.startsWith(prefix)) || path.includes("/.")) {
    response.writeHead(404).end("Not found");
    return;
  }
  try {
    const file = await readFile(join(ROOT, path));
    response.writeHead(200, { "Content-Type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(file);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).on("error", (error) => {
  if (error.code !== "EADDRINUSE") throw error;
  console.log(`The workbench is already running: http://localhost:${PORT}`);
  console.log(`To run a second one, set another port: WORKBENCH_PORT=5175 npm run workbench`);
  process.exit(0);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Workbench: http://localhost:${PORT}`);
  if (vault.errors.length) console.log(`Vault has ${vault.errors.length} error(s); the page lists them.`);
});
