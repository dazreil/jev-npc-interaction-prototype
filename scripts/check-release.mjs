import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PORTRAIT_ASSETS } from "../js/portrait.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function requireFile(relativePath) {
  try {
    await access(resolve(projectRoot, relativePath));
  } catch {
    failures.push(`Missing release file: ${relativePath}`);
  }
}

const [html, css, server] = await Promise.all([
  readFile(resolve(projectRoot, "index.html"), "utf8"),
  readFile(resolve(projectRoot, "styles.css"), "utf8"),
  readFile(resolve(projectRoot, "server.mjs"), "utf8")
]);

const preloadAssets = [...html.matchAll(/<link\s+rel="preload"\s+href="([^"]+)"/g)].map(
  (match) => match[1]
);
const expectedPreloads = [
  "assets/arthur-portrait.jpg",
  "assets/player-shadow.jpg",
  "assets/fonts/VT323-Regular.ttf"
];

check(
  preloadAssets.length === expectedPreloads.length &&
    expectedPreloads.every((asset) => preloadAssets.includes(asset)),
  `Immediate preloads must be limited to ${expectedPreloads.join(", ")}`
);
check(!preloadAssets.some((asset) => asset.includes("arthur-reactions")), "Reaction art must stay lazy-loaded");
check(!preloadAssets.some((asset) => asset.includes("arthur-speech")), "Speech frames must stay lazy-loaded");

const portraitPaths = [...new Set(Object.values(PORTRAIT_ASSETS))];
await Promise.all(portraitPaths.map(requireFile));

const reactionPaths = portraitPaths.filter((asset) => asset.includes("arthur-reactions/"));
const reactionStats = await Promise.all(
  reactionPaths.map(async (asset) => ({ asset, size: (await stat(resolve(projectRoot, asset))).size }))
);
const reactionTotal = reactionStats.reduce((total, asset) => total + asset.size, 0);
check(reactionStats.every(({ size }) => size <= 32 * 1024), "Each reaction portrait must remain under 32 KiB");
check(reactionTotal <= 256 * 1024, "The complete reaction portrait set must remain under 256 KiB");
check(reactionPaths.every((asset) => asset.endsWith(".webp")), "Reaction portraits must use WebP release assets");

check(html.includes('id="credits-dialog"'), "Credits dialog is missing");
check(html.includes('id="debug-dialog"'), "Developer diagnostics dialog is missing");
check(html.includes('id="debug-export"'), "Conversation log export control is missing");
check(css.includes("@keyframes player-idle"), "Player idle animation is missing");
check(
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.player-viewport img[\s\S]*?animation: none/.test(css),
  "Reduced-motion mode must stop the player avatar"
);
check(server.includes('".webp": "image/webp"'), "Server must send the WebP MIME type");
check(server.includes('process.env.HOST || "127.0.0.1"'), "Server must allow a deployment host binding");

await Promise.all([
  requireFile("DEPLOYMENT.md"),
  requireFile("Dockerfile"),
  requireFile("THIRD_PARTY_NOTICES.md"),
  requireFile("assets/fonts/OFL.txt")
]);

if (failures.length > 0) {
  console.error("Phase 15 release audit failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Phase 15 release audit passed: ${portraitPaths.length} portrait assets present, ` +
      `${Math.round(reactionTotal / 1024)} KiB of lazy reaction art, ${preloadAssets.length} immediate preloads.`
  );
}
