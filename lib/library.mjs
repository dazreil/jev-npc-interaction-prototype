// The game's library: models you added (hosted on fal or Replicate) and
// LoRAs (from Civitai, Hugging Face or any direct link). Kept in the game
// folder as library/models.json and library/loras.json; edited in the app
// (Cmd+E → Library). The asset runner and the voices script read them.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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

/** A model you added, checked: where it runs, what it makes, and its fields. */
export function checkModel(model) {
  const problems = [];
  if (!ID.test(model.id ?? "")) problems.push("an id of small letters, numbers, dots or dashes");
  if (!["fal", "replicate"].includes(model.service)) problems.push('a service: "fal" or "replicate"');
  if (!MODEL_KINDS.includes(model.kind)) problems.push(`a kind: ${MODEL_KINDS.join(", ")}`);
  if (model.service === "fal" && !/^[\w-]+\/[\w./-]+$/.test(model.endpoint ?? "")) problems.push("a fal endpoint, such as fal-ai/flux/dev");
  if (model.service === "replicate" && !/^[\w.-]+\/[\w.-]+(:[0-9a-f]{64})?$/.test(model.model ?? "")) problems.push("a Replicate model, such as black-forest-labs/flux-dev (or owner/name:version)");
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
