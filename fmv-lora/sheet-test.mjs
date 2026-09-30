// Character-sheet test (2026-09-30): can an edit model make new shots of the
// same Arthur on the same green screen? Three shots each from FLUX.2 [dev]
// edit and Qwen Image Edit 2511, all from Arthur's clean hero picture, then
// keyed and pasted into the guard booth (free) to see if they are usable.
//
//   node fmv-lora/sheet-test.mjs --dry-run    list the 6 requests, spend nothing
//   node fmv-lora/sheet-test.mjs              generate (about $0.14)
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv } from "../lib/env.mjs";
import { download, runFal } from "../lib/fal.mjs";
import { chooseParameters, composite, key, seeded } from "../lib/composite.mjs";
import { crunch, mediaSize } from "../lib/limited-animation.mjs";
import { contactSheet } from "./pilot-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(HERE, "sheet-test");
const MANIFEST = join(HERE, "manifest.jsonl");
const DRY_RUN = process.argv.includes("--dry-run");
const GENERATED = join(ROOT, "game", "assets", "generated");
const HERO = join(GENERATED, "guard-actor", "_source", "guard-actor.source.png");
const BOOTH = join(GENERATED, "guard-booth", "_source", "guard-booth.source.png");

// Price notes (fal, 2026-09-30): FLUX.2 [dev] edit $0.012 per megapixel of
// input (resized to 1 MP) and output; Qwen Image Edit 2511 $0.03 per megapixel.
const MODELS = {
  flux2: { endpoint: "fal-ai/flux-2/edit", estimate: (mp) => 0.012 * (1 + mp) },
  qwen: { endpoint: "fal-ai/qwen-image-edit-2511", estimate: (mp) => 0.03 * mp }
};
const KEEP =
  "Keep the same man: same face, grey slicked-back hair and grey mustache, same black security uniform shirt with epaulettes and silver badge. Keep the same flat, evenly lit chroma-key green screen background and the same lighting and camera quality.";
const SHOTS = {
  angry: `${KEEP} He is now angry, shouting into the handheld intercom handset, frowning with narrowed eyes. Waist-up, facing the camera.`,
  "arms-crossed": `${KEEP} He now stands with his arms crossed over his chest, the handset clipped to his belt, stern and unimpressed, looking straight at the camera. Waist-up.`,
  "three-quarter": `${KEEP} He is now seen in a three-quarter view, body turned 45 degrees to his right, looking off-camera, holding the handset down at his side. Waist-up.`
};

if (!existsSync(HERO) || !existsSync(BOOTH)) throw new Error("run the guard-actor and guard-booth cards first");
const key_ = readEnv(ROOT, "FAL_KEY");
if (!DRY_RUN && !key_) throw new Error("FAL_KEY is not set in .env");
for (const folder of ["raw", "keyed", "composites"]) await mkdir(join(OUT, folder), { recursive: true });
const hero = DRY_RUN ? "data:… (guard-actor.source.png)" : `data:image/png;base64,${(await readFile(HERO)).toString("base64")}`;
// Same placement as the night-guard card, so shots can be compared fairly.
const placement = { ...chooseParameters(seeded(3), { shot: "waist-up" }), heightShare: 0.92, xCentre: 0.45 };

let spent = 0;
async function pasteIntoBooth(picture, name) {
  const keyed = join(OUT, "keyed", `${name}.png`);
  await key(picture, keyed);
  const pasted = join(OUT, "composites", `${name}.png`);
  await composite(BOOTH, keyed, pasted, placement);
  await crunch(pasted, pasted, { factor: 4, quality: 50 });
  return pasted;
}

const rows = [];
if (!DRY_RUN) {
  const heroComp = await pasteIntoBooth(HERO, "hero");
  rows.push({ files: { a: { path: HERO, label: "HERO (Krea 2)" }, b: { path: heroComp, label: "HERO in booth" } } });
}
for (const [shot, prompt] of Object.entries(SHOTS)) {
  const row = { files: {} };
  for (const [model, { endpoint, estimate }] of Object.entries(MODELS)) {
    const input = { prompt, image_urls: [hero], image_size: "landscape_4_3", seed: 7, num_images: 1, output_format: "png", enable_safety_checker: true };
    const raw = join(OUT, "raw", `${shot}-${model}.png`);
    if (DRY_RUN) {
      console.log(`[${shot} ${model}] ${endpoint}\n  ${prompt}`);
      continue;
    }
    if (!existsSync(raw)) {
      process.stdout.write(`[${shot} ${model}] generating… `);
      const output = await runFal(endpoint, input, { key: key_ });
      await download(output.images[0].url, raw);
      const { width, height } = await mediaSize(raw);
      const cost = Number(estimate((width * height) / 1e6).toFixed(4));
      spent += cost;
      await appendFile(MANIFEST, `${JSON.stringify({ id: `sheet-test-${shot}-${model}`, at: new Date().toISOString(), endpoint, input: { ...input, image_urls: [relative(ROOT, HERO)] }, cost_estimate_usd: cost, output: relative(HERE, raw) })}\n`);
      console.log(`${width}x${height}, ~$${cost}`);
    }
    let pasted;
    try {
      pasted = await pasteIntoBooth(raw, `${shot}-${model}`);
    } catch (error) {
      console.log(`  keying failed: ${error.message}`);
    }
    row.files[model] = { path: raw, label: `${shot} ${model.toUpperCase()}` };
    row.files[`${model}-comp`] = pasted ? { path: pasted, label: `${shot} ${model.toUpperCase()} in booth` } : { path: raw, label: "KEY FAILED" };
  }
  rows.push(row);
}
if (!DRY_RUN) {
  // Row 1: hero | hero in booth; then per shot: flux | qwen | flux in booth | qwen in booth.
  const sheetRows = rows.map((row) =>
    row.files.a ? { files: { "#0": row.files.a, "#1": row.files.b, "#2": row.files.a, "#3": row.files.b } } : { files: { "#0": row.files.flux2, "#1": row.files.qwen, "#2": row.files["flux2-comp"], "#3": row.files["qwen-comp"] } }
  );
  await contactSheet(sheetRows, ["#0", "#1", "#2", "#3"], join(OUT, "contact-sheet.png"));
  console.log(`Spent about $${spent.toFixed(3)}. Contact sheet: fmv-lora/sheet-test/contact-sheet.png`);
}
