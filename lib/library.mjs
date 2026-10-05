// The game's library: models you added (hosted on fal or Replicate, or a
// ComfyUI workflow run on Comfy Cloud) and
// LoRAs (from Civitai, Hugging Face or any direct link). Kept in the game
// folder as library/models.json and library/loras.json; edited in the app
// (Cmd+E → Library). The asset runner and the voices script read them.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { guessInputs } from "./comfy.mjs";
import { join } from "node:path";

export const MODEL_KINDS = ["image", "edit", "video", "voice"];
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function readJson(file) {
  if (!existsSync(file)) return [];
  const value = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(value) ? value : [];
}

export const readModels = (vaultDir) => readJson(join(vaultDir, "library", "models.json"));
export const readLoras = (vaultDir) => readJson(join(vaultDir, "library", "loras.json"));
/** A ComfyUI model's workflow (library/workflows/<id>.json), ready to run. */
export const readWorkflow = (vaultDir, model) => JSON.parse(readFileSync(join(vaultDir, model.workflow), "utf8"));
const INPUT_PATH = /^[\w-]+\.[\w.-]+$/;

/** A model you added, checked: where it runs, what it makes, and its fields. */
export function checkModel(model) {
  const problems = [];
  if (!ID.test(model.id ?? "")) problems.push("an id of small letters, numbers, dots or dashes");
  if (!["fal", "replicate", "comfy"].includes(model.service)) problems.push('a service: "fal", "replicate" or "comfy"');
  if (!MODEL_KINDS.includes(model.kind)) problems.push(`a kind: ${MODEL_KINDS.join(", ")}`);
  if (model.service === "fal" && !/^[\w-]+\/[\w./-]+$/.test(model.endpoint ?? "")) problems.push("a fal endpoint, such as fal-ai/flux/dev");
  if (model.service === "replicate" && !/^[\w.-]+\/[\w.-]+(:[0-9a-f]{64})?$/.test(model.model ?? "")) problems.push("a Replicate model, such as black-forest-labs/flux-dev (or owner/name:version)");
  if (model.service === "comfy") {
    if (!["image", "edit", "video"].includes(model.kind)) problems.push("a kind of image, edit or video (a workflow makes no voices)");
    if (!model.workflow) problems.push("a workflow, exported from ComfyUI with Export (API)");
    const inputs = model.inputs ?? {};
    if (!inputs.prompt) problems.push("where the prompt goes (node id.input, such as 6.text)");
    if ((model.kind === "edit" || model.kind === "video") && !inputs.image) problems.push("where the input picture goes (a LoadImage node, such as 10.image)");
    for (const [name, path] of Object.entries(inputs)) {
      if (path && name !== "output" && !INPUT_PATH.test(path)) problems.push(`${name} as node id.input (such as 3.seed), not "${path}"`);
    }
  }
  if (model.cost != null && !(Number(model.cost) >= 0)) problems.push("a cost of 0 or more");
  if (model.params != null && (typeof model.params !== "object" || Array.isArray(model.params))) problems.push("params as an object");
  return problems;
}

/**
 * A LoRA page link as the link to the file itself, which fal and Replicate
 * fetch when a card runs (a web page is not a file they can load):
 *   civitai.com/models/123?modelVersionId=456 → civitai.com/api/download/models/456
 *   huggingface.co/<repo>/blob/main/x.safetensors → .../resolve/main/x.safetensors
 */
export function loraDownloadUrl(link) {
  let url;
  try {
    url = new URL(String(link).trim());
  } catch {
    throw new Error(`Not a link: ${link}`);
  }
  if (/(^|\.)civitai\.com$/.test(url.hostname)) {
    if (url.pathname.startsWith("/api/download/models/")) return `https://civitai.com${url.pathname}`;
    const version = url.searchParams.get("modelVersionId");
    if (version) return `https://civitai.com/api/download/models/${version}`;
    throw new Error("For a Civitai LoRA, open the version you want and copy the link with ?modelVersionId=… (or its download link)");
  }
  if (/(^|\.)huggingface\.co$/.test(url.hostname)) {
    const path = url.pathname.replace("/blob/", "/resolve/");
    if (!/\/resolve\//.test(path) || !/\.safetensors$/i.test(path)) throw new Error("For a Hugging Face LoRA, link the .safetensors file itself");
    return `https://huggingface.co${path}`;
  }
  return url.toString();
}

/** A LoRA, checked, with its direct link and where it is from. */
export function checkLora(lora) {
  const problems = [];
  if (!ID.test(lora.id ?? "")) problems.push("an id of small letters, numbers, dots or dashes");
  try {
    loraDownloadUrl(lora.link ?? lora.url);
  } catch (error) {
    problems.push(error.message);
  }
  if (lora.scale != null && !(Number(lora.scale) >= -4 && Number(lora.scale) <= 4)) problems.push("a strength between -4 and 4");
  return problems;
}

/** Saves the library (either list), after checking every entry. */
export async function saveLibrary(vaultDir, { models, loras }) {
  const folder = join(vaultDir, "library");
  await mkdir(folder, { recursive: true });
  const saved = [];
  // A ComfyUI model's workflow is kept in its own file; the list keeps its path.
  if (Array.isArray(models)) {
    models = await Promise.all(models.map(async (model) => {
      if (model.service !== "comfy" || !model.workflow || typeof model.workflow !== "object") return model;
      const graph = model.workflow;
      const inputs = { ...guessInputs(graph), ...Object.fromEntries(Object.entries(model.inputs ?? {}).filter(([, value]) => value)) };
      for (const [name, path] of Object.entries(inputs)) {
        const node = String(path ?? "").split(".")[0];
        if (path && !graph[node]) throw new Error(`${model.id}: the workflow has no node ${node} (for ${name})`);
      }
      if (!ID.test(model.id ?? "")) return model;
      await mkdir(join(folder, "workflows"), { recursive: true });
      await writeFile(join(folder, "workflows", `${model.id}.json`), JSON.stringify(graph, null, "\t") + "\n");
      saved.push(`library/workflows/${model.id}.json`);
      return { ...model, workflow: `library/workflows/${model.id}.json`, inputs: Object.fromEntries(Object.entries(inputs).filter(([, value]) => value)) };
    }));
  }
  for (const [name, list, check, tidy] of [
    ["models", models, checkModel, (model) => ({ ...model, cost: model.cost == null ? null : Number(model.cost) })],
    ["loras", loras, checkLora, (lora) => {
      const link = lora.link ?? lora.url;
      const source = /civitai\.com/.test(link) ? "civitai" : /huggingface\.co/.test(link) ? "huggingface" : "link";
      return { ...lora, link, url: loraDownloadUrl(link), source, scale: Number(lora.scale ?? 1) };
    }]
  ]) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw new Error(`${name} must be a list`);
    const ids = new Set();
    for (const entry of list) {
      const problems = check(entry);
      if (ids.has(entry.id)) problems.push("an id no other entry has");
      ids.add(entry.id);
      if (problems.length) throw new Error(`${entry.id || "a new entry"} needs ${problems.join("; ")}`);
    }
    await writeFile(join(folder, `${name}.json`), JSON.stringify(list.map(tidy), null, "\t") + "\n");
    saved.push(`library/${name}.json`);
  }
  return { saved };
}

/**
 * A card's or style's `lora:` entry as fal's { path, scale }: a library id
 * (with its strength), or a link. Nothing is downloaded here: the service
 * fetches the file. Civitai file links get your Civitai key, when you set one,
 * so LoRAs that need a login load on the service too.
 */
export function resolveLora(entry, loras, civitaiKey = null) {
  const [, name, scale] = String(entry).trim().match(/^(\S+)(?:\s+@\s*([-\d.]+))?$/) ?? [];
  if (!name) throw new Error(`bad lora "${entry}" (use: <id or link> @0.8)`);
  const known = loras.find((lora) => lora.id === name);
  let path = known ? known.url : loraDownloadUrl(name);
  if (civitaiKey && /civitai\.com\/api\/download\//.test(path)) path += `${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(civitaiKey)}`;
  return { path, scale: scale != null ? Number(scale) : Number(known?.scale ?? 1), trigger: known?.trigger ?? null };
}
