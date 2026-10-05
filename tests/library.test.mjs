// The game's library (lib/library.mjs): models you add, and LoRAs from Civitai
// or Hugging Face, checked and turned into what fal and Replicate need.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildRequest, readRecipes } from "../lib/asset-canvas.mjs";
import { checkModel, loraDownloadUrl, readLoras, resolveLora, saveLibrary } from "../lib/library.mjs";

test("Civitai and Hugging Face links become direct downloads", () => {
  assert.equal(loraDownloadUrl("https://civitai.com/models/12345/vhs-look?modelVersionId=67890"), "https://civitai.com/api/download/models/67890");
  assert.equal(loraDownloadUrl("https://huggingface.co/someone/vhs-lora/blob/main/vhs.safetensors"), "https://huggingface.co/someone/vhs-lora/resolve/main/vhs.safetensors");
  assert.throws(() => loraDownloadUrl("https://civitai.com/models/12345"), /modelVersionId/);
  assert.throws(() => loraDownloadUrl("https://huggingface.co/someone/vhs-lora"), /safetensors/);
});

test("a LoRA by library name gets its link, strength and trigger; Civitai gets the key", () => {
  const loras = [{ id: "vhs", url: "https://civitai.com/api/download/models/67890", scale: 0.8, trigger: "vhs footage" }];
  assert.deepEqual(resolveLora("vhs", loras), { path: "https://civitai.com/api/download/models/67890", scale: 0.8, trigger: "vhs footage" });
  assert.equal(resolveLora("vhs @0.5", loras, "secret").path, "https://civitai.com/api/download/models/67890?token=secret");
  assert.equal(resolveLora("vhs @0.5", loras).scale, 0.5);
  assert.equal(resolveLora("https://example.com/x.safetensors @1.2", loras).path, "https://example.com/x.safetensors");
});

test("the fal request carries the LoRAs, and their trigger words lead the prompt", () => {
  const canvas = {
    nodes: [
      { id: "s", type: "text", text: "## night\nstyle\nprefix: a night scene\nlora: [\"vhs @0.6\"]" },
      { id: "r", type: "text", text: "## street\nimage\nmodel: flux-lora\nprompt: a wet street" }
    ],
    edges: [{ id: "e", fromNode: "s", toNode: "r" }]
  };
  const loras = [{ id: "vhs", url: "https://huggingface.co/x/y/resolve/main/vhs.safetensors", scale: 1, trigger: "vhs footage" }];
  const recipe = readRecipes(canvas).find((item) => item.name === "street");
  const request = buildRequest(recipe, { resolveLora: (entry) => resolveLora(entry, loras) });
  assert.deepEqual(request.input.loras, [{ path: "https://huggingface.co/x/y/resolve/main/vhs.safetensors", scale: 0.6 }]);
  assert.equal(request.input.prompt, "vhs footage, a night scene, a wet street");
  recipe.fields.lora = ["vhs @0.9"];
  const twice = buildRequest(recipe, { resolveLora: (entry) => resolveLora(entry, loras) });
  assert.deepEqual(twice.input.loras, [{ path: "https://huggingface.co/x/y/resolve/main/vhs.safetensors", scale: 0.9 }], "the same LoRA once, the card's strength winning");
  assert.equal(twice.input.prompt, "vhs footage, a night scene, a wet street", "its trigger words once");
});

test("a model or LoRA is checked before it is saved", async () => {
  assert.deepEqual(checkModel({ id: "flux-dev", service: "fal", kind: "image", endpoint: "fal-ai/flux/dev", cost: 0.025 }), []);
  assert.deepEqual(checkModel({ id: "kontext", service: "replicate", kind: "edit", model: "black-forest-labs/flux-kontext-dev" }), []);
  assert.ok(checkModel({ id: "Bad Id", service: "elsewhere", kind: "song" }).length >= 3);
  const vault = await mkdtemp(join(tmpdir(), "library-"));
  try {
    await saveLibrary(vault, { loras: [{ id: "vhs", link: "https://civitai.com/models/1?modelVersionId=2", trigger: "vhs footage", scale: 0.8 }] });
    const [lora] = readLoras(vault);
    assert.deepEqual([lora.url, lora.source, lora.scale], ["https://civitai.com/api/download/models/2", "civitai", 0.8]);
    await assert.rejects(saveLibrary(vault, { models: [{ id: "x", service: "fal", kind: "image" }] }), /fal endpoint/);
    await assert.rejects(saveLibrary(vault, { loras: [{ id: "a", link: "https://x.dev/a" }, { id: "a", link: "https://x.dev/b" }] }), /no other entry/);
    assert.ok((await readFile(join(vault, "library", "loras.json"), "utf8")).includes('"vhs"'), "a failed save leaves the old file");
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});

test("FLUX 3: aspect ratio and resolution instead of a size, and its safety setting", () => {
  const canvas = { nodes: [
    { id: "a", type: "file", file: "x.png" },
    { id: "e", type: "text", text: "## e\nedit\nmodel: flux-3-edit\nsafety: 4\nprompt: add rain" },
    { id: "i", type: "text", text: "## i\nimage\nmodel: flux-3\nsize: 832x1248\nprompt: a pool" }
  ], edges: [{ id: "1", fromNode: "a", toNode: "e" }] };
  const [edit, image] = readRecipes(canvas);
  assert.deepEqual(buildRequest(edit, { resolveImage: () => "data:x" }), { endpoint: "blackforestlabs/flux-3/edit-image", input: { prompt: "add rain", resolution: "1k", output_format: "png", safety_tolerance: 4, image_urls: ["data:x"], aspect_ratio: "auto" } });
  assert.equal(buildRequest(image).input.aspect_ratio, "2:3", "832x1248 is 2:3");
  assert.equal(buildRequest(image).input.safety_tolerance, undefined, "fal's default unless the card sets it");
});
