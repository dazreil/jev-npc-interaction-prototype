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

const [html, css, app, server] = await Promise.all([
  readFile(resolve(projectRoot, "index.html"), "utf8"),
  readFile(resolve(projectRoot, "styles.css"), "utf8"),
  readFile(resolve(projectRoot, "js/app.js"), "utf8"),
  readFile(resolve(projectRoot, "server.mjs"), "utf8")
]);

const preloadAssets = [...html.matchAll(/<link\s+rel="preload"\s+href="([^"]+)"/g)].map(
  (match) => match[1]
);
const expectedPreloads = [
  "assets/encounter/gate-closed.webp",
  "assets/encounter/arthur-intercom.webp",
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

const talkingPaths = ["talk-a", "talk-b", "talk-c", "talk-d"].map(
  (cue) => PORTRAIT_ASSETS[cue]
);
const talkingStats = await Promise.all(
  talkingPaths.map(async (asset) => ({ asset, size: (await stat(resolve(projectRoot, asset))).size }))
);
const talkingTotal = talkingStats.reduce((total, asset) => total + asset.size, 0);
check(new Set(talkingPaths).size === 4, "Arthur must have four distinct mouth frames");
check(app.includes("activeArthurPortrait.src = src") && app.includes("portraitAnimator.startTalking()"),
  "The intercom must apply and animate Arthur's mouth frames");
check(talkingStats.every(({ size }) => size <= 32 * 1024), "Each mouth frame must remain under 32 KiB");
check(talkingTotal <= 128 * 1024, "Arthur's complete mouth cycle must remain under 128 KiB");
check(talkingPaths.every((asset) => asset.endsWith(".webp")), "Mouth frames must use WebP release assets");

check(html.includes('id="credits-dialog"'), "Credits dialog is missing");
check(html.includes('id="debug-dialog"'), "Developer diagnostics dialog is missing");
check(html.includes('id="debug-export"'), "Conversation log export control is missing");
check(html.includes('id="gate-feed"'), "Exterior gate feed is missing");
check(html.includes('id="intercom-hotspot"'), "Intercom hotspot is missing");
check(html.includes('id="walk-hotspot"'), "Walk-through hotspot is missing");
check(html.includes('id="id-card-button"'), "ID-card action is missing");
check(html.includes('id="gate-animation-status"'), "Gate animation status is missing");
check(server.includes('".webp": "image/webp"'), "Server must send the WebP MIME type");
check(server.includes('process.env.HOST || "127.0.0.1"'), "Server must allow a deployment host binding");
check(
  html.includes("assets/encounter/gate-closed.webp"),
  "The initial exterior feed must use the closed-gate frame"
);
check(
  html.includes("assets/encounter/gate-open.webp") && app.includes("playGateOpening()"),
  "Entry approval must reveal the open gate frame"
);

await Promise.all([
  requireFile("DEPLOYMENT.md"),
  requireFile("Dockerfile"),
  requireFile("THIRD_PARTY_NOTICES.md"),
  requireFile("assets/fonts/OFL.txt"),
  requireFile("encounter.css"),
  requireFile("assets/encounter/gate-closed.webp"),
  requireFile("assets/encounter/gate-open.webp"),
  requireFile("assets/encounter/arthur-intercom.webp"),
  requireFile("assets/encounter/arthur-talk-2.webp"),
  requireFile("assets/encounter/arthur-talk-3.webp"),
  requireFile("assets/encounter/arthur-talk-4.webp"),
  requireFile("assets/gates/gate-closed.webp"),
  requireFile("assets/gates/gate-open.webp"),
  requireFile("assets/gates/gate-opening.webp"),
  requireFile("assets/gates/gate-frame-1.webp"),
  requireFile("assets/gates/gate-frame-2.webp"),
  requireFile("assets/gates/gate-frame-3.webp"),
  requireFile("assets/gates/gate-frame-4.webp")
]);

if (failures.length > 0) {
  console.error("Release audit failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Release audit passed: ${talkingPaths.length} Arthur mouth frames, ` +
      `${Math.round(talkingTotal / 1024)} KiB of portrait art, ${preloadAssets.length} immediate preloads.`
  );
}
