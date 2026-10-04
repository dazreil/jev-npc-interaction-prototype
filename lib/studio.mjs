// The studio: what the Characters workspace asks the app to do. The desktop
// app (desktop/main.mjs) and the workbench (scripts/workbench.mjs) both call
// these, so the game page never touches files or keys itself.
//
//   newCharacter   makes a character from the template (scripts/new-thing.mjs)
//   runCard        makes one art card (scripts/assets.mjs --card), or redoes
//                  only its finish (--refinish, free)
//   importPicture  puts a picture made by hand or elsewhere in as a card's
//                  result: it becomes the card's clean original, then gets the
//                  card's finish (crunch and clean twin) like a made one
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readRecipes } from "./asset-canvas.mjs";

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PICTURE = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;

/** A path inside the vault, or an error. */
function inside(vaultDir, path) {
  const full = normalize(join(vaultDir, String(path ?? "")));
  const rel = relative(vaultDir, full);
  if (!path || isAbsolute(String(path)) || rel.startsWith("..") || rel.split(/[\\/]/).some((part) => part.startsWith("."))) throw new Error(`Not a vault file: ${path}`);
  return full;
}

export async function newCharacter(vaultDir, { name, description }) {
  const { newThing } = await import("../scripts/new-thing.mjs");
  return newThing("character", name, description, vaultDir);
}

/** Runs one card with the asset runner. Making costs money (the page asks first); --refinish is free. */
export async function runCard(vaultDir, { canvas, card, refinish = false }) {
  inside(vaultDir, canvas);
  if (!/^[\w.-]+$/.test(String(card))) throw new Error(`Not a card name: ${card}`);
  const args = [join(ROOT, "scripts", "assets.mjs"), canvas, "--card", card, ...(refinish ? ["--refinish"] : [])];
  try {
    const { stdout, stderr } = await run(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, GAME_VAULT: vaultDir, ELECTRON_RUN_AS_NODE: "1" },
      timeout: 15 * 60 * 1000,
      maxBuffer: 16 * 1024 * 1024
    });
    const log = `${stdout}${stderr}`.replace(/\s*(IN_QUEUE|IN_PROGRESS)\s*/g, " ").trim();
    const failed = /\berror\b/i.test(log.split("\n").at(-1) ?? "");
    return { ok: !failed, log };
  } catch (error) {
    return { ok: false, log: `${error.stdout ?? ""}${error.stderr ?? ""}`.trim() || error.message };
  }
}

/**
 * A picture from your computer as a card's result. The card is an image or
 * edit card on `canvas`; with `create`, a new image card of that name is
 * made first. `data` is the file's bytes, base64.
 */
export async function importPicture(vaultDir, { canvas, card, fileName, data, create = false }) {
  const canvasFile = inside(vaultDir, canvas);
  if (!/^[\w.-]+$/.test(String(card))) throw new Error(`Not a card name: ${card}`);
  if (!PICTURE.test(String(fileName ?? ""))) throw new Error("Import a picture (PNG, JPEG, WebP, GIF, BMP or TIFF).");
  const json = JSON.parse(await readFile(canvasFile, "utf8"));
  let recipe = readRecipes(json).find((item) => item.name === card);
  if (!recipe && create) {
    const right = Math.max(0, ...json.nodes.map((node) => node.x + node.width));
    json.nodes.push({ id: `${card}-${Date.now().toString(36)}`, type: "text", x: right + 200, y: 0, width: 560, height: 220, text: `## ${card}\nimage\nstatus: done\n# Imported: made by hand or elsewhere (${String(fileName).replace(/[\r\n]/g, " ")}).\n` });
    await writeFile(canvasFile, JSON.stringify(json, null, "\t"));
    recipe = readRecipes(json).find((item) => item.name === card);
  }
  if (!recipe) throw new Error(`No card ${card} on ${canvas}`);
  if (!["image", "edit"].includes(recipe.kind)) throw new Error(`${card} is a ${recipe.kind} card; import into an image or edit card`);
  // The card's clean original, where a made picture's would be.
  const source = join(dirname(canvasFile), "art", card, "_source", `${card}.source.png`);
  await mkdir(dirname(source), { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "import-"));
  try {
    const raw = join(work, `in${extname(fileName).toLowerCase()}`);
    await writeFile(raw, Buffer.from(String(data), "base64"));
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-frames:v", "1", source]);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return runCard(vaultDir, { canvas, card, refinish: true });
}

// ------------------------------------------------------------------ keys and services

/** Which services have a key: names and "set" only, never the key. */
export async function keys() {
  const { keyStatus } = await import("./services.mjs");
  return { services: keyStatus(ROOT) };
}

/** Sets, or with an empty key removes, a service's key in .env. */
export async function setKey(_vaultDir, { service, key }) {
  const { setKey: write, keyStatus } = await import("./services.mjs");
  write(ROOT, service, key);
  return { services: keyStatus(ROOT) };
}

/** A free call that checks a service's key works. */
export async function testKey(_vaultDir, { service }) {
  const { testKey: check } = await import("./services.mjs");
  return check(ROOT, service);
}

/** The voices in the ElevenLabs account, for the Details voice list. */
export async function voices() {
  const { elevenLabsVoices } = await import("./services.mjs");
  return { voices: await elevenLabsVoices(ROOT) };
}

/** Saves the game's library: models you added and LoRAs (library/*.json). */
export async function saveLibrary(vaultDir, { models, loras }) {
  const { saveLibrary: save } = await import("./library.mjs");
  return save(vaultDir, { models, loras });
}

/** Every studio action, by name, for the app and the workbench. */
export const ACTIONS = { new: newCharacter, run: runCard, import: importPicture, keys, setKey, testKey, voices, saveLibrary };
