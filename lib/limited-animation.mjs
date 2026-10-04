// Turns a video clip into limited animation: a few held frames, like a
// 90s CD-ROM game, instead of smooth 24 fps motion. Uses ffmpeg.
//
// frames   how many drawings to keep (spread evenly over the time window)
// fps      how fast they play back (8 = each drawing held for 3 film frames)
// from/to  the part of the clip to take frames from, in seconds
// colors   reduce to this many colours with ordered dithering (0 = off)
// width    scale frames to this width (keeps the shape)
// pingpong play forward then back, so the loop has no jump
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ffmpeg = (args) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const pad = (n) => String(n).padStart(2, "0");

export async function clipDuration(video) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Could not read the length of ${video}`);
  return seconds;
}

/** The times (seconds) to take `frames` drawings from, evenly spread. */
export function frameTimes(duration, { frames, from = 0, to = null }) {
  const start = Math.max(0, from);
  const end = Math.min(duration, to ?? duration);
  if (!(end > start)) throw new Error(`Empty time window ${start}–${end} s (clip is ${duration.toFixed(2)} s)`);
  const step = (end - start) / frames;
  return Array.from({ length: frames }, (_, index) => Number((start + (index + 0.5) * step).toFixed(3)));
}

/** Frame order for playback; pingpong adds the way back without repeating the ends. */
export function playOrder(frames, pingpong) {
  const forward = Array.from({ length: frames }, (_, index) => index);
  return pingpong && frames > 2 ? [...forward, ...forward.slice(1, -1).reverse()] : forward;
}

/**
 * A shareable MP4 of the same drawings, for apps that do not show WebP.
 * The loop repeats to about `seconds`, and the frames are enlarged with
 * sharp pixels to at least `minWidth`, so the crunch stays crisp.
 */
async function writeShareVideo(sequence, count, fps, output, { seconds = 4, minWidth = 640 } = {}) {
  const repeats = Math.max(1, Math.ceil((seconds * fps) / count));
  const listDir = dirname(sequence);
  const concat = join(listDir, "share.txt");
  const lines = [];
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    for (let index = 1; index <= count; index += 1) {
      lines.push(`file '${join(listDir, `seq-${String(index).padStart(3, "0")}.png`).replace(/'/g, "'\\''")}'`, `duration ${1 / fps}`);
    }
  }
  // The concat format needs the last file listed again to hold its duration.
  lines.push(lines[lines.length - 2]);
  await writeFile(concat, lines.join("\n"));
  const { width } = await mediaSize(join(listDir, "seq-001.png"));
  const factor = Math.max(1, Math.ceil(minWidth / width));
  await ffmpeg([
    "-f", "concat", "-safe", "0", "-i", concat,
    "-vf", `scale=trunc(iw*${factor}/2)*2:trunc(ih*${factor}/2)*2:flags=neighbor,fps=30`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "medium",
    "-movflags", "+faststart", "-an", output
  ]);
  return output;
}

function checkSettings({ frames, fps, colors }) {
  if (frames !== undefined && !(frames >= 1 && frames <= 48)) throw new Error("frames must be 1–48");
  if (fps !== undefined && !(fps > 0 && fps <= 30)) throw new Error("fps must be 1–30");
  if (colors && !(colors >= 2 && colors <= 256)) throw new Error("colors must be 2–256");
}

/**
 * Step 1: pulls `frames` clean drawings out of a clip, evenly spread over
 * from–to, as raw-01.png… in `dir`. Returns their paths.
 */
export async function extractFrames(video, dir, { frames = 6, from = 0, to = null, width = null } = {}) {
  checkSettings({ frames });
  await mkdir(dir, { recursive: true });
  const times = frameTimes(await clipDuration(video), { frames, from, to });
  const paths = [];
  for (const [index, time] of times.entries()) {
    const out = join(dir, `raw-${pad(index + 1)}.png`);
    const filters = width ? ["-vf", `scale=${width}:-2:flags=lanczos`] : [];
    await ffmpeg(["-ss", String(time), "-i", video, "-frames:v", "1", ...filters, out]);
    paths.push(out);
  }
  return paths;
}

/**
 * Step 2: finishes a list of drawings (PNG paths, in order): crunch, shared
 * palette, then name-01.webp…, a looping animated name.webp, and a
 * shareable name.mp4 in `outDir`.
 * @returns {{ frames: string[], animation: string, video: string }}
 */
export async function finishFrames(inputs, outDir, name, { fps = 8, colors = 0, pingpong = false, width = null, crunch: crunchSettings = null, suffix = "" } = {}) {
  checkSettings({ fps, colors });
  await mkdir(outDir, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "finish-frames-"));
  try {
    let current = [];
    for (const [index, input] of inputs.entries()) {
      const out = join(work, `in-${pad(index + 1)}.png`);
      await ffmpeg(["-i", input, ...(width ? ["-vf", `scale=${width}:-2:flags=lanczos`] : []), out]);
      current.push(out);
    }
    if (crunchSettings) {
      current = await Promise.all(current.map((file, index) => crunch(file, join(work, `crunch-${pad(index + 1)}.png`), crunchSettings)));
    }
    if (colors) {
      // One shared palette for every frame, so colours do not flicker.
      const pattern = current[0].replace(/-01\.png$/, "-%02d.png");
      await ffmpeg(["-i", pattern, "-vf", `palettegen=max_colors=${colors}:stats_mode=full`, join(work, "palette.png")]);
      await ffmpeg(["-i", pattern, "-i", join(work, "palette.png"), "-lavfi", "paletteuse=dither=bayer:bayer_scale=3", "-start_number", "1", join(work, "pal-%02d.png")]);
      current = current.map((_, index) => join(work, `pal-${pad(index + 1)}.png`));
    }

    const framePaths = [];
    for (const [index, file] of current.entries()) {
      // `suffix` (".clean") names a twin set: name-01.clean.webp…
      const out = join(outDir, `${name}-${pad(index + 1)}${suffix}.webp`);
      await ffmpeg(["-i", file, "-c:v", "libwebp", "-lossless", "1", out]);
      framePaths.push(out);
    }

    // The animated WebP plays the drawings in order at `fps`, looping forever.
    const order = playOrder(current.length, pingpong);
    for (const [position, index] of order.entries()) {
      await copyFile(current[index], join(work, `seq-${String(position + 1).padStart(3, "0")}.png`));
    }
    const animation = join(outDir, `${name}${suffix}.webp`);
    await ffmpeg(["-framerate", String(fps), "-i", join(work, "seq-%03d.png"), "-c:v", "libwebp_anim", "-lossless", "1", "-loop", "0", animation]);
    // A twin set needs no shareable video of its own.
    const shareVideo = suffix ? null : await writeShareVideo(join(work, "seq-001.png"), order.length, fps, join(outDir, `${name}.mp4`));
    return { frames: framePaths, animation, video: shareVideo };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Both steps: a clip in, a finished limited animation out.
 * @returns {{ frames: string[], animation: string, video: string }} file paths in outDir
 */
export async function makeLimitedAnimation(video, outDir, name, { frames = 6, fps = 8, from = 0, to = null, colors = 0, width = null, pingpong = false, crunch: crunchSettings = null } = {}) {
  checkSettings({ frames, fps, colors });
  const work = await mkdtemp(join(tmpdir(), "limited-"));
  try {
    const raw = await extractFrames(video, work, { frames, from, to, width });
    return await finishFrames(raw, outDir, name, { fps, colors, pingpong, crunch: crunchSettings });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Converts any image ffmpeg can read to PNG (a clean, lossless original). */
export async function toPng(input, output) {
  await ffmpeg(["-i", input, output]);
  return output;
}

/** A high-quality JPEG copy, for apps that do not show WebP. */
export async function toJpeg(input, output) {
  await ffmpeg(["-i", input, "-q:v", "2", output]);
  return output;
}

/** Converts a downloaded image (png/jpeg) to WebP. */
export async function toWebp(input, output, { width = null } = {}) {
  const filters = width ? ["-vf", `scale=${width}:-2:flags=lanczos`] : [];
  await ffmpeg(["-i", input, ...filters, "-c:v", "libwebp", "-quality", "92", output]);
  return output;
}

/** Width and height of an image or video file. */
export async function mediaSize(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]);
  const [width, height] = stdout.trim().split(",").map(Number);
  return { width, height };
}

/**
 * Makes sure an image is at least `min` pixels on its short side (video
 * models reject small first frames). Returns the input path when it is big
 * enough, or a new PNG scaled up to `target` on the short side.
 */
export async function ensureMinSize(input, output, { min = 256, target = 512 } = {}) {
  const { width, height } = await mediaSize(input);
  if (Math.min(width, height) >= min) return { path: input, width, height, scaled: false };
  const factor = target / Math.min(width, height);
  const size = { width: Math.round((width * factor) / 2) * 2, height: Math.round((height * factor) / 2) * 2 };
  await ffmpeg(["-i", input, "-vf", `scale=${size.width}:${size.height}:flags=lanczos`, output]);
  return { path: output, ...size, scaled: true };
}

// ffmpeg's JPEG scale runs 2 (best) to 31 (worst) and is far from linear:
// 12 is already very blocky. These points match the usual 1–100 quality
// slider by eye (checked on generated backgrounds).
const JPEG_POINTS = [[100, 2], [80, 4], [60, 7], [40, 11], [20, 19], [1, 31]];

/** A 1–100 JPEG quality as ffmpeg's -q:v value. */
export function jpegScale(quality) {
  for (let i = 1; i < JPEG_POINTS.length; i += 1) {
    const [highQuality, highQ] = JPEG_POINTS[i - 1];
    const [lowQuality, lowQ] = JPEG_POINTS[i];
    if (quality >= lowQuality) {
      return Math.round(highQ + ((highQuality - quality) * (lowQ - highQ)) / (highQuality - lowQuality));
    }
  }
  return 31;
}

/**
 * The "crunch" look: shrink the picture `factor` times, save it as a
 * low-quality JPEG, then blow it back up to full size with no smoothing
 * (nearest neighbour), so the JPEG blocks and pixels stay hard-edged.
 * `quality` is 1–100 (lower = crunchier).
 */
export async function crunch(input, output, { factor = 4, quality = 50, filter = "neighbor" } = {}) {
  if (!(factor >= 1 && factor <= 16)) throw new Error("crunch must be 1–16 (how many times smaller)");
  if (!(quality >= 1 && quality <= 100)) throw new Error("jpeg quality must be 1–100");
  const { width, height } = await mediaSize(input);
  const work = await mkdtemp(join(tmpdir(), "crunch-"));
  try {
    const small = join(work, "small.jpg");
    const q = jpegScale(quality);
    await ffmpeg(["-i", input, "-vf", `scale=trunc(iw/${factor}):trunc(ih/${factor}):flags=area`, "-q:v", String(q), small]);
    await ffmpeg(["-i", small, "-vf", `scale=${width}:${height}:flags=${filter}`, output]);
    return output;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * The crunch look for a picture with transparency (a cut-out prop): the
 * colours are crunched as usual, and the transparency is shrunk and blown
 * back up the same way, so its edges get the same hard pixels.
 */
export async function crunchRgba(input, output, { factor = 4, quality = 50, filter = "neighbor" } = {}) {
  const { width, height } = await mediaSize(input);
  const work = await mkdtemp(join(tmpdir(), "crunch-rgba-"));
  try {
    const small = join(work, "small.jpg");
    const colour = join(work, "colour.png");
    const alpha = join(work, "alpha.png");
    await ffmpeg(["-i", input, "-vf", `scale=trunc(iw/${factor}):trunc(ih/${factor}):flags=area`, "-q:v", String(jpegScale(quality)), small]);
    await ffmpeg(["-i", small, "-vf", `scale=${width}:${height}:flags=${filter}`, colour]);
    await ffmpeg(["-i", input, "-vf", `alphaextract,scale=trunc(iw/${factor}):trunc(ih/${factor}):flags=area,scale=${width}:${height}:flags=${filter}`, alpha]);
    await ffmpeg(["-i", colour, "-i", alpha, "-filter_complex", "[0:v][1:v]alphamerge,format=rgba", output]);
    return output;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Cuts a box out of a picture, losslessly (keeps transparency). */
export async function cropImage(input, output, { x, y, width, height }) {
  await ffmpeg(["-i", input, "-vf", `crop=${width}:${height}:${x}:${y}`, ...(output.endsWith(".webp") ? ["-c:v", "libwebp", "-lossless", "1"] : []), output]);
  return output;
}

/** A left-right mirror image (keeps transparency). */
export async function mirrorImage(input, output) {
  await ffmpeg(["-i", input, "-vf", "hflip", ...(output.endsWith(".webp") ? ["-c:v", "libwebp", "-lossless", "1"] : []), output]);
  return output;
}
