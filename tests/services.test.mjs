// The other AI services (lib/services.mjs): keys in .env, and each service's
// request and answer, with a stand-in network (nothing is called or spent).
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SERVICE_MODELS, elevenLabsSpeech, keyStatus, makePicture, setKey, testKey } from "../lib/services.mjs";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const picture = `data:image/png;base64,${PNG.toString("base64")}`;

async function withRoot(run) {
  const root = await mkdtemp(join(tmpdir(), "keys-"));
  const saved = { ...process.env };
  try {
    await run(root);
  } finally {
    for (const name of ["TYPESAFE_API_KEY", "FAL_KEY", "REPLICATE_API_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY", "ELEVENLABS_API_KEY", "RETRODIFFUSION_API_KEY"]) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    await rm(root, { recursive: true, force: true });
  }
}

/** Replaces fetch with `answer(url, init)` for one run, and records the calls. */
async function withFetch(answer, run) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return answer(String(url), init);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = real;
  }
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

test("keys are written to .env, replaced, and removed; the status never shows a key", async () => {
  await withRoot(async (root) => {
    setKey(root, "openai", "sk-first");
    setKey(root, "openai", "sk-second");
    setKey(root, "replicate", "r8_token");
    assert.equal(await readFile(join(root, ".env"), "utf8"), "OPENAI_API_KEY=sk-second\nREPLICATE_API_TOKEN=r8_token\n");
    const status = keyStatus(root);
    assert.equal(status.find((service) => service.id === "openai").hasKey, true);
    assert.ok(!JSON.stringify(status).includes("sk-second"), "never the key itself");
    setKey(root, "openai", "");
    assert.equal(await readFile(join(root, ".env"), "utf8"), "REPLICATE_API_TOKEN=r8_token\n");
    assert.throws(() => setKey(root, "openai", "two\nlines"), /one line/);
  });
});

test("Replicate: an official model's prediction, waited for, and its picture URL", async () => {
  await withRoot(async (root) => {
    setKey(root, "replicate", "r8_test");
    await withFetch(() => json({ status: "succeeded", output: ["https://replicate.delivery/out.png"] }), async (calls) => {
      const result = await makePicture(root, "flux-kontext-pro", { prompt: "make it night", images: [picture], size: "1024x768" });
      assert.deepEqual(result, { url: "https://replicate.delivery/out.png" });
      assert.equal(calls[0].url, "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions");
      assert.equal(calls[0].init.headers.Authorization, "Bearer r8_test");
      const body = JSON.parse(calls[0].init.body);
      assert.deepEqual(body.input, { prompt: "make it night", input_image: picture, aspect_ratio: "match_input_image", output_format: "png" });
    });
  });
});

test("OpenAI: an edit sends the pictures as a form; the answer's base64 becomes the picture", async () => {
  await withRoot(async (root) => {
    setKey(root, "openai", "sk-test");
    await withFetch(() => json({ data: [{ b64_json: PNG.toString("base64") }] }), async (calls) => {
      const result = await makePicture(root, "gpt-image-2-edit", { prompt: "a warm smile", images: [picture], size: "1024x768" });
      assert.deepEqual(result.bytes, PNG);
      assert.equal(calls[0].url, "https://api.openai.com/v1/images/edits");
      const form = calls[0].init.body;
      assert.equal(form.get("model"), "gpt-image-2");
      assert.equal(form.get("size"), "1536x1024", "a landscape card asks for the landscape size");
      assert.equal(form.getAll("image[]").length, 1);
    });
  });
});

test("Google: an interaction is checked until it is done, and the image is found in its steps", async () => {
  await withRoot(async (root) => {
    setKey(root, "google", "g-test");
    let polls = 0;
    await withFetch((url) => {
      if (url.endsWith("/interactions")) return json({ id: "v1_abc", status: "in_progress" });
      polls += 1;
      return json({ id: "v1_abc", status: "completed", steps: [{ type: "model_output", content: [{ type: "image", mime_type: "image/png", data: PNG.toString("base64") }] }] });
    }, async (calls) => {
      const result = await makePicture(root, "nano-banana-2-edit", { prompt: "keep him, change the coat", images: [picture], size: "1024x768" });
      assert.deepEqual(result.bytes, PNG);
      assert.equal(polls, 1);
      assert.equal(calls[0].init.headers["x-goog-api-key"], "g-test");
      const body = JSON.parse(calls[0].init.body);
      assert.equal(body.model, "gemini-3.1-flash-image");
      assert.deepEqual(body.input[1], { type: "image", mime_type: "image/png", data: PNG.toString("base64") });
      assert.equal(body.response_format.aspect_ratio, "4:3");
    });
  });
});

test("ElevenLabs speech, and a clear message when a key is missing", async () => {
  await withRoot(async (root) => {
    await assert.rejects(makePicture(root, "flux-schnell", { prompt: "x" }), /No Replicate key/);
    setKey(root, "elevenlabs", "el-test");
    await withFetch(() => new Response(Buffer.from("mp3!")), async (calls) => {
      const audio = await elevenLabsSpeech(root, { text: "Welcome to Blackwood.", voice: "voice123" });
      assert.equal(audio.toString(), "mp3!");
      assert.match(calls[0].url, /\/v1\/text-to-speech\/voice123\?output_format=mp3_44100_64$/);
      assert.equal(calls[0].init.headers["xi-api-key"], "el-test");
      assert.deepEqual(JSON.parse(calls[0].init.body), { text: "Welcome to Blackwood.", model_id: "eleven_multilingual_v2" });
    });
  });
  assert.ok(Object.values(SERVICE_MODELS).every((model) => ["image", "edit"].includes(model.kind) && model.cost > 0), "every model is a picture or edit model with a price");
});

test("the Jev key test: a wrong key is refused, a good one is told the empty request is incomplete", async () => {
  await withRoot(async (root) => {
    setKey(root, "jev", "ts-test");
    await withFetch((_url, init) => new Response("{}", { status: init.headers.Authorization === "Bearer ts-test" ? 422 : 401 }), async (calls) => {
      assert.deepEqual(await testKey(root, "jev"), { ok: true, message: "The key works." });
      assert.equal(calls[0].url, "https://api.typesafe.ai/v1/systemone");
      assert.equal(calls[0].init.body, "{}", "an empty request: no answer is made, nothing is billed");
    });
    setKey(root, "jev", "ts-wrong");
    await withFetch(() => new Response("{}", { status: 401 }), async () => {
      assert.equal((await testKey(root, "jev")).ok, false);
    });
  });
});


test("RetroDiffusion key check is free and status keeps the token private", async () => {
  await withRoot(async (root) => {
    setKey(root, "retrodiffusion", "rdpk-test");
    const status = keyStatus(root).find((entry) => entry.id === "retrodiffusion");
    assert.equal(status.hasKey, true);
    assert.ok(!JSON.stringify(status).includes("rdpk-test"));
    await withFetch(() => json({ balance: 1 }), async (calls) => {
      assert.equal((await testKey(root, "retrodiffusion")).ok, true);
      assert.equal(calls[0].url, "https://api.retrodiffusion.ai/v2/inferences/credits");
      assert.equal(calls[0].init.headers["X-RD-Token"], "rdpk-test");
      assert.equal(calls[0].init.method, undefined);
    });
    await withFetch(() => json({}, 401), async () => assert.equal((await testKey(root, "retrodiffusion")).ok, false));
  });
});

test("RetroDiffusion submits once, polls, and decodes native pixel art", async () => {
  await withRoot(async (root) => {
    setKey(root, "retrodiffusion", "rdpk-test");
    await withFetch((url) => url.endsWith("/inferences") ? json({ task_id: "task-1", status: "accepted" }) : json({ status: "succeeded", result: { base64_images: [PNG.toString("base64")] } }), async (calls) => {
      assert.deepEqual((await makePicture(root, "rd-pro", { prompt: "a detective", size: "1024x768", seed: 42, images: [picture] })).bytes, PNG);
      assert.equal(calls.length, 2);
      assert.deepEqual(JSON.parse(calls[0].init.body), { prompt: "a detective", prompt_style: "rd_pro__default", width: 256, height: 192, num_images: 1, seed: 42, reference_images: [PNG.toString("base64")] });
      const admission = calls[0].init.headers["Idempotency-Key"];
      assert.ok(admission);
      const saved = JSON.parse(await readFile(join(root, "build", "retrodiffusion-jobs", `${admission}.json`), "utf8"));
      assert.equal(saved.task_id, "task-1");
      assert.ok(!JSON.stringify(saved).includes("rdpk-test"));
      assert.equal(calls[1].url, "https://api.retrodiffusion.ai/v2/inferences/tasks/task-1");
    });
  });
});

test("RetroDiffusion edits support hosted output and failed jobs never resubmit", async () => {
  await withRoot(async (root) => {
    setKey(root, "retrodiffusion", "rdpk-test");
    await withFetch((url) => url.endsWith("/inferences") ? json({ task_id: "edit-1" }) : json({ status: "succeeded", result: { base64_images: [], output_urls: ["https://example.com/art.png"] } }), async (calls) => {
      assert.deepEqual(await makePicture(root, "rd-pro-edit", { prompt: "a hat", images: [picture], size: "128x128" }), { url: "https://example.com/art.png" });
      assert.equal(JSON.parse(calls[0].init.body).input_image, PNG.toString("base64"));
    });
    await withFetch((url) => url.endsWith("/inferences") ? json({ task_id: "failed-1" }) : json({ status: "failed", error: { code: "inference_failed" } }), async (calls) => {
      await assert.rejects(makePicture(root, "rd-fast", { prompt: "x" }), /inference_failed/);
      assert.equal(calls.filter((call) => call.init.method === "POST").length, 1);
    });
    await withFetch(() => json({}, 402), async () => {
      await assert.rejects(makePicture(root, "rd-plus", { prompt: "x" }), /402/);
    });
    await withFetch(() => { throw new Error("must not submit"); }, async (calls) => {
      await assert.rejects(makePicture(root, "rd-pro-edit", { prompt: "x" }), /arrow/);
      await assert.rejects(makePicture(root, "rd-fast", { prompt: "x", images: [picture] }), /choose rd-pro/);
      await assert.rejects(makePicture(root, "rd-fast", { prompt: "x", size: "16x16" }), /at least 64px/);
      assert.equal(calls.length, 0);
    });
  });
});
