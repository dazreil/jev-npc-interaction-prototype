// Asset runner for game/Assets.canvas (ENGINE_SPEC.md 7.4).
//
//   npm run assets                 run every recipe card set to "status: go"
//   npm run assets -- --dry-run    show the requests; call nothing, spend nothing
//   npm run assets -- --watch      keep running; set a card to "go" in Obsidian
//   npm run assets -- --card NAME  run that one card now, whatever its status
//   npm run assets -- --card NAME --refinish
//                                  redo only the finish (crunch, frames, colours)
//                                  from the saved original; free, no AI call
//
// Needs FAL_KEY in .env. Results appear on the canvas as cards next to their
// recipe. They are saved beside the canvas: a character's, scene's, or item's
// own canvas (characters/arthur/Arthur.canvas) saves into its art/ folder;
// the shared Assets.canvas saves into assets/generated/.
import { watch } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv } from "../lib/env.mjs";
import { VAULT_DIR } from "./compile-vault.mjs";
import { animationSettings, applyResult, buildRequest, compositeOverrides, crunchSettings, latestOutput, readRecipes, recipePrompt } from "../lib/asset-canvas.mjs";
import { SERVICES, SERVICE_MODELS, keyFor, makePicture } from "../lib/services.mjs";
import { readLoras, readModels, resolveLora } from "../lib/library.mjs";
import { chooseParameters, composite, key, keyFrames, seeded } from "../lib/composite.mjs";
import { download, runFal } from "../lib/fal.mjs";
import { crunch, crunchRgba, cropImage, ensureMinSize, extractFrames, finishFrames, makeLimitedAnimation, mediaSize, mirrorImage, toJpeg, toPng, toWebp } from "../lib/limited-animation.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = VAULT_DIR;
const CANVAS = join(VAULT, process.argv.find((arg) => arg.endsWith(".canvas")) ?? "Assets.canvas");
// Every recipe gets its own folder: <art>/<name>/ holds the finished files,
// and <name>/_source/ the clean originals (the leading underscore keeps them
// out of the game build; the ".source" ending keeps file names unique in the
// vault, as Obsidian links need).
const GENERATED = dirname(CANVAS) === VAULT ? join(VAULT, "assets", "generated") : join(dirname(CANVAS), "art");
const outDir = (name) => join(GENERATED, name);
const sourceDir = (name) => join(GENERATED, name, "_source");
const sourcePath = (name, extension) => join(sourceDir(name), `${name}.source.${extension}`);
const DRY_RUN = process.argv.includes("--dry-run");
const WATCH = process.argv.includes("--watch");
const CARD = process.argv.includes("--card") ? process.argv[process.argv.indexOf("--card") + 1] : null;
const REFINISH = process.argv.includes("--refinish");
const KEY = readEnv(ROOT, "FAL_KEY");
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const readCanvas = async () => JSON.parse(await readFile(CANVAS, "utf8"));
const vaultPath = (path) => relative(VAULT, path).split("\\").join("/");

/** Re-reads the canvas and changes one card, so edits made meanwhile are kept. */
async function update(nodeId, result) {
  const next = applyResult(await readCanvas(), nodeId, result);
  await writeFile(CANVAS, JSON.stringify(next, null, "\t"));
}

/**
 * A local image as a data: URI (fal accepts these for image inputs). Video
 * models reject frames under 256 px, so small images are enlarged first.
 */
async function imageUri(file) {
  let path = isAbsolute(file) ? file : join(VAULT, file);
  let type = MIME[extname(path).toLowerCase()];
  if (!type) throw new Error(`${file} is not a png, jpeg, or webp image`);
  const work = await mkdtemp(join(tmpdir(), "assets-"));
  try {
    const sized = await ensureMinSize(path, join(work, "frame.png"));
    if (sized.scaled) {
      console.log(`  ${file} is small; enlarged to ${sized.width}x${sized.height} for the video model`);
      path = sized.path;
      type = "image/png";
    }
    return `data:${type};base64,${(await readFile(path)).toString("base64")}`;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** name.webp → name.clean.webp: the same picture without the crunch, for the game's clean mode. */
const twinOf = (file) => file.replace(/(\.\w+)$/, ".clean$1");

/** Writes the clean twin of a crunched file, or removes a stale one when there is no crunch. */
async function cleanTwin(file, make) {
  if (make) return make();
  await rm(twinOf(file), { force: true });
}

/**
 * Crunch (if set), then WebP and a JPEG twin. The clean source is never
 * changed. `name` lets one card write several pictures into its folder.
 */
async function finishImage(recipe, source, name = recipe.name) {
  const settings = crunchSettings(recipe);
  const out = join(outDir(recipe.name), `${name}.webp`);
  await mkdir(outDir(recipe.name), { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "finish-"));
  try {
    const input = settings ? await crunch(source, join(work, "crunched.png"), settings) : source;
    await toWebp(input, out, { width: recipe.fields.width ?? null });
    await cleanTwin(out, settings && (() => toWebp(source, twinOf(out), { width: recipe.fields.width ?? null })));
    // A JPEG twin of the finished picture, for sharing where WebP is not shown.
    await toJpeg(out, join(outDir(recipe.name), `${name}.jpg`));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  if (settings) console.log(`  crunch: ${settings.factor}x smaller, JPEG quality ${settings.quality}, back up with ${settings.filter}`);
  return out;
}

async function finishAnimation(recipe, clip) {
  const settings = animationSettings(recipe.fields, recipe);
  return makeLimitedAnimation(clip, outDir(recipe.name), recipe.name, settings);
}

/** The clean AI clip, kept with the originals; name.mp4 is the finished, shareable one. */
async function sourceClip(recipe) {
  return sourcePath(recipe.name, "mp4");
}

/** Redoes only the finish from the saved original. No AI call, no cost. */
async function refinish(recipe) {
  if (recipe.kind === "image" || recipe.kind === "edit") {
    let source = sourcePath(recipe.name, "png");
    if (!existsSync(source)) {
      // Made before originals were kept: use the current picture once.
      const current = join(outDir(recipe.name), `${recipe.name}.webp`);
      if (!existsSync(current)) throw new Error("nothing to refinish yet; generate it first");
      await mkdir(sourceDir(recipe.name), { recursive: true });
      await toPng(current, source);
      console.log(`  no clean original saved for ${recipe.name}; using the current picture as one`);
    }
    const file = await finishImage(recipe, source);
    await update(recipe.nodeId, { status: "done", files: [vaultPath(file)] });
    console.log(`[${recipe.name}] refinished → ${vaultPath(file)}`);
    return;
  }
  const clip = await sourceClip(recipe);
  if (!existsSync(clip)) throw new Error("nothing to refinish yet; generate it first");
  const { animation, frames, video } = await finishAnimation(recipe, clip);
  await update(recipe.nodeId, { status: "done", files: [vaultPath(animation), vaultPath(video)] });
  console.log(`[${recipe.name}] refinished → ${vaultPath(animation)}, ${vaultPath(video)} + ${frames.length} frames`);
}

/**
 * The clean picture behind a source: a file card's file, or a recipe's saved
 * original (falling back to its finished output).
 */
function cleanSource(canvas, source) {
  if (source.file) return join(VAULT, source.file);
  const original = sourcePath(source.recipe, "png");
  if (existsSync(original)) return original;
  const other = readRecipes(canvas).find((item) => item.name === source.recipe);
  const file = other && latestOutput(canvas, other);
  if (!file) throw new Error(`"${source.recipe}" has no picture yet; generate it first`);
  return join(VAULT, file);
}

/**
 * An animated actor: key every frame of its clean clip (one screen colour,
 * one trim box), paste each over the room with the same placement, then
 * finish them as a limited animation. Frame count, speed and time window
 * come from the animate card; crunch and colours from the composite card.
 */
async function runAnimatedComposite(recipe, animation, room, parameters) {
  const clip = sourcePath(animation.name, "mp4");
  if (!existsSync(clip)) throw new Error(`"${animation.name}" has no clip yet; generate it first`);
  const timing = animationSettings(animation.fields);
  const look = animationSettings(recipe.fields, recipe);
  if (DRY_RUN) {
    console.log(`\n[${recipe.name}] would composite every frame of ${animation.name} (free, no AI call)`);
    console.log("  room:", relative(ROOT, room), "\n  frames:", timing.frames, "at", timing.fps, "fps; placement:", parameters);
    return;
  }
  await update(recipe.nodeId, { status: "running" });
  const work = await mkdtemp(join(tmpdir(), "composite-frames-"));
  try {
    const raw = await extractFrames(clip, join(work, "raw"), { frames: timing.frames, from: timing.from, to: timing.to });
    await mkdir(join(work, "key"), { recursive: true });
    const { keyed, screen, box } = await keyFrames(raw, join(work, "key"));
    const pasted = [];
    for (const [index, actor] of keyed.entries()) {
      pasted.push(await composite(room, actor, join(work, `comp-${String(index + 1).padStart(2, "0")}.png`), parameters));
    }
    console.log(`  keyed ${keyed.length} frames off ${screen.screen} ${screen.hex}; one trim box ${box.width}x${box.height}`);
    const frames = keyed.map((_, index) => join(work, `comp-${String(index + 1).padStart(2, "0")}.png`));
    const finished = await finishFrames(frames, outDir(recipe.name), recipe.name, {
      fps: timing.fps,
      pingpong: timing.pingpong,
      colors: look.colors,
      width: look.width,
      crunch: look.crunch
    });
    if (look.crunch) await finishFrames(frames, outDir(recipe.name), recipe.name, { fps: timing.fps, pingpong: timing.pingpong, width: look.width, suffix: ".clean" });
    await update(recipe.nodeId, { status: "done", files: [vaultPath(finished.animation), vaultPath(finished.video)] });
    console.log(`[${recipe.name}] composited → ${vaultPath(finished.animation)}, ${vaultPath(finished.video)} + ${finished.frames.length} frames`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Several actors into one room with the same placement: a picture for each
 * still actor (<card>-<actor>.webp), and a finished limited animation for
 * each animated one (<card>-<animation>.webp, -01…, .mp4). With
 * `align: true` every frame of every actor is keyed together (one screen
 * colour, one trim box), so moods, blinks and talking loops line up exactly
 * and can be swapped without a jump. Clip frames are scaled to the first
 * still's width first, so all frames share one size. Free.
 */
async function runCompositeSet(recipe, canvas, room, parameters) {
  const { align } = compositeOverrides(recipe.fields);
  const recipes = readRecipes(canvas);
  const look = animationSettings(recipe.fields, recipe);
  const actors = recipe.actors.map((source) => {
    const animation = source.recipe && recipes.find((item) => item.name === source.recipe && item.kind === "animate");
    return animation
      ? { name: animation.name, animation, clip: sourcePath(animation.name, "mp4") }
      : { name: source.recipe ?? basename(source.file).replace(/\.[^.]+$/, ""), file: cleanSource(canvas, source) };
  });
  for (const actor of actors) {
    if (actor.animation && !existsSync(actor.clip)) throw new Error(`"${actor.name}" has no clip yet; generate it first`);
  }
  if (DRY_RUN) {
    console.log(`\n[${recipe.name}] would composite ${actors.length} actors (free, no AI call)${align ? ", aligned" : ""}`);
    for (const actor of actors) console.log(`  ${recipe.name}-${actor.name}  ←  ${actor.animation ? `every frame of ${actor.name}` : relative(ROOT, actor.file)}`);
    return;
  }
  await update(recipe.nodeId, { status: "running" });
  await mkdir(sourceDir(recipe.name), { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "composite-set-"));
  try {
    // Every actor becomes a list of frame pictures (a still is one frame).
    const firstStill = actors.find((actor) => actor.file);
    const width = firstStill ? (await mediaSize(firstStill.file)).width : null;
    for (const [index, actor] of actors.entries()) {
      if (!actor.animation) {
        actor.frames = [actor.file];
        continue;
      }
      const timing = animationSettings(actor.animation.fields);
      actor.timing = timing;
      actor.frames = await extractFrames(actor.clip, join(work, `clip-${index}`), { frames: timing.frames, from: timing.from, to: timing.to, width });
    }
    const all = actors.flatMap((actor) => actor.frames);
    let keyed;
    if (align) {
      const result = await keyFrames(all, join(work, "key"));
      keyed = result.keyed;
      console.log(`  keyed ${keyed.length} frames together off ${result.screen.screen} ${result.screen.hex}; one trim box ${result.box.width}x${result.box.height}`);
    } else {
      keyed = [];
      for (const [index, frame] of all.entries()) {
        const out = join(work, `actor-${index}.png`);
        await key(frame, out);
        keyed.push(out);
      }
    }
    const files = [];
    let offset = 0;
    for (const actor of actors) {
      const name = `${recipe.name}-${actor.name}`;
      const mine = keyed.slice(offset, offset + actor.frames.length);
      offset += actor.frames.length;
      if (!actor.animation) {
        const source = join(sourceDir(recipe.name), `${name}.source.png`);
        await composite(room, mine[0], source, parameters);
        files.push(vaultPath(await finishImage(recipe, source, name)));
        continue;
      }
      const pasted = [];
      for (const [index, frame] of mine.entries()) {
        const out = join(work, `${name}-${String(index + 1).padStart(2, "0")}.png`);
        await composite(room, frame, out, parameters);
        pasted.push(out);
      }
      const finished = await finishFrames(pasted, outDir(recipe.name), name, { fps: actor.timing.fps, pingpong: actor.timing.pingpong, colors: look.colors, crunch: look.crunch });
      if (look.crunch) await finishFrames(pasted, outDir(recipe.name), name, { fps: actor.timing.fps, pingpong: actor.timing.pingpong, suffix: ".clean" });
      files.push(vaultPath(finished.animation));
    }
    await update(recipe.nodeId, { status: "done", files });
    console.log(`[${recipe.name}] composited ${actors.length} actors → ${vaultPath(outDir(recipe.name))}/`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** A composite card: key the actor off its screen and paste it over the room. Free. */
async function runComposite(recipe, canvas) {
  if (!recipe.room || !recipe.actor) throw new Error('draw an arrow labelled "room" and one labelled "actor" into this card');
  const room = cleanSource(canvas, recipe.room);
  const { seed, shot, overrides } = compositeOverrides(recipe.fields);
  const parameters = { ...chooseParameters(seeded(seed), { shot }), ...overrides };
  const animation = recipe.actor.recipe && readRecipes(canvas).find((item) => item.name === recipe.actor.recipe && item.kind === "animate");
  if (recipe.actors.length > 1) return runCompositeSet(recipe, canvas, room, parameters);
  if (animation) return runAnimatedComposite(recipe, animation, room, parameters);
  const actor = cleanSource(canvas, recipe.actor);
  if (DRY_RUN) {
    console.log(`\n[${recipe.name}] would composite (free, no AI call)\n  room:  ${relative(ROOT, room)}\n  actor: ${relative(ROOT, actor)}`);
    console.log("  placement:", parameters, "\n  then finish:", crunchSettings(recipe) ?? "(no crunch)");
    return;
  }
  await update(recipe.nodeId, { status: "running" });
  await mkdir(sourceDir(recipe.name), { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "composite-"));
  try {
    const keyed = join(work, "actor.png");
    const { screen } = await key(actor, keyed);
    const source = sourcePath(recipe.name, "png");
    const used = await composite(room, keyed, source, parameters);
    console.log(`  keyed off ${screen.screen} ${screen.hex}; actor ${used.actorWidth}x${used.actorHeight} at ${used.x},${used.y}`);
    const file = await finishImage(recipe, source);
    await update(recipe.nodeId, { status: "done", files: [vaultPath(file)] });
    console.log(`[${recipe.name}] composited → ${vaultPath(file)}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * A cutout card: key the picture off its green or blue screen, trim it, and
 * keep it transparent (crunched the same way as everything else), so it can
 * be layered over a scene. `mirror: true` also writes <name>-mirrored.webp.
 * Free.
 */
async function runCutout(recipe, canvas) {
  if (recipe.references.length !== 1) throw new Error("draw one arrow from the picture to cut out into this card");
  const animation = readRecipes(canvas).find((item) => item.name === recipe.references[0].recipe && item.kind === "animate");
  if (animation) return runAnimatedCutout(recipe, animation);
  const picture = cleanSource(canvas, recipe.references[0]);
  const settings = crunchSettings(recipe);
  if (DRY_RUN) {
    console.log(`\n[${recipe.name}] would cut out ${relative(ROOT, picture)} (free)${recipe.fields.mirror ? ", plus a mirror image" : ""}; crunch:`, settings ?? "none");
    return;
  }
  await update(recipe.nodeId, { status: "running" });
  await mkdir(sourceDir(recipe.name), { recursive: true });
  const source = sourcePath(recipe.name, "png");
  // keyLow / keyHigh: how green a pixel must be to start and to finish
  // fading out. Higher keeps green-lit edges (thin desk legs) solid.
  const keyOptions = {
    ...(recipe.fields.keyLow != null ? { low: Number(recipe.fields.keyLow) } : {}),
    ...(recipe.fields.keyHigh != null ? { high: Number(recipe.fields.keyHigh) } : {}),
    ...(recipe.fields.despill != null ? { despill: recipe.fields.despill } : {})
  };
  const { screen, box } = await key(picture, source, keyOptions);
  const work = await mkdtemp(join(tmpdir(), "cutout-"));
  try {
    const finished = settings ? await crunchRgba(source, join(work, "crunched.png"), settings) : source;
    const out = join(outDir(recipe.name), `${recipe.name}.webp`);
    await mkdir(outDir(recipe.name), { recursive: true });
    await toWebp(finished, out);
    await cleanTwin(out, settings && (() => toWebp(source, twinOf(out))));
    const files = [vaultPath(out)];
    if (recipe.fields.mirror === true) {
      const mirrored = join(outDir(recipe.name), `${recipe.name}-mirrored.webp`);
      files.push(vaultPath(await mirrorImage(out, mirrored)));
      await cleanTwin(mirrored, settings && (() => mirrorImage(twinOf(out), twinOf(mirrored))));
    }
    await update(recipe.nodeId, { status: "done", files });
    console.log(`  keyed off ${screen.screen} ${screen.hex}; ${box.width}x${box.height}`);
    console.log(`[${recipe.name}] cut out → ${files.join(", ")}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * A cutout card fed by an animate card: key every frame of the clean clip
 * (one screen colour, one trim box, so the frames line up), crunch them, and
 * finish them as a transparent limited animation. Frames, speed and time
 * window come from the animate card. Use it for a sprite the engine moves,
 * such as a walk cycle in place. Free.
 */
async function runAnimatedCutout(recipe, animation) {
  const clip = await sourceClip(animation);
  const { frames, fps, from, to, width, pingpong } = animationSettings(animation.fields);
  const settings = crunchSettings(recipe);
  if (DRY_RUN) {
    console.log(`\n[${recipe.name}] would cut out ${frames} frames of ${relative(ROOT, clip)} (free); crunch:`, settings ?? "none");
    return;
  }
  if (!existsSync(clip)) throw new Error(`"${animation.name}" has no clip yet; generate it first`);
  await update(recipe.nodeId, { status: "running" });
  const work = await mkdtemp(join(tmpdir(), "cutout-anim-"));
  try {
    const raw = await extractFrames(clip, join(work, "raw"), { frames, from, to, width });
    const { keyed, screen, box } = await keyFrames(raw, join(work, "key"));
    const finished = settings
      ? await Promise.all(keyed.map((file, index) => crunchRgba(file, join(work, `crunch-${String(index + 1).padStart(2, "0")}.png`), settings)))
      : keyed;
    const result = await finishFrames(finished, outDir(recipe.name), recipe.name, { fps, pingpong });
    if (settings) await finishFrames(keyed, outDir(recipe.name), recipe.name, { fps, pingpong, suffix: ".clean" });
    await update(recipe.nodeId, { status: "done", files: [vaultPath(result.animation)] });
    console.log(`  keyed off ${screen.screen} ${screen.hex}; ${box.width}x${box.height}`);
    console.log(`[${recipe.name}] cut out → ${vaultPath(result.animation)} + ${result.frames.length} frames`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * A crop card: cuts a box out of the picture that points to it, such as the
 * part of the office behind a character, for their portrait background.
 * `box: [x, y, w, h]` in that picture's pixels; `bleed` adds that many pixels
 * on every side (kept inside the picture). Free.
 */
async function runCrop(recipe, canvas) {
  if (recipe.references.length !== 1) throw new Error("draw one arrow from the picture to crop into this card");
  const picture = cleanSource(canvas, recipe.references[0]);
  const box = [].concat(recipe.fields.box ?? []).map(Number);
  if (box.length !== 4 || box.some((value) => !Number.isFinite(value))) throw new Error("set box: [x, y, w, h]");
  const bleed = Number(recipe.fields.bleed ?? 0);
  const { width, height } = await mediaSize(picture);
  const x = Math.max(0, Math.round(box[0] - bleed));
  const y = Math.max(0, Math.round(box[1] - bleed));
  const w = Math.min(width - x, Math.round(box[2] + 2 * bleed));
  const h = Math.min(height - y, Math.round(box[3] + 2 * bleed));
  if (DRY_RUN) {
    console.log(`\n[${recipe.name}] would crop ${relative(ROOT, picture)} to ${w}x${h} at ${x},${y} (free)`);
    return;
  }
  await update(recipe.nodeId, { status: "running" });
  await mkdir(outDir(recipe.name), { recursive: true });
  const out = join(outDir(recipe.name), `${recipe.name}.webp`);
  await cropImage(picture, out, { x, y, width: w, height: h });
  // A crunched picture's clean twin is cropped the same way.
  await cleanTwin(out, existsSync(twinOf(picture)) && (() => cropImage(twinOf(picture), twinOf(out), { x, y, width: w, height: h })));
  await update(recipe.nodeId, { status: "done", files: [vaultPath(out)] });
  console.log(`[${recipe.name}] cropped ${w}x${h} at ${x},${y} → ${vaultPath(out)}`);
}

async function runRecipe(recipe, canvas) {
  if (recipe.kind === "composite") return runComposite(recipe, canvas);
  if (recipe.kind === "crop") return runCrop(recipe, canvas);
  if (recipe.kind === "cutout") return runCutout(recipe, canvas);
  if (REFINISH) {
    if (DRY_RUN) console.log(`[${recipe.name}] would refinish from the saved original (free)`, crunchSettings(recipe) ?? "(no crunch)");
    else await refinish(recipe);
    return;
  }

  // Sources: a file card, or another recipe's clean original (else its output).
  const sourceFile = (source) => cleanSource(canvas, source);
  const images = new Map();
  for (const source of [recipe.start, recipe.end, ...(recipe.references ?? [])].filter(Boolean)) {
    const file = sourceFile(source);
    images.set(source, DRY_RUN ? `data:… (${file})` : await imageUri(file));
  }
  // LoRAs by library name or link (Civitai downloads get your Civitai key).
  const libraryLoras = readLoras(VAULT);
  const loraFor = (entry) => resolveLora(entry, libraryLoras, keyFor(ROOT, "civitai"));
  // A model you added to the library: on fal it is an endpoint with its own
  // fields; on Replicate it goes through the Replicate adapter.
  const added = readModels(VAULT).find((model) => model.id === recipe.fields.model);
  if (added?.service === "fal") {
    recipe = { ...recipe, fields: { ...recipe.fields, endpoint: added.endpoint, params: { ...(added.params ?? {}), ...(recipe.fields.params ?? {}) } } };
  }
  // A model on another service (Replicate, OpenAI, Google): the same prompt
  // and reference pictures go there, and the picture comes back the same way.
  const other = added?.service === "replicate" ? added : SERVICE_MODELS[recipe.fields.model];
  if (other) {
    const wanted = recipe.kind === "animate" ? "video" : recipe.kind;
    if (other.kind !== wanted) throw new Error(`${recipe.fields.model} is a ${other.kind} model; this is a ${recipe.kind} card`);
    const loras = [...new Map([...recipe.styles.flatMap((style) => [].concat(style.fields.lora ?? [])), ...[].concat(recipe.fields.lora ?? [])].map(loraFor).map((lora) => [lora.path, lora])).values()];
    const prompt = [...new Set(loras.map((lora) => lora.trigger).filter(Boolean)), recipePrompt(recipe)].join(", ");
    const references = recipe.kind === "animate" ? [images.get(recipe.start)].filter(Boolean) : (recipe.references ?? []).map((source) => images.get(source));
    if (DRY_RUN) {
      console.log(`\n[${recipe.name}] would call ${SERVICES[other.service].name} ${other.model} (about $${other.cost})`, { prompt, references: references.length, size: recipe.fields.size });
      return;
    }
    await update(recipe.nodeId, { status: "running" });
    console.log(`[${recipe.name}] ${SERVICES[other.service].name} ${other.model} …`);
    const result = await makePicture(ROOT, recipe.fields.model, { prompt, images: references, size: recipe.fields.size, seed: recipe.fields.seed, model: added ?? null, loras });
    await mkdir(sourceDir(recipe.name), { recursive: true });
    if (recipe.kind === "animate") {
      // A clip: kept as the clean original, then made a limited animation.
      if (!result.url) throw new Error("the service returned no clip");
      const clip = await download(result.url, sourcePath(recipe.name, "mp4"));
      const { animation, frames, video } = await finishAnimation(recipe, clip);
      await update(recipe.nodeId, { status: "done", files: [vaultPath(animation), vaultPath(video)] });
      console.log(`[${recipe.name}] done → ${vaultPath(animation)} + ${frames.length} frames`);
      return;
    }
    // The file type, so the converter reads it right: from the bytes, or the URL.
    const bytes = result.bytes;
    const ext = bytes
      ? (bytes[0] === 0x89 ? ".png" : bytes[0] === 0xff ? ".jpg" : bytes.subarray(8, 12).toString() === "WEBP" ? ".webp" : ".png")
      : extname(new URL(result.url).pathname) || ".png";
    const raw = join(sourceDir(recipe.name), `${recipe.name}.source-download${ext}`);
    if (result.url) await download(result.url, raw);
    else await writeFile(raw, bytes);
    const source = sourcePath(recipe.name, "png");
    await toPng(raw, source);
    await rm(raw, { force: true });
    const file = await finishImage(recipe, source);
    await update(recipe.nodeId, { status: "done", files: [vaultPath(file)] });
    console.log(`[${recipe.name}] done → ${vaultPath(file)}`);
    return;
  }
  const request = buildRequest(recipe, { resolveImage: (source) => images.get(source), resolveLora: loraFor });
  // A library fal model can name its own picture field, and may not take LoRAs.
  if (added?.service === "fal") {
    const from = recipe.kind === "edit" ? "image_urls" : recipe.kind === "animate" ? "image_url" : null;
    if (from && added.imageField && added.imageField !== from && request.input[from] !== undefined) {
      const value = request.input[from];
      delete request.input[from];
      request.input[added.imageField] = Array.isArray(value) && !/s$/.test(added.imageField) ? value[0] : value;
    }
    if (!added.loras) delete request.input.loras;
  }

  if (DRY_RUN) {
    console.log(`\n[${recipe.name}] would call ${request.endpoint}`);
    console.log(JSON.stringify(request.input, null, 2));
    if (recipe.kind === "image" || recipe.kind === "edit") console.log("then finish:", crunchSettings(recipe) ?? "(no crunch)");
    if (recipe.kind === "animate") console.log("then limited animation:", animationSettings(recipe.fields, recipe));
    return;
  }

  if (!KEY) throw new Error("No fal key: add it in the editor's Keys panel (or FAL_KEY in .env)");
  await update(recipe.nodeId, { status: "running" });
  console.log(`[${recipe.name}] ${request.endpoint} …`);
  const output = await runFal(request.endpoint, request.input, {
    key: KEY,
    onStatus: (status) => process.stdout.write(`  ${status}\r`)
  });
  await mkdir(sourceDir(recipe.name), { recursive: true });

  if (recipe.kind === "image" || recipe.kind === "edit") {
    const url = output.images?.[0]?.url;
    if (!url) throw new Error("fal returned no image");
    const raw = join(sourceDir(recipe.name), `${recipe.name}.source-download${extname(new URL(url, "http://x").pathname) || ".png"}`);
    await download(url, raw);
    const source = sourcePath(recipe.name, "png");
    if (raw.endsWith(".png")) await copyFile(raw, source);
    else await toPng(raw, source);
    await rm(raw, { force: true });
    const file = await finishImage(recipe, source);
    await update(recipe.nodeId, { status: "done", files: [vaultPath(file)] });
    console.log(`[${recipe.name}] done → ${vaultPath(file)}`);
    return;
  }

  const url = output.video?.url;
  if (!url) throw new Error("fal returned no video");
  const clip = await download(url, sourcePath(recipe.name, "mp4"));
  const { animation, frames, video } = await finishAnimation(recipe, clip);
  await update(recipe.nodeId, { status: "done", files: [vaultPath(animation), vaultPath(video)] });
  console.log(`[${recipe.name}] done → ${vaultPath(animation)}, ${vaultPath(video)} + ${frames.length} frames`);
}

// Composites of an animation run after it, so composites go last.
const ORDER = { image: 0, edit: 1, cutout: 2, crop: 2, animate: 3, composite: 4 };

async function runPending() {
  const canvas = await readCanvas();
  const recipes = readRecipes(canvas);
  // Images first, so an animation can start from a picture made in this run.
  const pending = recipes
    .filter((recipe) => (CARD ? recipe.name === CARD : recipe.status === "go") && recipe.kind !== "style")
    // Pictures first, then composites of them, then animations of either.
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  if (!pending.length) {
    if (CARD) console.log(`No recipe card named "${CARD}".`);
    else if (!WATCH) console.log('No cards set to "status: go".');
    return;
  }
  for (const recipe of pending) {
    try {
      if (recipe.error) throw new Error(recipe.error);
      await runRecipe(recipe, await readCanvas());
    } catch (error) {
      console.error(`[${recipe.name}] error: ${error.message}`);
      if (!DRY_RUN) await update(recipe.nodeId, { status: `error — ${error.message.replaceAll("\n", " ").slice(0, 160)}` });
    }
  }
}

await runPending();

if (WATCH) {
  console.log(`Watching ${vaultPath(CANVAS)}. Set a card to "status: go" to run it.`);
  let busy = false;
  let timer = null;
  // Watch the folder, not the file: Obsidian may save by replacing the file.
  watch(dirname(CANVAS), (_event, file) => {
    if (file !== basename(CANVAS)) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (busy) return;
      busy = true;
      try {
        await runPending();
      } finally {
        busy = false;
      }
    }, 400);
  });
}
