// Renders the game's music: each music/<name>.strudel pattern becomes a
// seamless loop, music/<name>.ogg, that screens play.
//
//   GAME_VAULT=silver-edit node scripts/music.mjs            render what changed
//   GAME_VAULT=silver-edit node scripts/music.mjs --all      render every track
//   ... --track dream                                        only that track
//
// Strudel (strudel.cc) is only used here, on your computer, to make the audio
// files: the game plays the files and never contains Strudel itself (Strudel
// and the renderer, strudel-render, are AGPL; the music you make is yours).
// Free: no AI call. Needs Chrome (or it fetches its own) and ffmpeg.
//
// A pattern sets its loop length in a comment: `// @loop 8` (cycles; the
// default is 8). To loop without a gap, two loops are rendered and the second
// kept, so the reverb and echo from the end carry into the start.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { VAULT_DIR } from "./compile-vault.mjs";

const run = promisify(execFile);
const ALL = process.argv.includes("--all");
const ONLY = process.argv.includes("--track") ? process.argv[process.argv.indexOf("--track") + 1] : null;
const folder = join(VAULT_DIR, "music");
const manifestPath = join(folder, "music.json");

const seconds = async (file) => Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file])).stdout);
/** The pattern's tempo, from setcps(…) or setcpm(…), in cycles per second (Strudel's default is 0.5). */
function cyclesPerSecond(code) {
  const cps = code.match(/setcps\(\s*([\d.]+)\s*\)/);
  if (cps) return Number(cps[1]);
  const cpm = code.match(/setcpm\(\s*([\d.]+)\s*\)/);
  return cpm ? Number(cpm[1]) / 60 : 0.5;
}

if (!existsSync(folder)) {
  console.log(`No music folder: make ${folder} and put a pattern in it, such as dream.strudel.`);
  process.exit(0);
}
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : {};
const tracks = (await readdir(folder)).filter((file) => file.endsWith(".strudel")).map((file) => file.replace(/\.strudel$/, "")).filter((name) => !ONLY || name === ONLY);
if (!tracks.length) console.log(ONLY ? `No track ${ONLY}.strudel in ${folder}.` : "No .strudel patterns to render.");

for (const name of tracks) {
  const code = await readFile(join(folder, `${name}.strudel`), "utf8");
  const hash = createHash("sha1").update(code).digest("hex").slice(0, 12);
  const out = join(folder, `${name}.ogg`);
  if (!ALL && manifest[name]?.hash === hash && existsSync(out)) {
    console.log(`${name}: unchanged`);
    continue;
  }
  const loop = Number(code.match(/@loop\s+(\d+)/)?.[1] ?? 8);
  const length = loop / cyclesPerSecond(code);
  const work = await mkdtemp(join(tmpdir(), "music-"));
  try {
    const pattern = join(work, `${name}.js`);
    await copyFile(join(folder, `${name}.strudel`), pattern);
    const wav = join(work, "two-loops.wav");
    console.log(`${name}: rendering ${loop} cycles twice (${(length * 2).toFixed(1)} s)…`);
    await run("npx", ["--yes", "strudel-render", pattern, "-o", wav, "--start", "0", "--end", String(loop * 2), "--normalize", "-1"], { maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000 });
    // The second loop, exactly one loop long: it starts with the first one's tail.
    await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(length), "-t", String(length), "-i", wav, "-c:a", "libvorbis", "-q:a", "5", out]);
    manifest[name] = { hash, loop, seconds: Number((await seconds(out)).toFixed(3)) };
    console.log(`${name}: ${manifest[name].seconds} s loop → music/${name}.ogg`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
await writeFile(manifestPath, JSON.stringify(manifest, null, "\t") + "\n");
