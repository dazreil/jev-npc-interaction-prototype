// AI services besides fal: their keys, their models, and one small adapter
// each. The asset runner (scripts/assets.mjs) sends a card here when its
// model belongs to another service; scripts/voices.mjs sends voices to
// ElevenLabs. Keys live in .env (never in the vault, never in the page).
//
// Prices are estimates for one picture at about 1024 pixels (checked
// 2026-10-04); a service's own bill is the truth.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readEnv } from "./env.mjs";

export const SERVICES = Object.freeze({
  jev: { name: "Jev (TypeSafe)", env: "TYPESAFE_API_KEY", site: "https://console.typesafe.ai/", uses: "how characters decide what to do (the Mock is used without it)" },
  fal: { name: "fal", env: "FAL_KEY", site: "https://fal.ai/dashboard/keys", uses: "pictures, video, Kokoro voices" },
  replicate: { name: "Replicate", env: "REPLICATE_API_TOKEN", site: "https://replicate.com/account/api-tokens", uses: "pictures and edits (FLUX)" },
  openai: { name: "OpenAI", env: "OPENAI_API_KEY", site: "https://platform.openai.com/api-keys", uses: "pictures and edits (GPT Image)" },
  retrodiffusion: { name: "RetroDiffusion", env: "RETRODIFFUSION_API_KEY", site: "https://www.retrodiffusion.ai/app/devtools", uses: "pixel-art pictures and edits" },
  google: { name: "Google", env: "GEMINI_API_KEY", site: "https://aistudio.google.com/apikey", uses: "pictures and edits (Nano Banana)" },
  elevenlabs: { name: "ElevenLabs", env: "ELEVENLABS_API_KEY", site: "https://elevenlabs.io/app/settings/api-keys", uses: "voices, with accents" },
  comfy: { name: "Comfy Cloud", env: "COMFY_API_KEY", site: "https://platform.comfy.org/profile/api-keys", uses: "your ComfyUI workflows (needs a paid Comfy Cloud plan)" },
  civitai: { name: "Civitai", env: "CIVITAI_API_TOKEN", site: "https://civitai.com/user/account", uses: "LoRAs that need a login (added to their link)" }
});

/** Pages the Library opens in your browser: where to get keys, models and LoRAs. */
export const LIBRARY_LINKS = Object.freeze({
  falModels: "https://fal.ai/models",
  replicateModels: "https://replicate.com/explore",
  civitaiLoras: "https://civitai.com/models?types=LORA",
  huggingfaceLoras: "https://huggingface.co/models?other=lora"
});

/** Models on the other services, for the model lists (fal's are in asset-canvas MODELS). */
export const SERVICE_MODELS = Object.freeze({
  "rd-fast": { service: "retrodiffusion", kind: "image", model: "rd_fast__default", cost: 0.03, per: "picture", maxSize: 384, minSize: 64 },
  "rd-plus": { service: "retrodiffusion", kind: "image", model: "rd_plus__default", cost: 0.06, per: "picture", maxSize: 384, minSize: 64 },
  "rd-pro": { service: "retrodiffusion", kind: "image", model: "rd_pro__default", cost: 0.18, per: "picture", maxSize: 256, minSize: 12 },
  "rd-pro-edit": { service: "retrodiffusion", kind: "edit", model: "rd_pro__edit", cost: 0.18, per: "picture", maxSize: 256, minSize: 64 },
  "flux-schnell": { service: "replicate", kind: "image", model: "black-forest-labs/flux-schnell", cost: 0.003, per: "picture" },
  "flux-1.1-pro": { service: "replicate", kind: "image", model: "black-forest-labs/flux-1.1-pro", cost: 0.04, per: "picture" },
  "flux-kontext-pro": { service: "replicate", kind: "edit", model: "black-forest-labs/flux-kontext-pro", cost: 0.04, per: "picture" },
  "gpt-image-2": { service: "openai", kind: "image", model: "gpt-image-2", cost: 0.04, per: "picture" },
  "gpt-image-2.5-flare": { service: "openai", kind: "image", model: "gpt-image-2.5-flare", cost: 0.08, per: "picture" },
  "gpt-image-2-edit": { service: "openai", kind: "edit", model: "gpt-image-2", cost: 0.05, per: "picture" },
  "gpt-image-2.5-sunburst": { service: "openai", kind: "edit", model: "gpt-image-2.5-sunburst", cost: 0.09, per: "picture" },
  "nano-banana-2": { service: "google", kind: "image", model: "gemini-3.1-flash-image", cost: 0.067, per: "picture" },
  "nano-banana-2-edit": { service: "google", kind: "edit", model: "gemini-3.1-flash-image", cost: 0.067, per: "picture" },
  "nano-banana-2-lite-edit": { service: "google", kind: "edit", model: "gemini-3.1-flash-lite-image", cost: 0.034, per: "picture" },
  "nano-banana-pro-edit": { service: "google", kind: "edit", model: "gemini-3-pro-image", cost: 0.134, per: "picture" }
});

/** ElevenLabs speech models, cheapest last; the price is per 1,000 characters. */
export const ELEVENLABS_MODELS = Object.freeze({
  eleven_multilingual_v2: 0.1,
  eleven_flash_v2_5: 0.05
});

export const keyFor = (root, service) => readEnv(root, SERVICES[service]?.env ?? "");

/** Which services have a key (never the key itself). */
export function keyStatus(root) {
  return Object.entries(SERVICES).map(([id, service]) => ({ id, ...service, hasKey: Boolean(keyFor(root, id)) }));
}

/** Sets (or, with an empty key, removes) a service's key in .env, and in this process. */
export function setKey(root, service, key) {
  const env = SERVICES[service]?.env;
  if (!env) throw new Error(`Unknown service ${service}`);
  const value = String(key ?? "").trim();
  if (/[\r\n]/.test(value)) throw new Error("A key is one line.");
  const file = join(root, ".env");
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    // No .env yet: it is made now.
  }
  const line = new RegExp(`^\\s*${env}\\s*=.*$`, "m");
  if (value) text = line.test(text) ? text.replace(line, `${env}=${value}`) : `${text.replace(/\n?$/, "\n")}${env}=${value}\n`;
  else text = text.replace(new RegExp(`^\\s*${env}\\s*=.*\\n?`, "m"), "");
  writeFileSync(file, text, { mode: 0o600 });
  if (value) process.env[env] = value;
  else delete process.env[env];
}

/** A free call that only checks the key works. */
export async function testKey(root, service) {
  const key = keyFor(root, service);
  if (!key) return { ok: false, message: "No key set." };
  const checks = {
    fal: null,
    // TypeSafe has no free key check: an empty request is refused at once for
    // a wrong key, and answered "bad request" for a good one, with no work done.
    jev: async () => {
      const response = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: "{}" });
      return response.status === 401 || response.status === 403 ? response : new Response(null, { status: 200 });
    },
    comfy: () => fetch("https://cloud.comfy.org/api/object_info", { headers: { "X-API-Key": key } }),
    civitai: () => fetch("https://civitai.com/api/v1/models?limit=1", { headers: { Authorization: `Bearer ${key}` } }),
    retrodiffusion: () => fetch("https://api.retrodiffusion.ai/v2/inferences/credits", { headers: { "X-RD-Token": key } }),
    replicate: () => fetch("https://api.replicate.com/v1/account", { headers: { Authorization: `Bearer ${key}` } }),
    openai: () => fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }),
    google: () => fetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": key } }),
    elevenlabs: () => fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } })
  };
  if (!checks[service]) return { ok: true, message: "Set. fal has no free check; it is tested when a card runs." };
  try {
    const response = await checks[service]();
    return response.ok ? { ok: true, message: "The key works." } : { ok: false, message: `The service said ${response.status} ${response.statusText}.` };
  } catch (error) {
    return { ok: false, message: `Could not reach the service: ${error.message}` };
  }
}

// ------------------------------------------------------------------ pictures

const dataParts = (uri) => {
  const match = String(uri).match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error("expected a data: URI");
  return { mime: match[1], data: match[2] };
};

/** "1024x768" (or a fal preset) → its width and height. */
function sizeOf(size) {
  const match = String(size ?? "").match(/^(\d+)\s*x\s*(\d+)$/i);
  if (match) return { width: Number(match[1]), height: Number(match[2]) };
  if (/portrait/.test(size ?? "")) return { width: 768, height: 1024 };
  if (/square/.test(size ?? "")) return { width: 1024, height: 1024 };
  return { width: 1024, height: 768 };
}

/** The nearest of the usual aspect ratios, as "4:3". */
function aspect(size) {
  const { width, height } = sizeOf(size);
  const ratios = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"];
  return ratios.reduce((best, ratio) => {
    const [w, h] = ratio.split(":").map(Number);
    return Math.abs(w / h - width / height) < Math.abs(best[0] / best[1] - width / height) ? [w, h] : best;
  }, [1, 1]).join(":");
}

async function failText(response) {
  const body = await response.text();
  return `${response.status} ${body.slice(0, 300)}`;
}

/**
 * Makes one picture with another service.
 * @param id a SERVICE_MODELS id; prompt the full prompt; images data: URIs
 *   (edits); size "1024x768"; seed optional
 * @returns { bytes: Buffer } or { url }
 */
export async function makePicture(root, id, { prompt, images = [], size, seed, model: given = null, loras = [] }) {
  // A built-in model by id, or one from the game's library (given).
  const model = given ?? SERVICE_MODELS[id];
  if (!model) throw new Error(`Unknown model ${id}`);
  const key = keyFor(root, model.service);
  if (!key) throw new Error(`No ${SERVICES[model.service].name} key: add it in the editor's Keys panel`);
  if (model.kind === "edit" && !images.length) throw new Error("draw an arrow from the picture to edit into this card");
  if (model.service === "retrodiffusion") return retroDiffusion(root, key, model, { prompt, images, size, seed });
  if (model.service === "comfy") {
    const { runWorkflow } = await import("./comfy.mjs");
    return runWorkflow(key, model, { prompt, images, seed, size });
  }
  return { replicate, openai, google }[model.service](key, model, { prompt, images, size, seed, loras });
}

// V2 admissions are paid once; keep the admission key and task id on disk
// so an interrupted job can be recovered through RetroDiffusion's history.
async function retroDiffusion(root, key, model, { prompt, images, size, seed }) {
  const native = sizeOf(size ?? "256x256");
  const scale = Math.min(1, model.maxSize / Math.max(native.width, native.height));
  const width = Math.round(native.width * scale);
  const height = Math.round(native.height * scale);
  if (width < model.minSize || height < model.minSize) throw new Error(`RetroDiffusion: use a size with both dimensions at least ${model.minSize}px and at most ${model.maxSize}px (larger sizes are scaled proportionally).`);
  if (images.length > 9) throw new Error("RetroDiffusion: at most nine reference pictures.");
  const references = images.map((uri) => dataParts(uri).data);
  const payload = { prompt, prompt_style: model.model, width, height, num_images: 1,
    ...(seed != null ? { seed: Number(seed) } : {}),
    ...(model.kind === "edit" ? { input_image: references[0], ...(references.length > 1 ? { reference_images: references.slice(1) } : {}) } :
      references.length && model.model.startsWith("rd_pro__") ? { reference_images: references } : {}) };
  if (references.length && model.kind === "image" && !model.model.startsWith("rd_pro__")) throw new Error("RetroDiffusion: choose rd-pro for reference pictures.");
  const base = "https://api.retrodiffusion.ai/v2/inferences";
  const headers = { "X-RD-Token": key, "Content-Type": "application/json" };
  const admission = randomUUID();
  const directory = join(root, "build", "retrodiffusion-jobs");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${admission}.json`);
  const save = (state) => writeFileSync(file, JSON.stringify({ admission, payload, ...state }), { mode: 0o600 });
  save({ status: "submitting" });
  let response = await fetch(base, { method: "POST", headers: { ...headers, "Idempotency-Key": admission }, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`RetroDiffusion: ${await failText(response)}`);
  const accepted = await response.json();
  if (!accepted.task_id) throw new Error("RetroDiffusion returned no task id");
  const taskId = accepted.task_id;
  save({ task_id: taskId, status: "accepted" });
  for (let tries = 0; tries < 300; tries += 1) {
    response = await fetch(`${base}/tasks/${encodeURIComponent(taskId)}`, { headers, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`RetroDiffusion task ${taskId}: ${await failText(response)}`);
    const task = await response.json();
    if (task.status === "succeeded") {
      save({ task_id: taskId, status: task.status });
      const result = task.result;
      if (result?.base64_images?.[0]) return { bytes: Buffer.from(result.base64_images[0], "base64") };
      if (result?.output_urls?.[0]) return { url: result.output_urls[0] };
      throw new Error("RetroDiffusion returned no picture");
    }
    if (task.status === "failed") {
      save({ task_id: taskId, status: task.status, error: task.error });
      throw new Error(`RetroDiffusion: ${JSON.stringify(task.error ?? "generation failed")}`);
    }
    if (!["pending", "running"].includes(task.status)) throw new Error(`RetroDiffusion: unexpected task status ${task.status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`RetroDiffusion task ${taskId} is still running; recover it in your RetroDiffusion history. Admission saved at ${file}`);
}

async function replicate(key, model, { prompt, images, size, seed, loras = [] }) {
  // A library model can name its own picture field (imageField) and extra
  // inputs (params); a LoRA goes in as lora_weights / lora_scale.
  const imageField = model.imageField ?? (model.kind === "video" ? "start_image" : "input_image");
  const input = {
    prompt,
    ...(model.kind === "edit" || model.kind === "video" ? { [imageField]: images[0] } : {}),
    ...(model.kind === "edit" ? { aspect_ratio: "match_input_image" } : { aspect_ratio: aspect(size) }),
    ...(model.kind === "video" ? {} : { output_format: "png" }),
    ...(seed != null ? { seed: Number(seed) } : {}),
    ...(loras.length ? { lora_weights: loras[0].path, lora_scale: loras[0].scale } : {}),
    ...(model.params ?? {})
  };
  // "owner/name" runs the official model; "owner/name:version" a version.
  const [name, version] = String(model.model).split(":");
  let response = await fetch(version ? "https://api.replicate.com/v1/predictions" : `https://api.replicate.com/v1/models/${name}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "wait=60" },
    body: JSON.stringify(version ? { version, input } : { input })
  });
  if (!response.ok) throw new Error(`Replicate: ${await failText(response)}`);
  let prediction = await response.json();
  for (let tries = 0; !["succeeded", "failed", "canceled"].includes(prediction.status) && tries < 600; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    response = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${key}` } });
    prediction = await response.json();
  }
  if (prediction.status !== "succeeded") throw new Error(`Replicate: ${prediction.status} ${prediction.error ?? ""}`.trim());
  const url = [].concat(prediction.output)[0];
  if (!url) throw new Error("Replicate returned no picture");
  return { url };
}

async function openai(key, model, { prompt, images, size }) {
  const { width, height } = sizeOf(size);
  const shape = width > height ? "1536x1024" : height > width ? "1024x1536" : "1024x1024";
  let response;
  if (model.kind === "edit") {
    const form = new FormData();
    form.append("model", model.model);
    form.append("prompt", prompt);
    form.append("size", shape);
    images.forEach((uri, index) => {
      const { mime, data } = dataParts(uri);
      form.append("image[]", new Blob([Buffer.from(data, "base64")], { type: mime }), `reference-${index + 1}.${mime.split("/")[1] ?? "png"}`);
    });
    response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: model.model, prompt, size: shape, quality: "medium", n: 1 })
    });
  }
  if (!response.ok) throw new Error(`OpenAI: ${await failText(response)}`);
  const json = await response.json();
  const data = json.data?.[0]?.b64_json;
  if (data) return { bytes: Buffer.from(data, "base64") };
  if (json.data?.[0]?.url) return { url: json.data[0].url };
  throw new Error("OpenAI returned no picture");
}

/** Finds the first image block anywhere in a response. */
function findImage(value) {
  if (!value || typeof value !== "object") return null;
  if (value.type === "image" && (value.data || value.uri)) return value;
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    const found = findImage(item);
    if (found) return found;
  }
  return null;
}

async function google(key, model, { prompt, images, size }) {
  const headers = { "x-goog-api-key": key, "Content-Type": "application/json" };
  const input = [{ type: "text", text: prompt }, ...images.map((uri) => {
    const { mime, data } = dataParts(uri);
    return { type: "image", mime_type: mime, data };
  })];
  let response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers,
    body: JSON.stringify({ model: model.model, input, response_format: { type: "image", mime_type: "image/png", aspect_ratio: aspect(size) } })
  });
  if (!response.ok) throw new Error(`Google: ${await failText(response)}`);
  let interaction = await response.json();
  for (let tries = 0; ["in_progress", "queued"].includes(interaction.status) && tries < 120; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions/${interaction.id}`, { headers });
    interaction = await response.json();
  }
  if (interaction.status && interaction.status !== "completed") throw new Error(`Google: ${interaction.status}`);
  const image = findImage(interaction.output_image ?? interaction.steps ?? interaction);
  if (image?.data) return { bytes: Buffer.from(image.data, "base64") };
  if (image?.uri) return { url: image.uri };
  throw new Error("Google returned no picture");
}

// ------------------------------------------------------------------ voices

/** One line in an ElevenLabs voice, as MP3 bytes. */
export async function elevenLabsSpeech(root, { text, voice, model = "eleven_multilingual_v2" }) {
  const key = keyFor(root, "elevenlabs");
  if (!key) throw new Error("No ElevenLabs key: add it in the editor's Keys panel");
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model })
  });
  if (!response.ok) throw new Error(`ElevenLabs: ${await failText(response)}`);
  return Buffer.from(await response.arrayBuffer());
}

/** The voices in your ElevenLabs account (name and id, with accent when given). */
export async function elevenLabsVoices(root) {
  const key = keyFor(root, "elevenlabs");
  if (!key) return [];
  const response = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
  if (!response.ok) throw new Error(`ElevenLabs: ${await failText(response)}`);
  const { voices = [] } = await response.json();
  return voices.map((voice) => ({ id: voice.voice_id, name: voice.name, accent: voice.labels?.accent ?? null, gender: voice.labels?.gender ?? null }));
}
