import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chooseParameters, composite, key, keyFrames, seeded, size } from "../lib/composite.mjs";

const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const pixel = (file, x, y) => [...execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-vf", `crop=1:1:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"])];

test("the key keeps dark, slightly green hair and drops the screen and specks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "key-test-"));
  try {
    const actor = join(dir, "actor.png");
    // A green screen (like 0x3d993b) with a dark greenish "head" (44,53,38),
    // a magenta "body", and a tiny dark speck on the floor.
    ff([
      "-f", "lavfi", "-i", "color=c=0x3d993b:s=320x240",
      "-vf", "drawbox=x=140:y=40:w=40:h=40:color=0x2c3526:t=fill,drawbox=x=120:y=80:w=80:h=140:color=0x761c47:t=fill,drawbox=x=20:y=220:w=2:h=2:color=0x101010:t=fill",
      "-frames:v", "1", actor
    ]);
    const keyed = join(dir, "keyed.png");
    const { screen, box } = await key(actor, keyed);
    assert.equal(screen.screen, "green");
    assert.deepEqual(box, { x: 120, y: 40, width: 80, height: 180 }, "trimmed to the actor; the speck is gone");
    assert.equal(pixel(keyed, 30, 10)[3], 255, "dark hair stays opaque");
    assert.equal(pixel(keyed, 2, 2)[3], 0, "screen is transparent");

    const background = join(dir, "bg.png");
    ff(["-f", "lavfi", "-i", "color=c=gray:s=1024x768", "-frames:v", "1", background]);
    const parameters = chooseParameters(seeded(7), { shot: "full" });
    const used = await composite(background, keyed, join(dir, "out.png"), parameters);
    assert.deepEqual(await size(join(dir, "out.png")), { width: 1024, height: 768 });
    assert.equal(used.y + used.actorHeight, 768, "a full-body actor stands on the bottom edge");
    assert.deepEqual(chooseParameters(seeded(7), { shot: "full" }), parameters, "same seed, same composite");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a clip is keyed with one screen colour and one trim box, so the actor does not jump", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keyframes-test-"));
  try {
    // Two frames: the "actor" moves 40 px right between them.
    const frames = [0, 40].map((shift, index) => {
      const file = join(dir, `f${index}.png`);
      ff(["-f", "lavfi", "-i", "color=c=0x3d993b:s=320x240", "-vf", `drawbox=x=${100 + shift}:y=60:w=60:h=120:color=0x761c47:t=fill`, "-frames:v", "1", file]);
      return file;
    });
    const { keyed, box } = await keyFrames(frames, dir);
    assert.deepEqual(box, { x: 100, y: 60, width: 100, height: 120 }, "the box fits the actor in every frame");
    const sizes = await Promise.all(keyed.map(size));
    assert.deepEqual(sizes[0], sizes[1], "every keyed frame has the same size");
    assert.equal(pixel(keyed[0], 5, 5)[3], 255, "frame 1: actor at the left of the box");
    assert.equal(pixel(keyed[1], 5, 5)[3], 0, "frame 2: the actor has moved right; the box did not");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
