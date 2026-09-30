// Krea 2 pilot (2026-09-30): the same 12 prompts on Krea 2 Turbo, plain and
// with three FMV style references, next to the Z-Image "styled" results.
//
//   node fmv-lora/krea-pilot.mjs --dry-run    list the 24 requests, spend nothing
//   node fmv-lora/krea-pilot.mjs              generate (about $0.17)
//   node fmv-lora/krea-pilot.mjs --refs composites
//                                             only the references run, with
//                                             batch-1 composites as references
//                                             (about $0.09); no Flux in the chain
//
// Style references (chosen by the user, "option 1"): the clean originals of
// arthur-fmv and gate-dawn (made with the Flux FMV LoRA) and Z-Image pilot 008
// (bare). Using Flux outputs as a *reference* is not training, which the
// FLUX.1 [dev] licence allows; do not train a LoRA on these Krea outputs.
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readEnv } from "../lib/env.mjs";
import { download, runFal } from "../lib/fal.mjs";
import { crunch, mediaSize } from "../lib/limited-animation.mjs";
import { choosePilot, contactSheet, hasCue, styledV2 } from "./pilot-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const COMPOSITE_REFS = process.argv.includes("composites");
const OUT = join(HERE, COMPOSITE_REFS ? "pilot-krea-composites" : "pilot-krea");
const MANIFEST = join(HERE, "manifest.jsonl");
const DRY_RUN = process.argv.includes("--dry-run");
const run = promisify(execFile);

// Batch-1 composites: Z-Image rooms + Krea 2 actors, clean (not crunched).
const REFERENCES = COMPOSITE_REFS
  ? [
      "fmv-lora/composites/batch1/composites/c03-actor-03-on-room-03.png",
      "fmv-lora/composites/batch1/composites/c06-actor-06-on-room-06.png",
      "fmv-lora/composites/batch1/composites/c10-actor-10-on-room-02.png"
    ]
  : [
      "game/assets/generated/arthur-fmv/_source/arthur-fmv.source.png",
      "game/assets/generated/gate-dawn/_source/gate-dawn.source.png",
      "fmv-lora/pilot/raw/008-bare.png"
    ];
const VARIANTS = COMPOSITE_REFS
  ? { "comp-refs": { endpoint: "fal-ai/krea-2/turbo/style", pricePerMp: 0.01 } }
  : {
      plain: { endpoint: "fal-ai/krea-2/turbo", pricePerMp: 0.008 },
      refs: { endpoint: "fal-ai/krea-2/turbo/style", pricePerMp: 0.01 }
    };

/** A reference as a small JPEG data URI (keeps each request light). */
async function referenceUri(path) {
  const jpeg = join(tmpdir(), `krea-ref-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", join(ROOT, path), "-vf", "scale=768:-2", "-q:v", "3", jpeg]);
  const uri = `data:image/jpeg;base64,${(await readFile(jpeg)).toString("base64")}`;
  await rm(jpeg, { force: true });
  return uri;
}

const entries = JSON.parse(await readFile(join(HERE, "prompts", "fmv-prompts.json"), "utf8"));
const pilot = choosePilot(entries);
const key = readEnv(ROOT, "FAL_KEY");
if (!DRY_RUN && !key) throw new Error("FAL_KEY is not set in .env");
for (const path of REFERENCES) if (!existsSync(join(ROOT, path))) throw new Error(`missing reference ${path}`);
const references = DRY_RUN ? REFERENCES.map((path) => `data:… (${path})`) : await Promise.all(REFERENCES.map(referenceUri));
await mkdir(join(OUT, "raw"), { recursive: true });
await mkdir(join(OUT, "crunched"), { recursive: true });

let spent = 0;
const rows = [];
for (const entry of pilot) {
  const prompt = styledV2(entry);
  const row = {
    id: entry.id,
    kind: entry.kind,
    cue: hasCue(entry),
    files: {
      "z-image": join(HERE, "pilot", "crunched", `${entry.id}-styled.png`),
      ...(COMPOSITE_REFS ? { "flux-refs": join(HERE, "pilot-krea", "crunched", `${entry.id}-refs.png`) } : {})
    }
  };
  for (const [variant, { endpoint, pricePerMp }] of Object.entries(VARIANTS)) {
    const input = {
      prompt,
      seed: entry.seed,
      image_size: "landscape_4_3",
      output_format: "png",
      enable_safety_checker: true,
      ...(variant.endsWith("refs") ? { reference_image_urls: references, style_scale: 1 } : {})
    };
    const raw = join(OUT, "raw", `${entry.id}-${variant}.png`);
    if (DRY_RUN) {
      console.log(`\n[${entry.id} ${entry.kind} ${variant}] ${endpoint}\n${prompt}`);
      continue;
    }
    if (!existsSync(raw)) {
      process.stdout.write(`[${entry.id} ${variant}] generating… `);
      const output = await runFal(endpoint, input, { key });
      await download(output.images[0].url, raw);
      const { width, height } = await mediaSize(raw);
      const cost = Number((((width * height) / 1e6) * pricePerMp).toFixed(4));
      spent += cost;
      const logged = { ...input, ...(input.reference_image_urls ? { reference_image_urls: REFERENCES } : {}) };
      await appendFile(
        MANIFEST,
        `${JSON.stringify({ id: `krea-pilot-${entry.id}-${variant}`, references: REFERENCES, at: new Date().toISOString(), endpoint, model: "krea-2-turbo", lora: null, input: logged, genre: entry.genre, kind: entry.kind, cost_estimate_usd: cost, output: relative(HERE, raw) })}\n`
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
  const columns = COMPOSITE_REFS ? ["z-image", "flux-refs", "comp-refs"] : ["z-image", "plain", "refs"];
  await contactSheet(rows, columns, join(OUT, "contact-sheet.png"));
  console.log(`\nSpent about $${spent.toFixed(3)} this run. Contact sheet: ${relative(ROOT, join(OUT, "contact-sheet.png"))}`);
}
