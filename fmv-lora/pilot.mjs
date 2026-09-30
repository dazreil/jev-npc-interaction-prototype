// Pilot: can plain Z-Image Turbo (no LoRA) already make 90s FMV stills?
// See SPEC.md §6, changed on 2026-09-30 to test Z-Image first and skip the
// Flux pilot (the FLUX.1 [dev] licence bars training a competing model on
// its outputs, so Option A is dropped).
//
//   node fmv-lora/pilot.mjs --dry-run    list the 24 requests, spend nothing
//   node fmv-lora/pilot.mjs              generate (about $0.10–0.16)
//
// 12 prompts × 2 versions: "bare" (the scene only) and "styled" (the scene
// plus a written FMV style). Raw PNGs are never overwritten; a rerun skips
// what exists. Each picture also gets the crunch finish, since that is what
// the game shows. Every call is logged to manifest.jsonl.
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv } from "../lib/env.mjs";
import { download, runFal } from "../lib/fal.mjs";
import { crunch, mediaSize } from "../lib/limited-animation.mjs";
import { choosePilot, contactSheet, hasCue, promptsV1 as prompts } from "./pilot-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(HERE, "pilot");
const MANIFEST = join(HERE, "manifest.jsonl");
const ENDPOINT = "fal-ai/z-image/turbo";
// fal's Z-Image LoRA page gives the base model as $0.005 per megapixel;
// the plain endpoint page shows no price. Treat this as an estimate.
const PRICE_PER_MP = 0.005;
const DRY_RUN = process.argv.includes("--dry-run");

const entries = JSON.parse(await readFile(join(HERE, "prompts", "fmv-prompts.json"), "utf8"));
const pilot = choosePilot(entries);
const key = readEnv(ROOT, "FAL_KEY");
if (!DRY_RUN && !key) throw new Error("FAL_KEY is not set in .env");
await mkdir(join(OUT, "raw"), { recursive: true });
await mkdir(join(OUT, "crunched"), { recursive: true });

let spent = 0;
const rows = [];
for (const entry of pilot) {
  const row = { id: entry.id, kind: entry.kind, genre: entry.genre, cue: hasCue(entry), files: {} };
  for (const [variant, prompt] of Object.entries(prompts(entry))) {
    const raw = join(OUT, "raw", `${entry.id}-${variant}.png`);
    const input = { prompt, seed: entry.seed, image_size: "landscape_4_3", num_inference_steps: 8, output_format: "png", enable_safety_checker: true };
    if (DRY_RUN) {
      console.log(`\n[${entry.id} ${entry.kind} ${variant}] ${prompt}`);
      continue;
    }
    if (!existsSync(raw)) {
      process.stdout.write(`[${entry.id} ${variant}] generating… `);
      const output = await runFal(ENDPOINT, input, { key });
      await download(output.images[0].url, raw);
      const { width, height } = await mediaSize(raw);
      const cost = Number(((width * height) / 1e6 * PRICE_PER_MP).toFixed(4));
      spent += cost;
      await appendFile(
        MANIFEST,
        `${JSON.stringify({ id: `pilot-${entry.id}-${variant}`, at: new Date().toISOString(), endpoint: ENDPOINT, model: "z-image-turbo", lora: null, input, genre: entry.genre, kind: entry.kind, cost_estimate_usd: cost, output: relative(HERE, raw) })}\n`
      );
      console.log(`${width}x${height}, ~$${cost}`);
    }
    const crunched = join(OUT, "crunched", `${entry.id}-${variant}.png`);
    await crunch(raw, crunched, { factor: 4, quality: 50 });
    row.files[variant] = crunched;
  }
  rows.push(row);
}

if (!DRY_RUN) {
  await rm(join(OUT, "contact-sheet.png"), { force: true });
  await contactSheet(rows, ["bare", "styled"], join(OUT, "contact-sheet.png"));
  console.log(`\nSpent about $${spent.toFixed(3)} this run. Contact sheet: fmv-lora/pilot/contact-sheet.png`);
}
