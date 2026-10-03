// Recipe cards on the asset canvas (ENGINE_SPEC.md 7.4). Pure functions:
// read recipes from a JSON Canvas, build fal requests, and write results back
// as cards. scripts/assets.mjs does the network and file work.
//
// A recipe is a text card:
//
//   ## gate-dawn          ← its name (also the output file name)
//   image                 ← kind: style, image, edit, cutout, animate, or composite
//   status: go            ← "go" runs it; the runner sets running / done / error
//   prompt: ...           ← the rest is YAML
//
// Arrows: a style card → a recipe adds its LoRAs and prompt words. An image
// (file card, or an image recipe) → an animate recipe is its first frame; an
// arrow labelled "end" is its last frame. With no end frame, a clip loops.
// An edit takes the pictures that point to it as references and changes
// them as its prompt says (same person, new mood or pose).
// A cutout keys the picture that points to it off its green or blue screen
// and keeps it transparent: a prop to layer over a scene (and, with
// `mirror: true`, its mirror image too). Made locally, with no AI call.
// A composite has an arrow labelled "room" and one or more labelled "actor"
// (actors on a green or blue screen); it is made locally, with no AI call.
import YAML from "yaml";

export const MODELS = Object.freeze({
  // FLUX.1 [dev]. Takes FLUX.1 LoRAs, such as Civitai "[FLUX]" style LoRAs.
  "flux-lora": { kind: "image", endpoint: "fal-ai/flux-lora" },
  // FLUX.2 [dev]. Needs FLUX.2 LoRAs; FLUX.1 LoRAs do not load here.
  "flux-2-lora": { kind: "image", endpoint: "fal-ai/flux-2/lora" },
  // Z-Image Turbo: cheap, and best for empty pre-rendered rooms.
  "z-image": { kind: "image", endpoint: "fal-ai/z-image/turbo" },
  // Krea 2 Turbo: the most 1990s-looking actors, for chroma-key shots.
  "krea-2": { kind: "image", endpoint: "fal-ai/krea-2/turbo" },
  // Edit models: same person or place, changed by the prompt.
  // Qwen Image Edit 2511 kept Arthur's face best in the sheet test (and has
  // an open licence); FLUX.2 [dev] edit is a little cheaper.
  "qwen-edit": { kind: "edit", endpoint: "fal-ai/qwen-image-edit-2511" },
  "flux2-edit": { kind: "edit", endpoint: "fal-ai/flux-2/edit" },
  // MiniMax H3 Max Turbo image-to-video: half the price of H3 at 480p
  // ($0.025/s on 2026-09-30), same first/last frame inputs.
  "h3-max-turbo": { kind: "video", endpoint: "minimax/h3-max-turbo/image-to-video" },
  // MiniMax H3 image-to-video, with an optional last frame.
  "minimax-h3": { kind: "video", endpoint: "minimax/h3/image-to-video" }
});
const DEFAULT_MODEL = { image: "flux-lora", edit: "qwen-edit", animate: "minimax-h3" };
const KINDS = new Set(["style", "image", "edit", "cutout", "crop", "animate", "composite"]);
const SIZE_PRESETS = new Set(["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"]);

/** Reads one text card as a recipe, or returns null if it is not one. */
export function parseCard(node) {
  if (node?.type !== "text") return null;
  const lines = String(node.text ?? "").split("\n");
  const title = lines[0]?.match(/^##\s+([\w.-]+)\s*$/);
  const kind = lines[1]?.trim().toLowerCase();
  if (!title || !KINDS.has(kind)) return null;
  let fields;
  let error = null;
  try {
    fields = YAML.parse(lines.slice(2).join("\n")) ?? {};
    if (typeof fields !== "object" || Array.isArray(fields)) throw new Error("expected key: value lines");
  } catch (parseError) {
    fields = {};
    error = `bad recipe: ${parseError.message.split("\n")[0]}`;
  }
  const status = String(fields.status ?? "").trim().toLowerCase();
  return { nodeId: node.id, name: title[1], kind, fields, status, error };
}

/** `url @0.8` or { path, scale } → { path, scale }. */
export function parseLora(value) {
  if (value && typeof value === "object") return { path: String(value.path), scale: Number(value.scale ?? 1) };
  const match = String(value).trim().match(/^(\S+)(?:\s+@\s*([\d.]+))?$/);
  if (!match) throw new Error(`bad lora "${value}" (use: <url> @0.8)`);
  return { path: match[1], scale: match[2] ? Number(match[2]) : 1 };
}

function parseSize(value) {
  if (value == null) return "landscape_16_9";
  if (SIZE_PRESETS.has(value)) return value;
  const match = String(value).match(/^(\d+)\s*x\s*(\d+)$/i);
  if (!match) throw new Error(`bad size "${value}" (use 1280x720 or ${[...SIZE_PRESETS].join(", ")})`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

const list = (value) => (value == null ? [] : [].concat(value));
const joinPrompt = (...parts) => parts.filter((part) => part && String(part).trim()).join(", ");

/** Every recipe on the canvas, with its arrows resolved. */
export function readRecipes(canvas) {
  const nodes = canvas?.nodes ?? [];
  const recipes = nodes.map(parseCard).filter(Boolean);
  const byNode = new Map(recipes.map((recipe) => [recipe.nodeId, recipe]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const names = new Map();
  for (const recipe of recipes) {
    if (names.has(recipe.name)) recipe.error ??= `two recipes are named "${recipe.name}"`;
    names.set(recipe.name, recipe);
    recipe.styles = [];
    recipe.start = null;
    recipe.end = null;
    recipe.room = null;
    recipe.actor = null;
    recipe.actors = [];
    recipe.references = [];
  }
  for (const edge of canvas?.edges ?? []) {
    const target = byNode.get(edge.toNode);
    if (!target) continue;
    const fromRecipe = byNode.get(edge.fromNode);
    const fromNode = nodeById.get(edge.fromNode);
    if (fromRecipe?.kind === "style") {
      target.styles.push(fromRecipe);
      continue;
    }
    if (!["edit", "cutout", "crop", "animate", "composite"].includes(target.kind)) continue;
    const source = fromRecipe
      ? { recipe: fromRecipe.name }
      : fromNode?.type === "file"
        ? { file: fromNode.file }
        : null;
    if (!source) continue;
    const label = String(edge.label ?? "").trim().toLowerCase();
    if (target.kind === "edit" || target.kind === "cutout" || target.kind === "crop") target.references.push(source);
    else if (target.kind === "composite") {
      if (label === "room") target.room = source;
      else if (label === "actor") {
        target.actors.push(source);
        target.actor ??= source;
      }
      else target.error ??= 'label the arrows into a composite "room" and "actor"';
    } else if (label === "end") target.end = source;
    else target.start = source;
  }
  return recipes;
}

/**
 * The fal request for a recipe. `resolveImage` turns a start/end source into
 * a URL the API can read (the runner uses data: URIs for local files).
 */
export function buildRequest(recipe, { resolveImage = (source) => source.file ?? source.recipe } = {}) {
  const fields = recipe.fields;
  const modelName = fields.model ?? DEFAULT_MODEL[recipe.kind];
  const model = MODELS[modelName];
  const endpoint = fields.endpoint ?? model?.endpoint;
  if (!endpoint) throw new Error(`unknown model "${modelName}" (use ${Object.keys(MODELS).join(", ")}, or set endpoint:)`);
  const styles = recipe.styles.map((style) => style.fields);
  // A style `template` wraps the recipe prompt, for LoRAs trained on a
  // fixed caption: "… The scene depicts {prompt}".
  const wrapped = styles.reduce(
    (text, style) => (style.template && text ? String(style.template).replace("{prompt}", text) : text),
    fields.prompt
  );
  const prompt = joinPrompt(...styles.map((style) => style.prefix), wrapped, ...styles.map((style) => style.suffix));
  if (!prompt) throw new Error("add a prompt: line");

  if (recipe.kind === "image") {
    const loras = [...styles.flatMap((style) => list(style.lora)), ...list(fields.lora)].map(parseLora);
    return {
      endpoint,
      input: {
        prompt,
        image_size: parseSize(fields.size),
        ...(loras.length ? { loras } : {}),
        ...(fields.seed != null ? { seed: Number(fields.seed) } : {}),
        ...(fields.steps != null ? { num_inference_steps: Number(fields.steps) } : {}),
        ...(fields.guidance != null ? { guidance_scale: Number(fields.guidance) } : {}),
        num_images: 1,
        output_format: "png",
        ...(fields.params ?? {})
      }
    };
  }

  if (recipe.kind === "edit") {
    if (!recipe.references.length) throw new Error("draw an arrow from the picture to edit into this card");
    return {
      endpoint,
      input: {
        prompt,
        image_urls: recipe.references.map(resolveImage),
        image_size: parseSize(fields.size ?? "landscape_4_3"),
        ...(fields.seed != null ? { seed: Number(fields.seed) } : {}),
        ...(fields.steps != null ? { num_inference_steps: Number(fields.steps) } : {}),
        ...(fields.guidance != null ? { guidance_scale: Number(fields.guidance) } : {}),
        num_images: 1,
        output_format: "png",
        ...(fields.params ?? {})
      }
    };
  }

  if (recipe.kind === "animate") {
    if (!recipe.start) throw new Error("draw an arrow from an image to this card (its first frame)");
    const start = resolveImage(recipe.start);
    const loop = fields.loop !== false;
    const end = recipe.end ? resolveImage(recipe.end) : loop ? start : null;
    return {
      endpoint,
      input: {
        prompt,
        image_url: start,
        ...(end ? { end_image_url: end } : {}),
        duration: Number(fields.seconds ?? 5),
        resolution: fields.resolution ?? "480P",
        prompt_expansion_mode: fields.expand ?? "disabled",
        ...(fields.seed != null ? { seed: Number(fields.seed) } : {}),
        ...(fields.params ?? {})
      }
    };
  }
  throw new Error("style cards are not run; draw an arrow from them to a recipe");
}

/**
 * The crunch finish (see lib/limited-animation.mjs crunch): the recipe's own
 * `crunch:` / `jpeg:` / `crunchFilter:`, or else its style's. `crunch: off`
 * turns it off for one recipe.
 */
export function crunchSettings(recipe) {
  const pick = (key) => recipe.fields[key] ?? recipe.styles?.map((style) => style.fields[key]).find((value) => value != null);
  const factor = pick("crunch");
  if (factor == null || factor === false || factor === "off" || Number(factor) <= 1) return null;
  return { factor: Number(factor), quality: Number(pick("jpeg") ?? 50), filter: pick("crunchFilter") ?? "neighbor" };
}

/**
 * Composite placement: seeded random values (see lib/composite.mjs
 * chooseParameters), with any the card sets itself taking priority.
 * `height` and `x` are shares of the frame (0–1).
 */
export function compositeOverrides(fields) {
  const number = (value) => (value == null ? undefined : Number(value));
  const overrides = {
    heightShare: number(fields.height),
    xCentre: number(fields.x),
    overhang: number(fields.overhang),
    brightness: number(fields.brightness),
    contrast: number(fields.contrast),
    temperature: number(fields.temperature),
    feather: number(fields.feather),
    shadow: fields.shadow == null ? undefined : fields.shadow === true
  };
  return {
    seed: Number(fields.seed ?? 1),
    shot: fields.shot === "full" ? "full" : "waist-up",
    align: fields.align === true,
    overrides: Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined))
  };
}

/** The settings for turning a clip into limited animation. */
export function animationSettings(fields, recipe = null) {
  return {
    crunch: recipe ? crunchSettings(recipe) : null,
    frames: Number(fields.frames ?? 6),
    fps: Number(fields.fps ?? 8),
    from: Number(fields.from ?? 0),
    to: fields.to != null ? Number(fields.to) : null,
    colors: fields.colors != null ? Number(fields.colors) : 0,
    width: fields.width != null ? Number(fields.width) : null,
    pingpong: fields.pingpong === true
  };
}

/** Card colours (Obsidian canvas presets) that show a recipe's state. */
export const STATUS_COLORS = Object.freeze({ running: "3", done: "4", error: "1" });

/** Sets the `status:` line of a card's text, keeping everything else. */
export function setStatus(text, status) {
  const lines = String(text).split("\n");
  const index = lines.findIndex((line, i) => i >= 2 && /^status\s*:/i.test(line));
  // Error messages can hold colons and quotes; quote them so the card's
  // settings still read as YAML.
  const value = /^[\w -]+$/.test(String(status)) ? status : JSON.stringify(String(status));
  const line = `status: ${value}`;
  if (index >= 0) lines[index] = line;
  else lines.splice(2, 0, line);
  return lines.join("\n");
}

/**
 * Returns a new canvas with the recipe's status updated and, when files are
 * given, its result cards (replacing the ones from an earlier run).
 */
export function applyResult(canvas, nodeId, { status, files = [] }) {
  const color = STATUS_COLORS[String(status).split(/\s/)[0]];
  const nodes = (canvas.nodes ?? []).map((node) =>
    node.id === nodeId ? { ...node, text: setStatus(node.text, status), ...(color ? { color } : {}) } : node
  );
  let edges = canvas.edges ?? [];
  if (files.length) {
    const prefix = `made-${nodeId}-`;
    const card = nodes.find((node) => node.id === nodeId);
    const kept = nodes.filter((node) => !node.id.startsWith(prefix));
    edges = edges.filter((edge) => !edge.toNode.startsWith(prefix));
    const size = 240;
    const made = files.map((file, index) => ({
      id: `${prefix}${index + 1}`,
      type: "file",
      file,
      x: card.x + card.width + 80 + index * (size + 20),
      y: card.y,
      width: size,
      height: Math.round(size * 0.5625)
    }));
    return {
      ...canvas,
      nodes: [...kept, ...made],
      edges: [
        ...edges,
        ...made.map((node) => ({ id: `${node.id}-edge`, fromNode: nodeId, fromSide: "right", toNode: node.id, toSide: "left", toEnd: "arrow", label: "made" }))
      ]
    };
  }
  return { ...canvas, nodes, edges };
}

/** The newest output file of a recipe, from its "made" cards. */
export function latestOutput(canvas, recipe) {
  const made = (canvas.nodes ?? []).filter((node) => node.id.startsWith(`made-${recipe.nodeId}-`) && node.type === "file");
  return made[0]?.file ?? null;
}
