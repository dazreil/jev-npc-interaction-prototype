# SPEC: A cheaper "90s FMV" image style for the pipeline (Z-Image Turbo LoRA)

Written 2026-09-30. You are an agent with full access to the user's computer and the internet. You have **no memory of the conversation that produced this spec**, so everything you need is here. Prices and model facts were gathered on 2026-09-30 and change often: re-verify anything you are about to spend money on.

## 1. Goal

Replace an expensive Flux.1-dev LoRA image step with a much cheaper modern model (**Z-Image Turbo, "ZIT"**) that produces the same kind of image: a **1990s CD-ROM FMV game still**. To do that we need a **Z-Image Turbo LoRA** trained on a synthetic dataset in the target style.

**Target look** (all four matter, in roughly these weights):
- Tacky dystopia (~30%): cheap chrome, plastic sets, garish neon, surveillance walls of CRTs, propaganda and game-show studios.
- 90s hacker culture, like the film *Hackers* (1995) (~30%): CRT bedrooms, toy-like wireframe "cyberspace", payphones, floppy disks, rave lighting, oversized jackets, LED goggles.
- Cassette futurism (~25%): beige consoles, toggle switches, reel-to-reel tape, amber and green phosphor CRTs, label-maker tags.
- A little cyberpunk (~15%): rainy backlot neon streets, noodle stands, vinyl coats.
- Plus **poor acting** (stiff, wide-eyed, eyes off-camera) and **some actors shot against chroma-key green and blue screens**.

Generating dataset images in any other style is a waste of money. Stay in this style.

## 2. The existing downstream pipeline (DO NOT REBUILD, only use it for evaluation)

The user already does this and is happy with it:
1. Generate an image (this is the step we want to make cheaper).
2. Shrink it (~320 px wide), save as a low-quality JPEG, scale back up with **nearest-neighbour** (no smoothing, no AI upscale).
3. Image-to-video on fal, MiniMax H3 Max Turbo, `minimax/h3-max-turbo/image-to-video`, 480p, 5 seconds (first frame, optional last frame).
4. ffmpeg: drop to a low fps and crush with the Cinepak codec. Reference commands:

```bash
ffmpeg -i clip.mp4 -vf "fps=10,scale=320:240" -c:v cinepak -q:v 8 -pix_fmt rgb24 -c:a pcm_u8 -ar 22050 -ac 1 crushed.avi
ffmpeg -i crushed.avi -vf "scale=960:720:flags=neighbor" -c:v libx264 -pix_fmt yuv420p -c:a aac out.mp4
```
(Check the clip's real aspect ratio before hard-coding 320x240.)

**Important:** the degrade step (2) happens *after* image generation. Therefore the LoRA must be trained on **clean, un-degraded** images so it does not learn the damage twice.

## 3. The existing Flux LoRA (the thing we are replacing)

- Name: "90s PC Game FMV Style [Flux]", Civitai model 940053 (`https://civitai.red/models/940053/90s-pc-game-fmv-style-flux`; the page returned HTTP 403 to an automated fetch, so read it in the user's browser if you need it).
- Base: FLUX.1 dev. Mirror on Hugging Face: `Muapi/90-s-pc-game-fmv-style-flux` (single file `90-s-pc-game-fmv-style-flux.safetensors`, 38.4 MB, licence tag `openrail++`). Likely direct URL: `https://huggingface.co/Muapi/90-s-pc-game-fmv-style-flux/resolve/main/90-s-pc-game-fmv-style-flux.safetensors` (verify).
- **What it was trained on** (from the Civitai page, quoted by the user): "~40 screenshots from Phantasmagoria and Harvester, for a bit of style consistency with contrasting characters/backgrounds." These are **live actors composited over pre-rendered 3D backgrounds**, in **horror / small-town Americana** settings. **Cyberpunk, hacker and cassette-futurism content was never in its training data**, so it may not stretch to our style. This is the main risk of Option A.
- **Trigger** (a fixed caption prefix, the scene goes at the end):
  `The image is a screenshot from a 3D-rendered scene, possibly from a video game or a virtual environment. The scene depicts {SCENE}`
- Hosted on fal as `fal-ai/flux-lora` at **$0.035 per megapixel**, rounded up to the nearest megapixel.

## 4. Target model and prices (verify before spending)

| Option | Price | Notes |
| --- | --- | --- |
| fal `fal-ai/flux-lora` (current) | $0.035 / MP | Flux.1 dev + LoRA |
| fal FLUX.2 Klein 4B base + LoRA | $0.016 / MP | fallback base model |
| **fal Z-Image Turbo + LoRA** (`fal-ai/z-image/turbo/lora`) | **$0.0085 / MP** | preferred; up to 3 stacked LoRAs |
| fal Z-Image Turbo base (`fal-ai/z-image/turbo`) | about the same per MP | |
| WaveSpeed Z-Image Turbo | $0.005 / image; LoRA generation $0.01 / image; LoRA **training $1.25 per 1,000 steps** | |
| Atlas Cloud Z-Image Turbo | $0.005 / image | npm CLI `atlascloud-cli`, MCP `npx -y atlascloud-mcp`; LoRA endpoint not confirmed |
| Runware Z-Image Turbo | about $0.0006 / image | LoRA support and pricing NOT confirmed |
| fal `fal-ai/z-image-trainer` | **price not found, check it** | trainer for Z-Image Turbo |

The user prefers tooling that is callable from **npm / Node** (CLI or MCP). Write scripts as Node ESM (`.mjs`) using `@fal-ai/client` where possible. The user is already set up on fal.

## 5. Ground rules

1. **Ask the user before the first spend**, and propose a budget cap (suggested total: about $15: pilot about $0.50, dataset about $5, training about $3-10, evaluation about $1). Stop and ask if you would exceed it.
2. API keys go in environment variables (`FAL_KEY` etc.). Never print, log or commit them.
3. Log every generation to `manifest.jsonl`: id, endpoint, model, prompt, seed, LoRA URL and scale, cost estimate, output path. The run must be reproducible.
4. Save **raw outputs** (PNG). Never overwrite. Do not degrade images before training.
5. **Do not scrape copyrighted game screenshots** or FMV frames. A previous idea (abandonware archives) was deliberately dropped. Synthetic data only.
6. If something here is wrong or a model page has changed (endpoint names, parameters, prices), trust the live docs, note the discrepancy in your report, and continue.

## 6. Shared Step 0: Pilot and decision gate (do this first, costs about $0.50)

Regenerate the prompt set with Appendix A (`node generate-fmv-prompts.mjs --count 120 --seed 1 --out fmv-prompts.json`). Each entry has `kind` (`single`, `two`, `wide`, `empty`, `insert`, `chroma`), a `prompt` (for the Flux LoRA, already includes the trigger prefix) and a `caption` (for ZIT training, content only plus the new trigger `fmvstyle`). About half the people shots carry an extra "composited over a pre-rendered 3D background" cue. That doubles as an A/B test.

**Pilot:** pick 12 prompts: 4 people shots with the composite cue, 3 people shots without, 1 wide, 1 empty, 1 insert, 2 chroma (one green, one blue). Generate each on `fal-ai/flux-lora` with the Flux FMV LoRA at scale 1.0, size `landscape_4_3`, other settings default (28 steps, guidance 3.5; verify the schema on the model page). Optionally re-run 3 at scale 0.8 and 1.2.

Show the user a contact sheet. Score each image 0/1 on: (a) reads as a 90s FMV-era still with actors over CG rooms, (b) matches the requested style (dystopia / hacker / cassette / cyberpunk) rather than gothic mansion bleed, (c) no garbled text, (d) anatomy OK. For chroma images also: (e) even, single-colour screen and an actor that could be keyed.

**Gate:**
- If at least about 60% of people shots are "would keep" on (a)-(d), and the empty/insert shots are at least about 50%: choose **Option A**.
- If people shots fail on (b) (style bleed) or chroma images are not keyable: choose **Option B**, or the **hybrid** (Flux LoRA for empty backgrounds only, plain Z-Image for actors).
- Report the scores and your recommendation to the user, and let them choose. Do not spend the main budget before they confirm.

## 7. Option A: distill the existing Flux LoRA into a Z-Image LoRA

Idea: use the paid Flux LoRA once as a data generator, then train a LoRA on Z-Image Turbo so all future generations are about 4x cheaper.

A1. **Generate the dataset.** Run all 120 prompts (raise `--count` to about 200 for headroom if the pilot yield is low). Endpoint `fal-ai/flux-lora`, `loras: [{ path: <safetensors URL>, scale: <best scale from pilot> }]`, `image_size: "landscape_4_3"`, `output_format: "png"`, use each entry's `seed`. Expected cost: about $0.035 x images, so about $4-7.

A2. **Chroma-key images** are the most doubtful under this option. If the Flux LoRA cannot produce even green/blue screens, generate the chroma subset with plain **Z-Image Turbo** (no LoRA; see B1) and merge them into the dataset. These are not stylised by the LoRA, but the style is applied by the trained ZIT LoRA and the downstream degrade step.

A3. Continue with **Section 9 (shared steps)**.

## 8. Option B: build the dataset by compositing, the way the original games were made

Idea: Phantasmagoria/Harvester were made by shooting actors on chroma key and compositing them over pre-rendered 3D backgrounds. Do the same synthetically. Full control over content, no dependency on a LoRA that was never trained on this style.

B1. **Actors on chroma key.** Generate about 60-80 images of people on solid green (half) and blue (half) screens with **plain Z-Image Turbo** (`fal-ai/z-image/turbo`, about $0.0085/MP). Use the `chroma`-kind entries from the generator as prompts (strip the Flux prefix), adding "solid pure #00FF00 (or #0000FF) background, evenly lit". The wardrobe pool in the script deliberately avoids green and blue. Vary faces: the script cycles 20 appearances. Keep raw copies: **15-25 of these raw chroma images belong in the final dataset as they are**, because the user wants chroma-key shots in the style.

B2. **Keying.** For each actor image:
   - Sample the real screen colour from the image border (AI screens are not exactly #00FF00 or #0000FF).
   - `ffmpeg -i actor.png -vf "chromakey=<sampled hex>:0.15:0.08,despill=type=green" -frames:v 1 actor_rgba.png` (use `type=blue` for blue; tune similarity and blend).
   - Fall back to a background-removal model (rembg or BiRefNet, or Runware's background removal) when keying leaves holes.
   - Trim to the alpha bounding box. Reject failures.

B2a. Normalise each actor into a standard RGBA file plus a record `{actor_id, description, shot_type}`.

B3. **Backgrounds.** Generate 40-60 **people-free, pre-rendered-3D-style** backgrounds in the four style groups, using the `empty`-kind prompts from the generator. Two sources to compare on a small batch first:
   - Flux FMV LoRA (its training data was 3D-rendered game backdrops, so empty rooms are probably *in distribution*, unlike people), about $0.035 each; or
   - plain Z-Image Turbo with "1995 pre-rendered 3D background, flat-shaded low-polygon CG render, no people, [setting], [lighting]", about $0.0085 each.
   Prefer Z-Image if the user wants to avoid any lineage to the Flux LoRA (see Section 11).

B4. **Composite script** (Node with `sharp`, or Python with Pillow/OpenCV). Canvas 1024x768 (4:3). For each composite:
   - Scale the actor so its height is 55-95% of the canvas. Full-body shots stand near the bottom; waist-up shots may run off the bottom edge. x position in 20-80%.
   - **Deliberately mismatch the actor and background** (this is the look): in about 60% of composites shift the actor's brightness/contrast by +-10-25% and colour temperature away from the background.
   - Edges: hard 1 px in about 70%, 1-2 px feather in about 30%. Faint green/blue fringe left in about 10%.
   - Shadow: none in about 60%, hard-edged drop shadow in about 40%.
   - Use each actor at most twice (more reduces face diversity).
   - Record `{actor_id, background_id, parameters}` in the manifest.
   - Caption recipe: `fmvstyle, ` + actor description + ` composited over a pre-rendered 3D background of ` + background content + (if mismatched) `, the actor is lit differently from the computer-generated background`.

B5. **Dataset mix** (aim for about 80-120 images): about 60-70 composites, 15-25 raw chroma-key shots, 10-15 empty backgrounds, 8-12 insert shots (prop close-ups from plain Z-Image or the Flux LoRA; no readable text). Roughly the mix in the generator.

B6. Continue with **Section 9**.

## 9. Shared steps (both options)

**S1. Curate.** Contact-sheet everything. Drop: bad anatomy and hands, garbled or readable text and logos, near-duplicate faces (max 2 per face), weak or off-style images, muddy chroma screens. Keep about 80-120 images at a consistent resolution (about 1024x768). The user must see and approve the curated contact sheet before training.

**S2. Captions.** One `.txt` per image, same basename. Format: `fmvstyle, <content description>`. The content description comes from the `caption` field (Option A) or the recipe in B4/B5. No leftover Flux prefix. Spot-check 10 captions against their images and fix mismatches. Natural-language captions are fine for Z-Image.

**S3. Train the Z-Image Turbo LoRA.** Choose by checking live docs and pricing (ask the user if more than about $10):
   - fal `fal-ai/z-image-trainer` (price unknown; check),
   - WaveSpeed ($1.25 per 1,000 steps), or
   - local training with ostris/ai-toolkit if the machine has a suitable GPU (check `nvidia-smi`; 24 GB VRAM class or better).
   Z-Image Turbo is a **step-distilled** model. Trainers typically apply a de-distillation / "training adapter" recipe so the LoRA doesn't break few-step inference: follow the trainer's Turbo-specific recipe, not generic settings. Starting points to verify against the docs: rank 16-32, LR about 1e-4, 1,500-2,500 steps, save a checkpoint every 250, 4:3 bucket around 1024x768, trigger `fmvstyle`.

**S4. Evaluate.**
   - Generate 24 **hold-out prompts** (`node generate-fmv-prompts.mjs --count 24 --seed 2`) with the trained LoRA at scales 0.6, 0.8, 1.0, 1.2. Compare against the Flux LoRA's output for the same prompts, side by side. Also run a few prompts *without* the trigger to check for bleed.
   - Run 6 of the best through the whole downstream pipeline (Section 2) to confirm the look survives degrade, image-to-video and Cinepak.
   - Score with the same rubric as the pilot. Present to the user.

**S5. Deploy.** Upload the final `.safetensors` to a stable URL (private HF repo or fal storage). Write `gen-image.mjs` (Node ESM, `@fal-ai/client`): flags `--prompt`, `--seed`, `--scale`, `--size`; calls `fal-ai/z-image/turbo/lora` (verify schema), saves the PNG, prints the cost estimate. Add an `npm run` script. Document the trigger word and the best LoRA scale.

## 10. Acceptance criteria

- At least about 70% of hold-out outputs get a "would keep" rating from the user, in the target style (not gothic).
- Chroma-key prompts yield a clean, keyable single-colour screen in at least about 60% of tries.
- Cost at 1024x768 is at most about $0.01 per image on the deployed endpoint, and at least about 3x cheaper than `fal-ai/flux-lora`.
- The look survives the existing downstream pipeline.
- Reproducible: `manifest.jsonl`, the curated dataset, captions, the trained LoRA and the CLI are all in the output folder.

## 11. Licensing and risk notes (tell the user, do not decide for them)

- The Flux LoRA was trained on Phantasmagoria/Harvester screenshots (copyrighted). Option A trains a new LoRA on *outputs* of that LoRA, so there is lineage. It is indirect, but the user should know. Option B with Z-Image-only backgrounds avoids it.
- The FLUX.1 [dev] licence is non-commercial for the model; I recall it also restricting use of outputs to train competing models, but **did not verify the wording**. Read the current licence before Option A, and ask the user whether any of this ends up in a commercial product.
- Check Z-Image Turbo's licence (fal's page says commercial use is supported).
- Overfitting: about 100 images of one aesthetic can memorise faces and rooms. That is why the prompts vary people, settings and shot types.

## 12. Things I could not verify (check first)

- Exact fal schemas for `fal-ai/flux-lora`, `fal-ai/z-image/turbo/lora` and `fal-ai/z-image-trainer` (parameter names, LoRA input format, trainer pricing).
- Whether Atlas Cloud or Runware can load custom LoRAs on Z-Image Turbo.
- Whether the Flux FMV LoRA can produce cyberpunk/hacker/cassette content, and clean chroma screens (this is what the pilot tests).
- Whether the direct Hugging Face URL above is correct.
- Whether I2V on a degraded first frame preserves the look (the user already does this and is happy; just confirm in S4).

## 13. Suggested output layout

```
fmv-lora/
  prompts/fmv-prompts.json
  pilot/            # 12 images + contact sheet + scores.md
  dataset/raw/      # generated, un-degraded
  dataset/final/    # curated images + .txt captions
  actors/ backgrounds/ composites/    # Option B only
  train/            # config, logs, checkpoints, final .safetensors
  eval/             # hold-out grids, pipeline tests
  manifest.jsonl
  gen-image.mjs
  REPORT.md         # what was done, costs, scores, open questions
```

## Appendix A: prompt generator (`generate-fmv-prompts.mjs`)

Save as `generate-fmv-prompts.mjs` and run with Node 18+. Deterministic for a given `--seed`.

```js
#!/usr/bin/env node
// Generates a varied prompt set for a synthetic 90s-FMV style LoRA dataset.
// Aesthetic: tacky dystopia + 90s hacker culture + cassette futurism + a little cyberpunk,
// plus actors shot against chroma-key green and blue screens.
//
//   node generate-fmv-prompts.mjs \
//        --zit-trigger "fmvstyle" --count 120 --seed 1 --out fmv-prompts.json
//
// Each entry has:
//   prompt  -> send to the Flux FMV LoRA (its caption prefix + the scene description)
//   caption -> training caption for the Z-Image LoRA (content only + your new trigger)
// Content varies on purpose; the style stays constant so the LoRA learns the style, not a face or a room.

import { writeFileSync } from "node:fs";

// ---------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const COUNT = Number(args.count ?? 120);
const SEED = Number(args.seed ?? 1);
// The LoRA's documented trigger: a fixed caption prefix with the scene description appended.
const FLUX_PREFIX = args["flux-prefix"] ??
  "The image is a screenshot from a 3D-rendered scene, possibly from a video game or a virtual environment. The scene depicts ";
const ZIT_TRIGGER = args["zit-trigger"] ?? "fmvstyle";
const OUT = args.out ?? "fmv-prompts.json";

// ---------- seeded rng ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- pools ----------
// Varied people so the LoRA doesn't memorise one face. Appearance only (no clothing): roles and wardrobe supply costume.
const PEOPLE = [
  "a man in his 40s with a thick mustache",
  "a woman in her 30s with a permed bob",
  "an older man with gray hair and round glasses",
  "a young man with a bleached buzzcut",
  "a Black woman in her 20s with box braids",
  "a stern woman in her 50s with short silver hair",
  "a South Asian man in his 30s with a goatee",
  "a lanky young man with floppy hair",
  "a heavyset man in his 50s with a beard",
  "an East Asian woman in her 30s with a sleek ponytail",
  "a tall thin man in his 20s with slicked-back hair",
  "a Latina woman in her 40s with big curly hair",
  "a bald man in his 50s",
  "a woman in her 20s with a shaved undercut and dyed pink hair",
  "a Black man in his 40s with a shaved head",
  "a young man with frosted spiky tips",
  "a young East Asian man with long straight hair",
  "a woman in her 20s with blonde feathered hair",
  "a pale young woman with jet-black hair and heavy eyeliner",
  "an elderly woman with her hair in a bun",
];

// Style groups bundle settings + roles + actions so combinations stay coherent.
const GENRES = {
  hackers: {
    settings: [
      "a cluttered teenage bedroom full of CRT monitors, posters and tangled cables",
      "an underground club with laser beams and a cheap fog machine",
      "a rooftop with a painted night skyline and satellite dishes",
      "a garage full of beige computer towers and cable spaghetti",
      "a grimy subway platform with a payphone on the wall",
      "a garish cyberspace set with glowing toy-like wireframe towers and pastel gel lighting",
      "an office cubicle farm at night lit only by monitors",
      "a skate park under neon lights",
    ],
    roles: [
      "a teenage hacker in an oversized patterned jacket and LED goggles",
      "a rollerblading courier in a shiny windbreaker and mirrored sunglasses",
      "a pirate TV broadcaster in a headset and holographic-look vest",
      "a corporate security agent in a cheap black suit and thin sunglasses",
      "a punk hacker girl in a torn band tee and chunky boots",
      "a nervous systems administrator in a wrinkled shirt and lanyard",
    ],
    actions: [
      "typing furiously on a beige keyboard",
      "holding up a floppy disk triumphantly",
      "squinting at a glowing monitor",
      "whispering into a chunky headset",
      "pointing at a screen in alarm",
      "tapping a payphone handset against their palm",
    ],
  },
  cassette: {
    settings: [
      "a mainframe room with reel-to-reel tape drives and wall-sized blinking panels",
      "a cramped control room with beige plastic consoles, toggle switches and amber monochrome CRT screens",
      "a dim terminal room with green phosphor screens and stacked cassette decks",
      "a retro-futuristic lab with chunky knobs, analog dials and label-maker tags",
      "a corridor lined with tall beige computer cabinets and cable trays",
      "a radar room with round amber screens and a rotating sweep",
    ],
    roles: [
      "a technician in a gray jumpsuit with a headset",
      "a systems operator in a white lab coat and thick glasses",
      "a flight-deck officer in a cheap metallic uniform",
      "a nervous engineer in a short-sleeved shirt and tie",
      "a stern commander in a high-collared tunic",
      "a rookie analyst in a turtleneck holding a clipboard",
    ],
    actions: [
      "flipping a toggle switch on a console",
      "turning a large dial",
      "reading a printout with a worried frown",
      "sliding a cassette tape into a deck",
      "staring at an amber screen",
      "reporting grimly into a wall intercom",
    ],
  },
  dystopia: {
    settings: [
      "a megacorp lobby with cheap chrome, plastic plants and garish neon shapes, no readable text",
      "a surveillance control room with a wall of mismatched CRT monitors",
      "a dystopian game-show studio with overbright neon and plastic set pieces",
      "a propaganda broadcast studio with a huge banner of abstract symbols",
      "a cheap futuristic interrogation cell with glowing tube lights",
      "a sterile apartment corridor with flickering ceiling panels",
      "a dystopian shopping arcade with neon signs and vending machines, no readable text",
    ],
    roles: [
      "a smiling state broadcaster in a shiny silver blazer",
      "a megacorp executive in a stiff pinstripe suit with huge shoulder pads",
      "a riot guard in a plastic helmet and clunky body armor",
      "a game-show host in a glittery jacket with a headset mic",
      "a bureaucrat in a gray uniform with an ID badge",
      "a rebel in a patched coat and a gas mask pushed up on the forehead",
    ],
    actions: [
      "smiling rigidly into the camera",
      "reading from a prompter with a flat voice",
      "pointing at an unseen crowd",
      "holding up an official-looking tablet",
      "glaring with menacing over-acting",
      "saluting awkwardly",
    ],
  },
  cyberpunk: {
    settings: [
      "a rainy neon street built on a backlot with wet pavement and steam vents",
      "a cramped noodle stand under glowing signs, no readable text",
      "a crowded street market with hanging cables and colored gels",
      "a back-alley clinic with buzzing tube lights and a reclined chair",
      "a rooftop with a painted night skyline and magenta and cyan gels",
    ],
    roles: [
      "a street mercenary in a long vinyl coat with prop implants",
      "a data courier in a hooded jacket with glowing cable accents",
      "a black-market surgeon in a stained apron and visor",
      "a neon-lit fixer in a metallic jacket and mirrored visor",
      "a wary drifter in a patched trench coat",
    ],
    actions: [
      "lighting a cigarette under neon",
      "handing over a small plastic data cartridge",
      "glancing over a shoulder",
      "adjusting a prop cybernetic arm",
      "staring coldly at the camera",
    ],
  },
};

// Acting cues: the "poorly acted" part of the look.
const ACTING = [
  "stiff posture, eyes slightly off-camera",
  "over-emphatic expression, wide-eyed",
  "deadpan line-reading face, mouth slightly open",
  "forced smile that doesn't reach the eyes",
  "theatrical gesture, hand raised awkwardly",
  "wooden, unconvincing serious look",
  "glancing at something off-screen with exaggerated concern",
  "frozen mid-sentence, slightly unnatural pose",
];

const LIGHTING = [
  "saturated magenta and cyan gel lights",
  "amber CRT glow with deep shadows",
  "green phosphor screen glow in a dark room",
  "harsh flat fluorescent lighting with washed-out colors",
  "smoke-machine haze with laser beams and colored rim lights",
  "flat studio key light with a hard shadow on the backdrop",
  "blue moonlight gel with a magenta rim light",
  "sickly overhead tube lighting with heavy shadows",
];

const SHOTS_PERSON = ["a medium shot", "a medium close-up", "a close-up", "a waist-up shot", "a chest-up portrait"];

// Insert shots, cassette futurism and hacker tech. No readable text.
const INSERTS = [
  "a hand flipping a toggle switch on a beige console",
  "a reel-to-reel tape spinning on a mainframe drive",
  "a chunky cassette tape being pushed into a deck",
  "an amber monochrome CRT showing glowing abstract wireframe shapes, no readable text",
  "a hand inserting a floppy disk into a beige computer",
  "a payphone handset swinging on its steel cord",
  "a rack of blinking LEDs on a rack-mounted panel",
  "a gloved hand gripping a big red lever",
  "a pair of mirrored sunglasses reflecting a screen",
  "a dial with tiny glowing numbers and a trembling needle",
  "a dot-matrix printer spitting out blank paper",
  "a row of tiny CRT monitors showing static",
  "a hand pressing a chunky illuminated button",
  "a tangle of colored cables plugged into a beige panel",
];

// ---------- chroma-key shots ----------
// Wardrobe avoids green and blue so the actor can be keyed cleanly.
const WARDROBE = [
  "a silver metallic jumpsuit",
  "a black vinyl trench coat and mirrored sunglasses",
  "a red leather jacket over a black tee",
  "a white lab coat and thick glasses",
  "a gold lame jacket with huge shoulder pads",
  "an orange jumpsuit with a utility belt",
  "a magenta windbreaker with LED goggles on the forehead",
  "a gray corporate suit with a cheap tie",
  "a black tactical vest and plastic helmet",
  "a pink holographic-look raincoat",
  "a black turtleneck and a silver chain",
  "a white plastic jumpsuit with a silver visor",
  "a black leather jacket with spiked collar",
  "a yellow hazard suit with the hood down",
];
const CHROMA_POSES = [
  "pointing at empty space as if at a giant hologram",
  "reaching toward something invisible",
  "looking up at something enormous off-screen",
  "arms crossed, glaring at the camera",
  "mid-stride walking toward the camera",
  "hands raised as if typing on an invisible keyboard",
  "gesturing at an invisible map",
  "holding a chunky prop scanner out in front",
  "leaning forward as if peering into an unseen monitor",
  "standing rigidly at attention",
];
const CHROMA_SHOTS = ["a full-body shot", "a medium shot", "a waist-up shot", "a full-length shot"];
const CHROMA_LIGHT = [
  "evenly lit screen with slight wrinkles and a soft shadow on the floor",
  "flat even lighting with a faint hot spot on the screen",
  "slightly uneven lighting with color spill on the edges of hair and clothes",
  "bright soundstage lighting with visible seams in the screen",
];

// The LoRA was trained on Phantasmagoria/Harvester: live actors composited over pre-rendered 3D rooms.
// Half of the people shots get one of these cues, which doubles as an A/B test of the prompts.
const COMPOSITE_CUES = [
  "the live-action actor looks cut out and pasted over a pre-rendered 3D background",
  "a digitized actor composited into a rendered 3D room with mismatched lighting",
  "the actor is lit differently from the computer-generated background",
  "a live-action character standing in a pre-rendered low-polygon environment",
];
const composite = () => (rand() < 0.5 ? `, ${pick(COMPOSITE_CUES)}` : "");

// ---------- builders ----------
// Weighted so cyberpunk stays "a little" and the other three carry the look.
const GENRE_WEIGHTS = { hackers: 0.3, dystopia: 0.3, cassette: 0.25, cyberpunk: 0.15 };
function pickGenre() {
  let r = rand();
  for (const [k, w] of Object.entries(GENRE_WEIGHTS)) {
    if ((r -= w) < 0) return k;
  }
  return "hackers";
}
let chromaCount = 0; // alternate screens so green and blue stay balanced

function build(kind) {
  const gk = pickGenre();
  const g = GENRES[gk];
  const setting = pick(g.settings);
  const light = pick(LIGHTING);

  if (kind === "single") {
    return { genre: gk, kind, content: `${pick(SHOTS_PERSON)} of ${pick(PEOPLE)}, playing ${pick(g.roles)}, ${pick(g.actions)}, ${pick(ACTING)}, in ${setting}, ${light}${composite()}` };
  }
  if (kind === "two") {
    const a = pick(PEOPLE);
    let b = pick(PEOPLE);
    while (b === a) b = pick(PEOPLE);
    const ra = pick(g.roles);
    let rb = pick(g.roles);
    while (rb === ra) rb = pick(g.roles);
    return { genre: gk, kind, content: `a two-shot of ${a} as ${ra} and ${b} as ${rb}, facing each other in a stilted conversation, ${pick(ACTING)}, in ${setting}, ${light}${composite()}` };
  }
  if (kind === "wide") {
    return { genre: gk, kind, content: `a wide shot of ${setting}, with ${pick(g.roles)} small in frame, ${pick(g.actions)}, ${pick(ACTING)}, ${light}${composite()}` };
  }
  if (kind === "empty") {
    return { genre: gk, kind, content: `an empty wide shot of ${setting}, no people, ${light}` };
  }
  if (kind === "insert") {
    return { genre: "cassette", kind, content: `an insert shot of ${pick(INSERTS)}, ${light}` };
  }
  // chroma: alternate green / blue
  const screen = chromaCount++ % 2 === 0 ? "green" : "blue";
  const screenDesc = `standing in front of a solid bright chroma-key ${screen} screen with a matching ${screen} floor`;
  if (rand() < 0.25) {
    const a = pick(PEOPLE);
    let b = pick(PEOPLE);
    while (b === a) b = pick(PEOPLE);
    let wa = pick(WARDROBE);
    let wb = pick(WARDROBE);
    while (wb === wa) wb = pick(WARDROBE);
    return { genre: `chroma-${screen}`, kind: "chroma", content: `a full-body two-shot of ${a} in ${wa} and ${b} in ${wb}, ${screenDesc}, ${pick(CHROMA_POSES)}, ${pick(ACTING)}, ${pick(CHROMA_LIGHT)}` };
  }
  return { genre: `chroma-${screen}`, kind: "chroma", content: `${pick(CHROMA_SHOTS)} of ${pick(PEOPLE)} in ${pick(WARDROBE)}, ${screenDesc}, ${pick(CHROMA_POSES)}, ${pick(ACTING)}, ${pick(CHROMA_LIGHT)}` };
}

// Target mix (sums to 1).
const MIX = [["single", 0.32], ["chroma", 0.2], ["wide", 0.15], ["insert", 0.13], ["two", 0.1], ["empty", 0.1]];
const targets = MIX.map(([k, p]) => [k, Math.round(COUNT * p)]);
// Fix rounding drift on the biggest bucket.
targets[0][1] += COUNT - targets.reduce((s, [, n]) => s + n, 0);

const uniq = new Set();
const entries = [];
let attempts = 0;
for (const [kind, n] of targets) {
  let made = 0;
  while (made < n && attempts < COUNT * 400) {
    attempts++;
    const e = build(kind);
    if (uniq.has(e.content)) continue;
    uniq.add(e.content);
    entries.push(e);
    made++;
  }
}

// Shuffle so batches are mixed, then finalise.
for (let i = entries.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [entries[i], entries[j]] = [entries[j], entries[i]];
}

const out = entries.map((e, i) => ({
  id: String(i + 1).padStart(3, "0"),
  genre: e.genre,
  kind: e.kind,
  seed: Math.floor(rand() * 2 ** 31),
  prompt: `${FLUX_PREFIX}${e.content}.`,
  caption: `${ZIT_TRIGGER}, ${e.content}`,
}));

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`wrote ${out.length} prompts to ${OUT}`);
const tally = (key) => out.reduce((m, e) => ((m[e[key]] = (m[e[key]] ?? 0) + 1), m), {});
console.log("by kind:", tally("kind"));
console.log("by genre:", tally("genre"));
```

## Appendix B: sources (gathered 2026-09-30)

- fal Flux LoRA pricing: https://fal.ai/models/fal-ai/flux-lora
- fal Z-Image Turbo LoRA: https://fal.ai/models/fal-ai/z-image/turbo/lora
- fal Z-Image trainer: https://fal.ai/models/fal-ai/z-image-trainer
- fal FLUX.2 Klein 4B base LoRA: https://fal.ai/models/fal-ai/flux-2/klein/4b/base/lora
- fal MiniMax H3 Max Turbo i2v pricing/endpoints: https://anikuku.com/blog/fal-h3-max-turbo-api-speed-pricing-2026
- WaveSpeed Z-Image Turbo pricing: https://wavespeed.ai/blog/posts/blog-z-image-turbo-pricing/
- Atlas Cloud Z-Image Turbo: https://www.atlascloud.ai/models/z-image/turbo
- Runware model pricing: https://runware.ai/collections/fastest-image-generation
- Flux FMV LoRA (Hugging Face mirror): https://huggingface.co/Muapi/90-s-pc-game-fmv-style-flux
- Flux FMV LoRA (Civitai, 403 to bots): https://civitai.red/models/940053/90s-pc-game-fmv-style-flux
- Cinepak: https://en.wikipedia.org/wiki/Cinepak
