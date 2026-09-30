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
// Needs FAL_KEY in .env. Results go to game/assets/generated/ and appear on
// the canvas as cards next to their recipe.
import { watch } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv } from "../lib/env.mjs";
import { animationSettings, applyResult, buildRequest, compositeOverrides, crunchSettings, latestOutput, readRecipes } from "../lib/asset-canvas.mjs";
import { chooseParameters, composite, key, keyFrames, seeded } from "../lib/composite.mjs";
import { download, runFal } from "../lib/fal.mjs";
import { crunch, ensureMinSize, extractFrames, finishFrames, makeLimitedAnimation, mediaSize, toJpeg, toPng, toWebp } from "../lib/limited-animation.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = join(ROOT, "game");
const CANVAS = join(VAULT, process.argv.find((arg) => arg.endsWith(".canvas")) ?? "Assets.canvas");
// Every recipe gets its own folder: assets/generated/<name>/ holds the
// finished files, and <name>/_source/ the clean originals (the leading
// underscore keeps them out of the game build; the ".source" ending keeps
// file names unique in the vault, as Obsidian links need).
const GENERATED = join(VAULT, "assets", "generated");
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

async function runRecipe(recipe, canvas) {
  if (recipe.kind === "composite") return runComposite(recipe, canvas);
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
  const request = buildRequest(recipe, { resolveImage: (source) => images.get(source) });

  if (DRY_RUN) {
    console.log(`\n[${recipe.name}] would call ${request.endpoint}`);
    console.log(JSON.stringify(request.input, null, 2));
    if (recipe.kind === "image" || recipe.kind === "edit") console.log("then finish:", crunchSettings(recipe) ?? "(no crunch)");
    if (recipe.kind === "animate") console.log("then limited animation:", animationSettings(recipe.fields, recipe));
    return;
  }

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
const ORDER = { image: 0, edit: 1, animate: 2, composite: 3 };

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

if (!KEY && !DRY_RUN && !REFINISH) {
  console.error("FAL_KEY is not set. Add FAL_KEY=your-key to .env, or use --dry-run.");
  process.exit(1);
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
