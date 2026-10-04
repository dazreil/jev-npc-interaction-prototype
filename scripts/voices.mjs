// Records each character's lines in their own voice, once (Kokoro TTS on fal).
//
//   GAME_VAULT=silver-edit node scripts/voices.mjs            record what is missing
//   GAME_VAULT=silver-edit node scripts/voices.mjs --dry-run  count it; call nothing, spend nothing
//   ... --character Arthur                                    only that character
//
// A character records when their note sets `voice:` (a Kokoro voice, such as
// am_michael) and optionally `voiceSpeed:` (default 1). With
// `voiceService: elevenlabs`, `voice:` is an ElevenLabs voice id instead
// (with accents, such as a gentle New England one), and `voiceModel:` picks
// its model (eleven_multilingual_v2, the default, or eleven_flash_v2_5). Every authored line is
// recorded once and saved beside the character as
// characters/<name>/voice/<name>-<hash>.mp3, listed in <name>-voice.json. The
// game plays the recording when it shows that exact line; lines that change
// at play time (the player's name) and narrated lines use the live voice.
// Changing a line, the voice or the speed records just that line again;
// recordings no line uses any more are deleted. Needs FAL_KEY in .env and ffmpeg.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildCharacter } from "../js/engine/character-data.js";
import { VAULT_DIR, compileVault } from "./compile-vault.mjs";
import { ELEVENLABS_MODELS, elevenLabsSpeech } from "../lib/services.mjs";
import { readModels } from "../lib/library.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const MODEL = "fal-ai/kokoro/american-english";
const PRICE_PER_1000 = 0.02;
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = process.argv.includes("--character") ? process.argv[process.argv.indexOf("--character") + 1] : null;
const run = promisify(execFile);

async function falKey() {
  const env = await readFile(new URL("../.env", import.meta.url), "utf8").catch(() => "");
  const key = env.match(/^FAL_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("FAL_KEY is missing from .env");
  return key;
}

/** Every line a character speaks as written (not narrated, no play-time tokens). */
function spokenLines(vault, id) {
  const { dialogue, tree } = buildCharacter(vault, id);
  const narrated = new Set();
  for (const node of Object.values(vault.trees?.[tree]?.nodes ?? {})) {
    for (const command of node.commands ?? node.script ?? []) {
      const text = typeof command === "string" ? command : `${command.kind ?? ""} ${command.value ?? command.key ?? ""}`;
      const match = String(text).match(/^narrate\s+(\S+)/);
      if (match) narrated.add(match[1]);
    }
  }
  const lines = [dialogue.opening, dialogue.nameAcknowledgement];
  for (const tones of Object.values(dialogue.actions ?? {})) for (const list of Object.values(tones)) lines.push(...[].concat(list));
  for (const [key, list] of Object.entries(dialogue.lines ?? {})) if (!narrated.has(key)) lines.push(...[].concat(list));
  return [...new Set(lines.filter((line) => typeof line === "string").map((line) => line.trim()))].filter((line) => line && !/\[\[|\{[a-zA-Z]/.test(line));
}

/**
 * One line from a fal voice model: Kokoro, or a voice model from the game's
 * library (its endpoint, and the names of its text and voice fields).
 */
async function record(key, text, voice, speed, out, added = null) {
  const input = added
    ? { [added.textField ?? "text"]: text, ...(voice ? { [added.voiceField ?? "voice"]: voice } : {}), ...(added.params ?? {}) }
    : { prompt: text, voice, speed };
  const response = await fetch(`https://fal.run/${added?.endpoint ?? MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(json).slice(0, 200)}`);
  const audio = json.audio?.url ?? json.audio_url?.url ?? json.audio_url ?? json.url;
  if (!audio) throw new Error("the voice model returned no audio");
  const wav = `${out}.download`;
  await writeFile(wav, Buffer.from(await (await fetch(audio)).arrayBuffer()));
  // A small mono MP3 is plenty for a voice, and keeps the vault light.
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "64k", out]);
  await rm(wav);
}

const vault = await compileVault();
const characters = Object.entries(vault.notes).filter(([id, note]) => note.type === "character" && note.props.voice && (!ONLY || id === ONLY));
if (!characters.length) console.log(ONLY ? `${ONLY} has no voice: set one in their note.` : "No character sets a voice: add `voice: am_michael` to a character note.");
const needsFal = characters.some(([, note]) => note.props.voiceService !== "elevenlabs");
const key = DRY_RUN || !needsFal ? null : await falKey();
let spent = 0;
for (const [id, note] of characters) {
  const voice = String(note.props.voice);
  const speed = Number(note.props.voiceSpeed) || 1;
  const eleven = note.props.voiceService === "elevenlabs";
  // A voice model from the game's library (Cmd+E → Library → Models, kind voice).
  const added = readModels(VAULT_DIR).find((model) => model.kind === "voice" && model.id === note.props.voiceService) ?? null;
  const voiceModel = eleven ? String(note.props.voiceModel ?? "eleven_multilingual_v2") : added ? added.id : "kokoro";
  const price = eleven ? ELEVENLABS_MODELS[voiceModel] ?? 0.1 : added ? Number(added.cost ?? 0) : PRICE_PER_1000;
  const slug = id.toLowerCase();
  const folder = join(VAULT_DIR, dirname(note.path), "voice");
  const manifestPath = join(folder, `${slug}-voice.json`);
  const lines = spokenLines(vault, id);
  const wanted = Object.fromEntries(lines.map((text) => [text, `${slug}-${createHash("sha1").update(eleven || added ? `${eleven ? "elevenlabs" : added.id}|${voiceModel}|${voice}|${text}` : `${voice}|${speed}|${text}`).digest("hex").slice(0, 10)}.mp3`]));
  const missing = Object.entries(wanted).filter(([, file]) => !existsSync(join(folder, file)));
  const characters = missing.reduce((count, [text]) => count + text.length, 0);
  console.log(`${id} (${eleven ? `ElevenLabs ${voiceModel} ${voice}` : `${voice}, speed ${speed}`}): ${lines.length} lines, ${missing.length} to record, about $${((characters / 1000) * price).toFixed(3)}`);
  if (DRY_RUN) continue;
  await mkdir(folder, { recursive: true });
  for (const [text, file] of missing) {
    if (eleven) await writeFile(join(folder, file), await elevenLabsSpeech(ROOT, { text, voice, model: voiceModel }));
    else await record(key, text, voice, speed, join(folder, file), added);
    spent += (text.length / 1000) * price;
    process.stdout.write(".");
  }
  if (missing.length) process.stdout.write("\n");
  await writeFile(manifestPath, JSON.stringify({ character: id, service: eleven ? "elevenlabs" : "kokoro", voice, speed, lines: wanted }, null, "\t") + "\n");
  // Recordings of lines that changed or went away.
  const keep = new Set(Object.values(wanted));
  for (const file of await readdir(folder)) if (file.endsWith(".mp3") && !keep.has(file)) await rm(join(folder, file));
}
if (!DRY_RUN) console.log(`Done. About $${spent.toFixed(3)} spent.`);
