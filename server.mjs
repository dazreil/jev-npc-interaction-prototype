import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { jevStatus, MAX_REQUEST_BYTES, parseJevBody, proxyJevDecision } from "./lib/jev-proxy.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_ROOT_FILES = new Set(["index.html", "styles.css"]);
const PUBLIC_DIRECTORIES = ["assets/", "data/", "js/"];
const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".data": "application/octet-stream",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webp": "image/webp"
});

function loadLocalEnvironment() {
  let contents;
  try {
    contents = readFileSync(resolve(ROOT, ".env"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;

    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnvironment();

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function handleJevDecision(request, response) {
  let body;
  try {
    body = parseJevBody(await readBody(request));
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  const result = await proxyJevDecision(body, process.env.TYPESAFE_API_KEY);
  sendJson(response, result.status, result.body);
}

async function serveStatic(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const isPublicPath =
    PUBLIC_ROOT_FILES.has(relativePath) ||
    PUBLIC_DIRECTORIES.some((directory) => relativePath.startsWith(directory));
  if (!isPublicPath || relativePath.split("/").some((part) => part.startsWith("."))) {
    response.writeHead(404).end("Not found");
    return;
  }

  const filePath = resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw Object.assign(new Error("Not found"), { code: "ENOENT" });
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    if (request.method === "HEAD") response.end();
    else response.end(file);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500).end(
      error.code === "ENOENT" ? "Not found" : "Server error"
    );
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/jev/status") {
    sendJson(response, 200, jevStatus(process.env.TYPESAFE_API_KEY));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/jev/decision") {
    await handleJevDecision(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD, POST" }).end("Method not allowed");
    return;
  }

  await serveStatic(request, response, url);
});

server.listen(PORT, HOST, () => {
  const jevStatus = process.env.TYPESAFE_API_KEY ? "configured" : "not configured";
  const displayHost = ["127.0.0.1", "::1"].includes(HOST) ? "localhost" : HOST;
  console.log(`Jev NPC prototype: http://${displayHost}:${PORT} (Jev ${jevStatus})`);
});
