// Composite batch 1 (2026-09-30): 8 Z-Image rooms + 12 Krea 2 chroma-key
// actors → 20 composites, the Option B look. No Flux anywhere in the chain,
// so these are safe to train on or to use as style references.
//
//   node fmv-lora/batch.mjs --dry-run    list the 20 requests, spend nothing
//   node fmv-lora/batch.mjs              generate (about $0.11) and composite
//
// Raw pictures are never overwritten; a rerun skips what exists and only
// redoes the free keying and compositing.
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv } from "../lib/env.mjs";
import { download, runFal } from "../lib/fal.mjs";
import { crunch, mediaSize } from "../lib/limited-animation.mjs";
import { chooseParameters, composite, key, seeded } from "../lib/composite.mjs";
import { contactSheet } from "./pilot-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(HERE, "composites", "batch1");
const MANIFEST = join(HERE, "manifest.jsonl");
const DRY_RUN = process.argv.includes("--dry-run");
const random = seeded(2026_0930);
const pick = (list) => list[Math.floor(random() * list.length)];

// ---------------------------------------------------------------- rooms
// The Z-Image "set" prompt that made pilot 001. Lighting is written as gel
// colours (no "moonlight": it drew moons), and signs are asked away.
const SET_STYLE =
  "A still frame from a 1995 CD-ROM computer game: a pre-rendered 3D CGI background, early 1990s 3D rendering with flat shading, low-polygon models and simple textures. Scene: ";
const ROOMS = [
  ["hackers", "an empty cluttered teenage bedroom full of CRT monitors, posters with abstract shapes and tangled cables", "saturated magenta and cyan gel lights"],
  ["hackers", "an empty garish cyberspace set with glowing toy-like wireframe towers and pastel gel lighting", "smoke-machine haze with colored rim lights"],
  ["cassette", "an empty mainframe room with reel-to-reel tape drives and wall-sized blinking panels", "harsh flat fluorescent lighting"],
  ["cassette", "an empty cramped control room with beige plastic consoles, toggle switches and amber monochrome CRT screens", "amber CRT glow with deep shadows"],
  ["dystopia", "an empty surveillance control room with a wall of mismatched CRT monitors showing static", "sickly overhead tube lighting"],
  ["dystopia", "an empty dystopian game-show studio with overbright neon shapes and plastic set pieces", "flat studio lighting with garish neon"],
  ["cyberpunk", "an empty rainy neon street with wet pavement, steam vents and blank glowing signs", "cool blue gel light with a magenta rim light"],
  ["cyberpunk", "an empty back-alley clinic with buzzing tube lights and a reclined chair", "green-tinted tube lighting with heavy shadows"]
];
const roomPrompt = ([, setting, light]) => `${SET_STYLE}${setting}, no people, ${light}, no text or lettering.`;

// ---------------------------------------------------------------- actors
// From the spec's prompt pools. Wardrobe avoids green and blue so it keys.
const PEOPLE = [
  "a man in his 40s with a thick mustache", "a woman in her 30s with a permed bob", "an older man with gray hair and round glasses",
  "a young man with a bleached buzzcut", "a Black woman in her 20s with box braids", "a stern woman in her 50s with short silver hair",
  "a South Asian man in his 30s with a goatee", "a heavyset man in his 50s with a beard", "an East Asian woman in her 30s with a sleek ponytail",
  "a Latina woman in her 40s with big curly hair", "a woman in her 20s with a shaved undercut and dyed pink hair", "a Black man in his 40s with a shaved head"
];
const WARDROBE = [
  "a silver metallic jumpsuit", "a black vinyl trench coat and mirrored sunglasses", "a red leather jacket over a black tee",
  "a white lab coat and thick glasses", "a gold lame jacket with huge shoulder pads", "an orange jumpsuit with a utility belt",
  "a magenta windbreaker with LED goggles on the forehead", "a gray corporate suit with a cheap tie", "a black tactical vest and plastic helmet",
  "a pink holographic-look raincoat", "a black turtleneck and a silver chain", "a yellow hazard suit with the hood down"
];
const POSES = [
  "pointing at empty space as if at a giant hologram", "reaching toward something invisible", "looking up at something enormous off-screen",
  "arms crossed, glaring at the camera", "hands raised as if typing on an invisible keyboard", "gesturing at an invisible map",
  "holding a chunky prop scanner out in front", "leaning forward as if peering into an unseen monitor", "standing rigidly at attention"
];
const ACTING = [
  "stiff posture, eyes slightly off-camera", "over-emphatic expression, wide-eyed", "deadpan line-reading face, mouth slightly open",
  "forced smile that doesn't reach the eyes", "theatrical gesture, hand raised awkwardly", "wooden, unconvincing serious look"
];
const ACTOR_STYLE = "A 1995 video capture of a live-action actor filmed for a CD-ROM game on a chroma-key stage. Scene: ";

function actorPrompt(index) {
  const screen = index % 2 === 0 ? "green" : "blue";
  const shot = index % 3 === 2 ? "waist-up" : "full";
  const shotText = shot === "full" ? "a full-body shot" : "a waist-up shot";
  const floor = shot === "full" ? ` with a matching ${screen} floor` : "";
  const colour = screen === "green" ? "pure green #00FF00" : "pure blue #0000FF";
  const prompt = `${ACTOR_STYLE}${shotText} of ${PEOPLE[index]} in ${WARDROBE[index]}, ${pick(POSES)}, ${pick(ACTING)}, standing in front of a solid bright chroma-key ${screen} screen${floor}, solid ${colour} background, evenly lit.`;
  return { screen, shot, prompt };
}

// ---------------------------------------------------------------- generate
const key_ = readEnv(ROOT, "FAL_KEY");
if (!DRY_RUN && !key_) throw new Error("FAL_KEY is not set in .env");
for (const folder of ["rooms", "actors", "keyed", "composites", "crunched"]) await mkdir(join(OUT, folder), { recursive: true });
let spent = 0;

async function generate(id, endpoint, pricePerMp, input, file, meta) {
  if (DRY_RUN) {
    console.log(`[${id}] ${endpoint}\n  ${input.prompt}`);
    return;
  }
  if (existsSync(file)) return;
  process.stdout.write(`[${id}] generating… `);
  const output = await runFal(endpoint, input, { key: key_ });
  await download(output.images[0].url, file);
  const { width, height } = await mediaSize(file);
  const cost = Number((((width * height) / 1e6) * pricePerMp).toFixed(4));
  spent += cost;
  await appendFile(MANIFEST, `${JSON.stringify({ id: `batch1-${id}`, at: new Date().toISOString(), endpoint, input, ...meta, cost_estimate_usd: cost, output: relative(HERE, file) })}\n`);
  console.log(`${width}x${height}, ~$${cost}`);
}

const rooms = ROOMS.map((room, index) => ({ id: `room-${String(index + 1).padStart(2, "0")}`, genre: room[0], file: join(OUT, "rooms", `room-${String(index + 1).padStart(2, "0")}.png`), prompt: roomPrompt(room), seed: 1000 + index }));
const actors = PEOPLE.map((_, index) => ({ id: `actor-${String(index + 1).padStart(2, "0")}`, file: join(OUT, "actors", `actor-${String(index + 1).padStart(2, "0")}.png`), seed: 2000 + index, ...actorPrompt(index) }));

for (const room of rooms) {
  await generate(room.id, "fal-ai/z-image/turbo", 0.005, { prompt: room.prompt, seed: room.seed, image_size: "landscape_4_3", num_inference_steps: 8, output_format: "png", enable_safety_checker: true }, room.file, { model: "z-image-turbo", kind: "room", genre: room.genre });
}
for (const actor of actors) {
  await generate(actor.id, "fal-ai/krea-2/turbo", 0.008, { prompt: actor.prompt, seed: actor.seed, image_size: "landscape_4_3", output_format: "png", enable_safety_checker: true }, actor.file, { model: "krea-2-turbo", kind: "actor", screen: actor.screen, shot: actor.shot });
}
if (DRY_RUN) process.exit(0);
console.log(`Generation spent about $${spent.toFixed(3)} this run.`);

// ---------------------------------------------------------------- composite
const keyed = [];
for (const actor of actors) {
  const out = join(OUT, "keyed", `${actor.id}.png`);
  try {
    const { screen, box } = await key(actor.file, out);
    keyed.push({ ...actor, keyed: out });
    console.log(`[${actor.id}] keyed off ${screen.screen} ${screen.hex}, ${box.width}x${box.height}`);
  } catch (error) {
    console.log(`[${actor.id}] keying failed: ${error.message}`);
  }
}

// Each actor once over a room in turn, then 8 of them a second time over a
// different room: 20 composites, no actor more than twice.
const plan = [
  ...keyed.map((actor, index) => ({ actor, room: rooms[index % rooms.length] })),
  ...keyed.slice(0, 8).map((actor, index) => ({ actor, room: rooms[(index + 3) % rooms.length] }))
];
const rows = [];
const log = [];
for (const [index, { actor, room }] of plan.entries()) {
  const id = `c${String(index + 1).padStart(2, "0")}`;
  const parameters = chooseParameters(seeded(3000 + index), { shot: actor.shot });
  const file = join(OUT, "composites", `${id}-${actor.id}-on-${room.id}.png`);
  const used = await composite(room.file, actor.keyed, file, parameters);
  const crunched = join(OUT, "crunched", `${id}.png`);
  await crunch(file, crunched, { factor: 4, quality: 50 });
  log.push({ id, actor: actor.id, room: room.id, genre: room.genre, screen: actor.screen, shot: actor.shot, parameters: used, file: relative(HERE, file) });
  rows.push({ path: crunched, label: `${id} ${actor.id.replace("actor-", "a")} on ${room.id.replace("room-", "r")} ${room.genre}` });
}
await writeFile(join(OUT, "composites.json"), JSON.stringify(log, null, 2));

// Contact sheet: 4 across.
const sheetRows = [];
for (let start = 0; start < rows.length; start += 4) {
  const group = rows.slice(start, start + 4);
  sheetRows.push({ files: Object.fromEntries(group.map((cell, index) => [`#${index}`, cell])) });
}
const columns = ["#0", "#1", "#2", "#3"].filter((column) => sheetRows.every((row) => row.files[column]));
await contactSheet(sheetRows, columns, join(OUT, "contact-sheet.png"));
console.log(`${log.length} composites. Contact sheet: fmv-lora/composites/batch1/contact-sheet.png`);
