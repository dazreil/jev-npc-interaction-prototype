// ComfyUI workflows as models (lib/comfy.mjs, Comfy Cloud), with a stand-in
// network and live connection: nothing is called or spent.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { guessInputs, runWorkflow } from "../lib/comfy.mjs";
import { checkModel, readWorkflow, saveLibrary } from "../lib/library.mjs";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const picture = `data:image/png;base64,${PNG.toString("base64")}`;

/** A small text-to-image workflow, as ComfyUI's Export (API) writes it. */
const WORKFLOW = {
  3: { class_type: "KSampler", inputs: { seed: 1, steps: 20, model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] } },
  4: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "model.safetensors" } },
  5: { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
  6: { class_type: "CLIPTextEncode", inputs: { text: "a cat", clip: ["4", 1] } },
  7: { class_type: "CLIPTextEncode", inputs: { text: "blurry", clip: ["4", 1] } },
  9: { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: "out" } },
  10: { class_type: "LoadImage", inputs: { image: "example.png" } }
};

test("the app finds where the prompt, picture, seed and size go", () => {
  assert.deepEqual(guessInputs(WORKFLOW), { prompt: "6.text", image: "10.image", seed: "3.seed", width: "5.width", height: "5.height", output: "9" });
  assert.throws(() => guessInputs({ nodes: [], links: [] }), /Export \(API\)/, "the normal workflow file is not the API one");
});

/** Stand-ins for fetch and WebSocket for one run; the socket says the job is done. */
async function withComfy(run) {
  const calls = [];
  const realFetch = globalThis.fetch;
  const RealSocket = globalThis.WebSocket;
  let socket;
  globalThis.WebSocket = class {
    constructor(url) {
      this.url = url;
      socket = this;
      setTimeout(() => this.onopen?.(), 0);
    }
    close() {}
  };
  const say = (message) => socket.onmessage({ data: JSON.stringify(message) });
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, init });
    if (url.endsWith("/api/upload/image")) return Response.json({ name: "reference.png", subfolder: "" });
    if (url.endsWith("/api/prompt")) {
      setTimeout(() => {
        say({ type: "executing", data: { prompt_id: "other-job" } });
        say({ type: "executed", data: { prompt_id: "job-1", node: "9", output: { images: [{ filename: "out_0001.png", subfolder: "", type: "output" }] } } });
        say({ type: "execution_success", data: { prompt_id: "job-1" } });
      }, 0);
      return Response.json({ prompt_id: "job-1" });
    }
    if (url.includes("/api/view?")) return new Response(null, { status: 302, headers: { location: "https://storage.example.com/signed/out.png" } });
    if (url.startsWith("https://storage.example.com/")) return new Response(PNG);
    return new Response("not found", { status: 404 });
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.WebSocket = RealSocket;
  }
}

test("a run uploads the picture, fills the workflow, waits, and downloads the result", async () => {
  await withComfy(async (calls) => {
    const result = await runWorkflow("comfy-test", { workflow: WORKFLOW, inputs: guessInputs(WORKFLOW) }, { prompt: "a detective", images: [picture], seed: 42, size: "832x1248" });
    assert.deepEqual(result.bytes, PNG);
    assert.equal(result.ext, ".png");
    const [upload, submit, view, signed] = calls;
    assert.equal(upload.init.headers["X-API-Key"], "comfy-test");
    assert.equal(upload.init.body.get("type"), "input");
    const graph = JSON.parse(submit.init.body).prompt;
    assert.equal(graph[6].inputs.text, "a detective");
    assert.equal(graph[7].inputs.text, "blurry", "the negative prompt stays");
    assert.equal(graph[10].inputs.image, "reference.png");
    assert.equal(graph[3].inputs.seed, 42);
    assert.deepEqual([graph[5].inputs.width, graph[5].inputs.height], [832, 1248]);
    assert.equal(WORKFLOW[6].inputs.text, "a cat", "the saved workflow is not changed");
    assert.equal(view.init.redirect, "manual");
    assert.equal(signed.init?.headers, undefined, "the key is not sent to the storage host");
  });
});

test("a Comfy model is checked, and its workflow is saved in its own file", async () => {
  assert.match(checkModel({ id: "sdxl", service: "comfy", kind: "voice", inputs: {} }).join("; "), /image, edit or video.*workflow.*prompt/);
  assert.match(checkModel({ id: "sdxl", service: "comfy", kind: "edit", workflow: "x.json", inputs: { prompt: "6.text" } }).join("; "), /input picture/);
  const vault = await mkdtemp(join(tmpdir(), "comfy-"));
  try {
    const { saved } = await saveLibrary(vault, { models: [{ id: "my-sdxl", service: "comfy", kind: "image", workflow: WORKFLOW, inputs: { seed: "3.seed" }, cost: 0.01 }] });
    assert.deepEqual(saved, ["library/workflows/my-sdxl.json", "library/models.json"]);
    const [model] = JSON.parse(await readFile(join(vault, "library", "models.json"), "utf8"));
    assert.equal(model.workflow, "library/workflows/my-sdxl.json");
    assert.equal(model.inputs.prompt, "6.text");
    assert.deepEqual(readWorkflow(vault, model), JSON.parse(JSON.stringify(WORKFLOW)));
    await assert.rejects(saveLibrary(vault, { models: [{ id: "bad", service: "comfy", kind: "image", workflow: WORKFLOW, inputs: { prompt: "99.text" } }] }), /no node 99/);
  } finally {
    await rm(vault, { recursive: true, force: true });
  }
});
