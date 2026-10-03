// Composites a chroma-key actor over a pre-rendered background, the way 90s
// FMV games were made (fmv-lora/SPEC.md Option B, B2 and B4). ffmpeg only.
// Used by the asset runner's composite cards and by fmv-lora/ scripts.
//
// key():       sample the real screen colour, key it out, despill, trim to the actor
// composite(): scale and place the actor, mismatch its lighting on purpose,
//              hard or slightly soft edge, optional hard drop shadow
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ffmpeg = (args, options = {}) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 256 * 1024 * 1024, encoding: "buffer", ...options });
const hex = (value) => value.toString(16).padStart(2, "0");

export async function size(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]);
  const [width, height] = stdout.trim().split(",").map(Number);
  return { width, height };
}

/** The screen's real colour, averaged from the two top corners (AI screens are never pure). */
export async function sampleScreen(file) {
  const corners = ["0:0", "iw-iw*0.12:0"].map(async (xy) => {
    const { stdout } = await ffmpeg(["-i", file, "-vf", `crop=iw*0.12:ih*0.12:${xy},scale=1:1:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    return [...stdout.subarray(0, 3)];
  });
  const [a, b] = await Promise.all(corners);
  const rgb = a.map((value, index) => Math.round((value + b[index]) / 2));
  const screen = rgb[1] >= rgb[2] ? "green" : "blue";
  return { rgb, hex: `0x${rgb.map(hex).join("")}`, screen };
}

/** The bounding box of non-transparent pixels in an RGBA PNG. */
async function alphaBox(file) {
  const { width, height } = await size(file);
  const { stdout } = await ffmpeg(["-i", file, "-vf", "alphaextract", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
  let top = height;
  let left = width;
  let bottom = -1;
  let right = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (stdout[y * width + x] > 32) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) throw new Error(`${file}: keying removed everything`);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Clears small opaque blobs (screen seams, dark corners) so only the actor
 * remains: keeps connected areas at least `share` of the largest one.
 */
function removeSpecks(rgba, width, height, share = 0.02) {
  const label = new Int32Array(width * height);
  const sizes = [0];
  const stack = [];
  for (let start = 0; start < width * height; start += 1) {
    if (label[start] || rgba[start * 4 + 3] <= 32) continue;
    const id = sizes.length;
    let count = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const index = stack.pop();
      count += 1;
      const x = index % width;
      const neighbours = [index - width, index + width, x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1];
      for (const next of neighbours) {
        if (next >= 0 && next < width * height && !label[next] && rgba[next * 4 + 3] > 32) {
          label[next] = id;
          stack.push(next);
        }
      }
    }
    sizes.push(count);
  }
  const keep = Math.max(...sizes) * share;
  for (let index = 0; index < width * height; index += 1) {
    if (label[index] && sizes[label[index]] < keep) rgba[index * 4 + 3] = 0;
  }
}

/**
 * Keys an actor off its screen with a colour-difference key (the classic
 * film method): how much greener (or bluer) a pixel is than its other two
 * channels, compared with the screen itself. Unlike ffmpeg's chromakey,
 * which looks at hue only, dark hair and shadows are kept.
 *
 * low/high: the share of the screen's difference where a pixel starts to
 * turn transparent and where it is fully transparent. despill clamps the
 * screen channel so reflected green or blue leaves hair and clothes.
 */
export async function key(actor, output, options = {}) {
  const screen = options.screen ?? (await sampleScreen(actor));
  const work = await mkdtemp(join(tmpdir(), "key-"));
  try {
    const keyed = join(work, "keyed.png");
    await keyFull(actor, keyed, screen, options);
    const box = options.box ?? (await alphaBox(keyed));
    await ffmpeg(["-i", keyed, "-vf", `crop=${box.width}:${box.height}:${box.x}:${box.y}`, output]);
    return { output, screen, box };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Keys one picture against a known screen colour, full size (no trim). */
async function keyFull(actor, output, screen, { low = 0.3, high = 0.65, despill = true } = {}) {
  // despill "strong": the screen channel is pulled down to the average of the
  // other two, so green-lit wood turns brown instead of olive.
  const { width, height } = await size(actor);
  const { stdout: rgb } = await ffmpeg(["-i", actor, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  const main = screen.screen === "green" ? 1 : 2;
  const others = main === 1 ? [0, 2] : [0, 1];
  const screenDiff = screen.rgb[main] - Math.max(screen.rgb[others[0]], screen.rgb[others[1]]);
  if (screenDiff < 30) throw new Error(`${actor}: the screen colour ${screen.hex} is too weak to key`);
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    const channels = [rgb[i], rgb[i + 1], rgb[i + 2]];
    const other = Math.max(channels[others[0]], channels[others[1]]);
    const share = (channels[main] - other) / screenDiff;
    const alpha = share <= low ? 1 : share >= high ? 0 : 1 - (share - low) / (high - low);
    const limit = despill === "strong" ? (channels[others[0]] + channels[others[1]]) / 2 : other;
    if (despill && channels[main] > limit) channels[main] = Math.round(limit);
    rgba[j] = channels[0];
    rgba[j + 1] = channels[1];
    rgba[j + 2] = channels[2];
    rgba[j + 3] = Math.round(alpha * 255);
  }
  removeSpecks(rgba, width, height);
  const raw = `${output}.rgba`;
  await writeFile(raw, rgba);
  await ffmpeg(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-i", raw, output]);
  await rm(raw, { force: true });
  return output;
}

/**
 * Keys every frame of a clip the same way: the screen colour is read once
 * (from the first frame), and all frames are trimmed with one box that fits
 * the actor in every frame. So the key does not flicker and the actor does
 * not jump. Writes key-01.png… to `outDir`.
 */
export async function keyFrames(frames, outDir, options = {}) {
  await mkdir(outDir, { recursive: true });
  const screen = await sampleScreen(frames[0]);
  const full = [];
  for (const [index, frame] of frames.entries()) {
    full.push(await keyFull(frame, join(outDir, `full-${String(index + 1).padStart(2, "0")}.png`), screen, options));
  }
  const boxes = await Promise.all(full.map(alphaBox));
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const box = { x, y, width: right - x, height: bottom - y };
  const keyed = [];
  for (const [index, file] of full.entries()) {
    const out = join(outDir, `key-${String(index + 1).padStart(2, "0")}.png`);
    await ffmpeg(["-i", file, "-vf", `crop=${box.width}:${box.height}:${box.x}:${box.y}`, out]);
    keyed.push(out);
  }
  return { keyed, screen, box };
}

/** A small seeded random source, so a composite can be made again exactly. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random composite settings from SPEC.md B4. */
export function chooseParameters(random, { shot = "full" } = {}) {
  const between = (low, high) => low + random() * (high - low);
  const mismatch = random() < 0.6;
  return {
    heightShare: Number(between(shot === "full" ? 0.55 : 0.75, shot === "full" ? 0.85 : 0.95).toFixed(3)),
    xCentre: Number(between(0.2, 0.8).toFixed(3)),
    overhang: shot === "full" ? 0 : Number(between(0.05, 0.2).toFixed(3)),
    brightness: mismatch ? Number((between(0.1, 0.25) * (random() < 0.5 ? -1 : 1) * 0.4).toFixed(3)) : 0,
    contrast: mismatch ? Number(between(0.85, 1.2).toFixed(3)) : 1,
    temperature: mismatch ? Math.round(between(3200, 9000)) : 6500,
    feather: random() < 0.3 ? (random() < 0.5 ? 1 : 2) : 0,
    shadow: random() < 0.4,
    mismatch
  };
}

/**
 * Pastes a keyed actor (RGBA) over a background at 1024x768.
 * Returns the parameters used, for the manifest.
 */
export async function composite(background, actorRgba, output, parameters) {
  const W = 1024;
  const H = 768;
  const actor = await size(actorRgba);
  const actorHeight = Math.round(H * parameters.heightShare);
  const actorWidth = Math.round((actor.width / actor.height) * actorHeight);
  const x = Math.round(W * parameters.xCentre - actorWidth / 2);
  const y = Math.round(H - actorHeight + actorHeight * parameters.overhang);
  const look = [
    `scale=${actorWidth}:${actorHeight}:flags=lanczos`,
    "format=rgba",
    `eq=brightness=${parameters.brightness}:contrast=${parameters.contrast}`,
    `colortemperature=temperature=${parameters.temperature}`,
    ...(parameters.feather ? [`boxblur=luma_radius=0:chroma_radius=0:alpha_radius=${parameters.feather}`] : [])
  ].join(",");
  const graph = [
    `[0:v]scale=${W}:${H}:flags=lanczos,format=rgba[bg]`,
    `[1:v]${look}[act]`,
    ...(parameters.shadow
      ? [
          "[act]split[act1][act2]",
          "[act2]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.55[shadow]",
          `[bg][shadow]overlay=${x + 14}:${y + 6}[bg2]`,
          `[bg2][act1]overlay=${x}:${y}:format=auto,format=rgb24[out]`
        ]
      : [`[bg][act]overlay=${x}:${y}:format=auto,format=rgb24[out]`])
  ].join(";");
  await ffmpeg(["-i", background, "-i", actorRgba, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", output]);
  return { ...parameters, x, y, actorWidth, actorHeight };
}
