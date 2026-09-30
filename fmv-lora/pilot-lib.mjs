// Shared by the pilots: which 12 prompts they use, how prompts are written,
// and the contact sheet.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const content = (entry) => entry.caption.replace(/^fmvstyle,\s*/, "");
export const hasCue = (entry) => /pre-rendered|computer-generated|composited|pasted/.test(entry.caption);

/** The 12 pilot prompts from SPEC.md §6, picked in file order. */
export function choosePilot(entries) {
  const people = entries.filter((entry) => ["single", "two"].includes(entry.kind));
  const firstOf = (kind, test = () => true) => entries.find((entry) => entry.kind === kind && test(entry));
  const picked = [
    ...people.filter(hasCue).slice(0, 4),
    ...people.filter((entry) => !hasCue(entry)).slice(0, 3),
    firstOf("wide"),
    firstOf("empty"),
    firstOf("insert"),
    firstOf("chroma", (entry) => entry.genre === "chroma-green"),
    firstOf("chroma", (entry) => entry.genre === "chroma-blue")
  ];
  if (picked.some((entry) => !entry)) throw new Error("the prompt file is missing a kind the pilot needs");
  return picked;
}

const chromaScreen = (entry) => (entry.genre.endsWith("green") ? "pure green #00FF00" : "pure blue #0000FF");

// Version 1: the first Z-Image pilot, kept as it ran.
const STYLE_V1 = {
  people:
    "A still frame from a 1995 CD-ROM full-motion-video computer game. A digitized live-action actor composited over a pre-rendered 3D CGI set, early 1990s 3D rendering with flat shading and low-polygon models, stiff community-theatre acting, video-captured footage. Scene: ",
  set: "A still frame from a 1995 CD-ROM computer game: a pre-rendered 3D CGI background, early 1990s 3D rendering with flat shading, low-polygon models and simple textures. Scene: ",
  chroma: "A 1995 video capture of a live-action actor filmed for a CD-ROM game on a chroma-key stage. Scene: "
};

export function promptsV1(entry) {
  const scene = content(entry);
  if (entry.kind === "chroma") {
    const clean = `${scene}, solid ${chromaScreen(entry)} background, evenly lit`;
    return { bare: `${clean}.`, styled: `${STYLE_V1.chroma}${clean}.` };
  }
  const style = ["empty", "insert"].includes(entry.kind) ? STYLE_V1.set : STYLE_V1.people;
  return { bare: `${scene}.`, styled: `${style}${scene}.` };
}

// Version 2, after the Z-Image pilot: "3D" words stay off people (they made
// cartoons), "moonlight" no longer draws a moon, and text is asked away.
const STYLE_V2 = {
  people:
    "A still frame from a 1995 CD-ROM full-motion-video computer game. A real live-action actor filmed on video and digitized, composited over a pre-rendered CGI background with mismatched lighting, stiff community-theatre acting. Scene: ",
  set: STYLE_V1.set,
  chroma: STYLE_V1.chroma
};

export function styledV2(entry) {
  const scene = content(entry).replaceAll("blue moonlight gel", "cool blue gel light");
  if (entry.kind === "chroma") return `${STYLE_V2.chroma}${scene}, solid ${chromaScreen(entry)} background, evenly lit.`;
  const style = ["empty", "insert"].includes(entry.kind) ? STYLE_V2.set : STYLE_V2.people;
  return `${style}${scene}, no text or lettering.`;
}

/**
 * A contact sheet: one row per prompt, one column per version, 480x360 each.
 * `rows` are { id, kind, cue, files: { [column]: path } }.
 */
export async function contactSheet(rows, columns, file) {
  // A cell is a path, or { path, label } to label it yourself.
  const inputs = rows.flatMap((row) =>
    columns.map((column) => {
      const cell = row.files[column];
      return typeof cell === "string" ? { row, column, path: cell } : { row, column, path: cell.path, label: cell.label };
    })
  );
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const input of inputs) args.push("-i", input.path);
  const labelled = inputs
    .map(({ row, column, label }, index) => {
      const text = (label ?? `${row.id} ${row.kind}${row.cue ? "+cue" : ""} ${column.toUpperCase()}`).replace(/[:']/g, "");
      return `[${index}:v]scale=480:360:flags=neighbor,drawtext=text='${text}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6[v${index}]`;
    })
    .join(";");
  const layout = inputs.map((_, index) => `${(index % columns.length) * 480}_${Math.floor(index / columns.length) * 360}`).join("|");
  const graph = `${labelled};${inputs.map((_, index) => `[v${index}]`).join("")}xstack=inputs=${inputs.length}:layout=${layout}[out]`;
  await run("ffmpeg", [...args, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", file]);
}
