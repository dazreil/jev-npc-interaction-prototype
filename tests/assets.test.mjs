import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyResult, buildRequest, compositeOverrides, crunchSettings, parseCard, parseLora, readRecipes, setStatus } from "../lib/asset-canvas.mjs";
import { runFal } from "../lib/fal.mjs";
import { crunch, ensureMinSize, frameTimes, jpegScale, makeLimitedAnimation, mediaSize, playOrder } from "../lib/limited-animation.mjs";

const canvas = {
  nodes: [
    { id: "s", type: "text", x: 0, y: 0, width: 400, height: 200, text: "## fmv\nstyle\nlora: https://x.test/fmv.safetensors @0.8\nprefix: 90s FMV still\nsuffix: film grain" },
    { id: "i", type: "text", x: 500, y: 0, width: 400, height: 200, text: "## gate\nimage\nstatus: go\nsize: 1280x720\nseed: 3\nprompt: a gate at night" },
    { id: "f", type: "file", file: "assets/arthur.webp", x: 0, y: 300, width: 200, height: 150 },
    { id: "a", type: "text", x: 500, y: 300, width: 400, height: 200, text: "## talk\nanimate\nstatus: go\nprompt: he talks\nseconds: 5" },
    { id: "n", type: "text", x: 0, y: 600, width: 200, height: 100, text: "just a note" }
  ],
  edges: [
    { id: "e1", fromNode: "s", toNode: "i" },
    { id: "e2", fromNode: "f", toNode: "a" }
  ]
};

test("recipe cards are read, and other cards are ignored", () => {
  assert.equal(parseCard(canvas.nodes[4]), null);
  const recipes = readRecipes(canvas);
  assert.deepEqual(recipes.map((recipe) => [recipe.name, recipe.kind, recipe.status]), [
    ["fmv", "style", ""],
    ["gate", "image", "go"],
    ["talk", "animate", "go"]
  ]);
  assert.equal(recipes[1].styles[0].name, "fmv");
  assert.deepEqual(recipes[2].start, { file: "assets/arthur.webp" });
});

test("an image request gets the style's LoRA and prompt words", () => {
  const gate = readRecipes(canvas)[1];
  const request = buildRequest(gate);
  assert.equal(request.endpoint, "fal-ai/flux-lora");
  assert.equal(request.input.prompt, "90s FMV still, a gate at night, film grain");
  assert.deepEqual(request.input.loras, [{ path: "https://x.test/fmv.safetensors", scale: 0.8 }]);
  assert.deepEqual(request.input.image_size, { width: 1280, height: 720 });
  assert.equal(request.input.seed, 3);
});

test("an animate request loops to its first frame unless told otherwise", () => {
  const talk = readRecipes(canvas)[2];
  const request = buildRequest(talk, { resolveImage: (source) => `data:${source.file}` });
  assert.equal(request.endpoint, "minimax/h3/image-to-video");
  assert.equal(request.input.image_url, "data:assets/arthur.webp");
  assert.equal(request.input.end_image_url, "data:assets/arthur.webp");
  assert.equal(request.input.resolution, "480P");
  talk.fields.loop = false;
  assert.equal(buildRequest(talk).input.end_image_url, undefined);
  talk.start = null;
  assert.throws(() => buildRequest(talk), /draw an arrow from an image/);
});

test("bad settings give a clear message", () => {
  assert.throws(() => parseLora("not a url @x"), /bad lora/);
  const bad = parseCard({ id: "b", type: "text", text: "## b\nimage\nprompt: [unclosed" });
  assert.match(bad.error, /bad recipe/);
  const unknown = { ...readRecipes(canvas)[1], fields: { prompt: "x", model: "dall-e-9" } };
  assert.throws(() => buildRequest(unknown), /unknown model "dall-e-9"/);
});

test("results replace the status line and add 'made' cards once", () => {
  assert.equal(setStatus("## a\nimage\nstatus: go\nprompt: x", "done"), "## a\nimage\nstatus: done\nprompt: x");
  assert.equal(setStatus("## a\nimage\nprompt: x", "running"), "## a\nimage\nstatus: running\nprompt: x");
  let next = applyResult(canvas, "i", { status: "done", files: ["assets/generated/gate.webp"] });
  next = applyResult(next, "i", { status: "done", files: ["assets/generated/gate.webp"] });
  const made = next.nodes.filter((node) => node.id.startsWith("made-i-"));
  assert.equal(made.length, 1, "a rerun replaces the old result card");
  assert.equal(next.edges.filter((edge) => edge.fromNode === "i" && edge.label === "made").length, 1);
  assert.match(next.nodes.find((node) => node.id === "i").text, /status: done/);
});

test("the fal client submits, waits, and returns the result", async () => {
  const calls = [];
  const replies = [
    { request_id: "r1", status_url: "https://queue.fal.run/x/requests/r1/status", response_url: "https://queue.fal.run/x/requests/r1" },
    { status: "IN_QUEUE" },
    { status: "COMPLETED" },
    { images: [{ url: "https://cdn.test/a.png" }] }
  ];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", auth: init.headers?.Authorization });
    return new Response(JSON.stringify(replies.shift()), { status: 200 });
  };
  const result = await runFal("fal-ai/flux-lora", { prompt: "x" }, { key: "k", fetch, sleep: async () => {} });
  assert.equal(result.images[0].url, "https://cdn.test/a.png");
  assert.deepEqual(calls.map((call) => call.method), ["POST", "GET", "GET", "GET"]);
  assert.equal(calls[0].url, "https://queue.fal.run/fal-ai/flux-lora");
  assert.ok(calls.every((call) => call.auth === "Key k"));

  const failing = async () => new Response(JSON.stringify({ detail: "bad key" }), { status: 401 });
  await assert.rejects(runFal("x", {}, { key: "k", fetch: failing }), /401.*bad key/);
  await assert.rejects(runFal("x", {}, { key: "" }), /FAL_KEY is not set/);
});

test("frame picking spreads drawings over the window, and pingpong loops", () => {
  assert.deepEqual(frameTimes(5, { frames: 4, from: 1, to: 3 }), [1.25, 1.75, 2.25, 2.75]);
  assert.throws(() => frameTimes(2, { frames: 4, from: 3 }), /Empty time window/);
  assert.deepEqual(playOrder(4, true), [0, 1, 2, 3, 2, 1]);
  assert.deepEqual(playOrder(4, false), [0, 1, 2, 3]);
});

test("a clip becomes held frames and a looping animated WebP", async () => {
  const dir = mkdtempSync(join(tmpdir(), "anim-test-"));
  try {
    const clip = join(dir, "clip.mp4");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=24", "-pix_fmt", "yuv420p", clip]);
    const { frames, animation, video } = await makeLimitedAnimation(clip, dir, "talk", { frames: 4, fps: 8, colors: 32, width: 160, pingpong: true });
    assert.equal(frames.length, 4);
    for (const frame of frames) assert.ok(existsSync(frame));
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width", "-of", "csv=p=0", frames[0]]).toString().trim();
    assert.equal(probe, "160");
    assert.equal(readFileSync(animation).subarray(8, 12).toString(), "WEBP");
    assert.ok(readFileSync(animation).includes(Buffer.from("ANIM")), "the WebP is animated");
    // The shareable MP4: H.264, even size, sharp 4x enlarge of the 160 px frames, ~4 s.
    const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height,pix_fmt:format=duration", "-of", "json", video]).toString());
    assert.equal(info.streams[0].codec_name, "h264");
    assert.equal(info.streams[0].pix_fmt, "yuv420p");
    assert.equal(info.streams[0].width, 640);
    assert.ok(Number(info.format.duration) >= 3.5 && Number(info.format.duration) <= 5, `duration ${info.format.duration}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a style template wraps the prompt, as the FMV LoRA was captioned", () => {
  const recipes = readRecipes({
    nodes: [
      { id: "s", type: "text", text: "## fmv\nstyle\ntemplate: \"The scene depicts {prompt}\"" },
      { id: "i", type: "text", text: "## g\nimage\nprompt: a gate at night" }
    ],
    edges: [{ id: "e", fromNode: "s", toNode: "i" }]
  });
  assert.equal(buildRequest(recipes[1]).input.prompt, "The scene depicts a gate at night");
});

test("small first frames are enlarged for the video model; big ones are left alone", async () => {
  const dir = mkdtempSync(join(tmpdir(), "size-test-"));
  try {
    const small = join(dir, "small.png");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=240x320", "-frames:v", "1", small]);
    const result = await ensureMinSize(small, join(dir, "big.png"));
    assert.equal(result.scaled, true);
    assert.deepEqual(await mediaSize(result.path), { width: 512, height: 682 });
    const again = await ensureMinSize(result.path, join(dir, "unused.png"));
    assert.equal(again.scaled, false);
    assert.equal(again.path, result.path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("crunch settings come from the recipe or its style, and can be turned off", () => {
  const recipes = readRecipes({
    nodes: [
      { id: "s", type: "text", text: "## fmv\nstyle\ncrunch: 4\njpeg: 40" },
      { id: "a", type: "text", text: "## a\nimage\nprompt: x" },
      { id: "b", type: "text", text: "## b\nimage\nprompt: x\njpeg: 70" },
      { id: "c", type: "text", text: "## c\nimage\nprompt: x\ncrunch: off" },
      { id: "d", type: "text", text: "## d\nimage\nprompt: x" }
    ],
    edges: ["a", "b", "c"].map((id) => ({ id: `e${id}`, fromNode: "s", toNode: id }))
  });
  const byName = Object.fromEntries(recipes.map((recipe) => [recipe.name, recipe]));
  assert.deepEqual(crunchSettings(byName.a), { factor: 4, quality: 40, filter: "neighbor" });
  assert.deepEqual(crunchSettings(byName.b), { factor: 4, quality: 70, filter: "neighbor" });
  assert.equal(crunchSettings(byName.c), null);
  assert.equal(crunchSettings(byName.d), null, "no style, no crunch");
});

test("JPEG quality follows the usual 1–100 scale", () => {
  assert.equal(jpegScale(100), 2);
  assert.equal(jpegScale(50), 9);
  assert.equal(jpegScale(1), 31);
  assert.ok(jpegScale(30) > jpegScale(60));
});

test("crunch keeps the picture's size and blocks it up", async () => {
  const dir = mkdtempSync(join(tmpdir(), "crunch-test-"));
  try {
    const input = join(dir, "in.png");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=s=640x360", "-frames:v", "1", input]);
    const output = await crunch(input, join(dir, "out.png"), { factor: 4, quality: 50 });
    assert.deepEqual(await mediaSize(output), { width: 640, height: 360 });
    // Nearest-neighbour enlarging repeats each small pixel in 4x4 blocks.
    const raw = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", output, "-vf", "crop=8:1:0:100", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
    assert.equal(raw[0], raw[3]);
    assert.equal(raw[4], raw[7]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a composite card reads its room and actor arrows and its placement", () => {
  const recipes = readRecipes({
    nodes: [
      { id: "r", type: "text", text: "## booth\nimage\nmodel: z-image\nprompt: a room" },
      { id: "a", type: "text", text: "## guard\nimage\nmodel: krea-2\nprompt: a guard" },
      { id: "f", type: "file", file: "assets/other-room.webp" },
      { id: "c", type: "text", text: "## night-guard\ncomposite\nshot: waist-up\nheight: 0.9\nseed: 3\nshadow: true" },
      { id: "d", type: "text", text: "## unlabelled\ncomposite" }
    ],
    edges: [
      { id: "e1", fromNode: "r", toNode: "c", label: "room" },
      { id: "e2", fromNode: "a", toNode: "c", label: "Actor" },
      { id: "e3", fromNode: "f", toNode: "d" }
    ]
  });
  const composite = recipes.find((recipe) => recipe.name === "night-guard");
  assert.deepEqual(composite.room, { recipe: "booth" });
  assert.deepEqual(composite.actor, { recipe: "guard" });
  assert.deepEqual(compositeOverrides(composite.fields), { seed: 3, shot: "waist-up", align: false, overrides: { heightShare: 0.9, shadow: true } });
  assert.match(recipes.find((recipe) => recipe.name === "unlabelled").error, /label the arrows/);
  assert.equal(buildRequest(recipes[0]).endpoint, "fal-ai/z-image/turbo");
  assert.equal(buildRequest(recipes[1]).endpoint, "fal-ai/krea-2/turbo");
  assert.equal(buildRequest(recipes[0]).input.loras, undefined, "no LoRA field unless a LoRA is set");
});

test("an edit card sends its reference pictures; a composite can take many actors", () => {
  const recipes = readRecipes({
    nodes: [
      { id: "s", type: "text", text: '## keep\nstyle\ntemplate: "Same man. Only change {prompt}"' },
      { id: "h", type: "text", text: "## hero\nimage\nmodel: krea-2\nprompt: a guard" },
      { id: "e", type: "text", text: '## angry\nedit\nseed: 7\nprompt: "his face: angry"' },
      { id: "r", type: "file", file: "assets/scenes/room.webp" },
      { id: "c", type: "text", text: "## booth\ncomposite\nalign: true" }
    ],
    edges: [
      { id: "1", fromNode: "s", toNode: "e" },
      { id: "2", fromNode: "h", toNode: "e" },
      { id: "3", fromNode: "r", toNode: "c", label: "room" },
      { id: "4", fromNode: "h", toNode: "c", label: "actor" },
      { id: "5", fromNode: "e", toNode: "c", label: "actor" }
    ]
  });
  const edit = recipes.find((recipe) => recipe.name === "angry");
  const request = buildRequest(edit, { resolveImage: (source) => `uri:${source.recipe}` });
  assert.equal(request.endpoint, "fal-ai/qwen-image-edit-2511", "edit cards default to Qwen");
  assert.equal(request.input.prompt, "Same man. Only change his face: angry");
  assert.deepEqual(request.input.image_urls, ["uri:hero"]);
  const booth = recipes.find((recipe) => recipe.name === "booth");
  assert.deepEqual(booth.actors, [{ recipe: "hero" }, { recipe: "angry" }]);
  assert.equal(compositeOverrides(booth.fields).align, true);
  assert.throws(() => buildRequest({ ...edit, references: [] }), /draw an arrow from the picture to edit/);
});
