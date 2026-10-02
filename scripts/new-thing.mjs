// Makes a new character, scene, or item in the vault from a template: its
// own folder, its notes, and its own canvas with every art recipe card ready
// (status: idea). Nothing is generated and nothing is spent.
//
//   npm run new -- character "Mira" "a tired night nurse in her 50s, short grey hair, blue scrubs"
//   npm run new -- scene "Loading bay" "a dim loading bay at night, roller doors, pallets, one strip light"
//   npm run new -- item "Torch" "a heavy black police torch"
//
// Add --vault <folder> to write somewhere other than game/.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FENCE = "```";

export const slugOf = (name) => String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const quote = (text) => JSON.stringify(String(text));

async function write(vault, path, text) {
  const full = join(vault, path);
  if (existsSync(full)) throw new Error(`${path} already exists`);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, text.trimEnd() + "\n");
  return path;
}

/** A style card copied from the style library on Assets.canvas, so this canvas is self-contained. */
async function libraryStyle(vault, id, x, y) {
  try {
    const assets = JSON.parse(await readFile(join(vault, "Assets.canvas"), "utf8"));
    const card = assets.nodes.find((node) => node.id === id);
    if (card) return { ...card, x, y };
  } catch {
    // No library: the recipe cards still work, just without that style.
  }
  return null;
}

const text = (id, x, y, body, width = 560, height = 340) => ({ id, type: "text", x, y, width, height, text: body });
const file = (id, path, x, y, width = 420, height = 300) => ({ id, type: "file", file: path, x, y, width, height });
const group = (id, label, x, y, width, height) => ({ id, type: "group", label, x, y, width, height, color: "6" });
const edge = (from, to, label) => ({ id: `e-${from}-${to}`, fromNode: from, fromSide: "right", toNode: to, toSide: "left", toEnd: "arrow", label });
const recipe = (name, kind, fields, prompt) =>
  `## ${name}\n${kind}\nstatus: idea\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}${prompt ? `\nprompt: ${quote(prompt)}` : ""}\n`;

// ------------------------------------------------------------------ character

const MOODS = {
  friendly: "the expression, which is now a warm, slightly awkward friendly smile with raised eyebrows.",
  irritated: "the expression, which is now irritated and impatient: jaw clenched, brows lowered, lips pressed thin.",
  hostile: "the expression, which is now hostile: glaring hard at the camera, brows pulled down, mouth open mid-snarl.",
  suspicious: "the expression, which is now suspicious: eyes narrowed, one eyebrow raised, head tilted slightly.",
  afraid: "the expression, which is now afraid: eyes wide, eyebrows raised high, mouth slightly open.",
  "blink-half": "the eyes, which are now half closed, halfway through a blink. Nothing else changes.",
  "blink-closed": "the eyes, which are now fully closed in a natural blink. Nothing else changes."
};
const TALKING = ["friendly", "irritated", "hostile", "suspicious", "afraid"];

function characterActions(NAME, slug) {
  return [
    {
      id: `${NAME}_ANSWER_QUESTION`,
      label: "Answer a harmless question",
      available: ["state.irritation <= 70"],
      effects: ["state trust +2"],
      criteria: "Answer a harmless question about yourself, this place, or the rules, without giving the player what they came for.",
      mock: { when: "detector.question", priority: 20 },
      lines: ["I can tell you that much.", "Fair question. Here's the answer."]
    },
    {
      id: `${NAME}_ASK_FOR_REASON`,
      label: "Ask what they want",
      available: [`not flag.${slug}-asked`],
      effects: ["state trust +2", `flag ${slug}-asked`],
      criteria: "Ask once what the player wants, when their purpose is missing or unclear.",
      mock: { default: true },
      lines: ["What is it you want, [[address]]?", "Go on. What do you need?"]
    },
    {
      id: `${NAME}_REFUSE_REQUEST`,
      label: "Say no",
      effects: ["state suspicion +3", "state irritation +2"],
      criteria: "Refuse when what the player wants cannot be allowed, or their reason is not good enough.",
      mock: { when: "detector.entryRequest", priority: 10 },
      lines: ["No. Not tonight.", "I can't do that."]
    },
    {
      id: `${NAME}_END_CONVERSATION`,
      label: "End the conversation",
      effects: ["state irritation +5"],
      criteria: "End the exchange when the player leaves, or when talking further is pointless.",
      mock: { when: "detector.leave", priority: 30 },
      ends: `${slug}-talk-over`,
      lines: ["We're done here.", "Goodnight, [[address]]."]
    }
  ];
}

async function newCharacter(vault, name, description) {
  const slug = slugOf(name);
  const NAME = slug.toUpperCase().replace(/-/g, "_");
  const base = `characters/${slug}`;
  if (existsSync(join(vault, base))) throw new Error(`${base} already exists`);
  const actions = characterActions(NAME, slug);
  const kebab = (id) => `${slug}-${id.slice(NAME.length + 1).toLowerCase().replaceAll("_", "-")}`;
  const written = [];
  const add = async (path, body) => written.push(await write(vault, `${base}/${path}`, body));

  await add(`${name}.md`, `---
type: character
name: ${name}
role: ${quote(description)}
iq: 100
patience: 50
greed: 25
courage: 60
sympathy: 50
ruleFollowing: 70
trust: 30
suspicion: 30
irritation: 10
fear: 5
memoryMax: 8
historyMax: 12
fallbackAction: "[[${NAME}_REFUSE_REQUEST]]"
tree: "[[${slug}-tree.canvas]]"
lines: "[[${slug}-lines]]"
portraits: "[[${slug}-portraits]]"
---

# ${name}

${description}

Made from the character template. Everything below is a starting point: edit it. Their art is on [[${name}.canvas]].

## Style
${description}. Plain, everyday speech.

## Goals
${FENCE}yaml
- id: do_the_job
  label: Do the job properly
  priority: 100
- id: avoid_trouble
  label: Avoid trouble
  priority: 60
${FENCE}

## Tones
The first row that is true sets the tone. The tone picks the line set.

${FENCE}yaml
- tone: hostile
  when: state.irritation > 70
- tone: irritated
  when: state.irritation > 40
- tone: friendly
  when: state.trust > 65
- tone: neutral
${FENCE}

## Scene
What ${name} knows about where they are. It goes to the model each turn.

${FENCE}yaml
location: "where ${name} is (edit me)"
time: "02:13"
${FENCE}

## Prompt
How the model is asked to choose. Each action's \`## Criteria\` is added to this.

${FENCE}yaml
role: ${quote(description)}
instructions: ${quote(`Which single action should ${name} take immediately after the latest player message? Judge it in light of ${name}'s personality, current state, goals, memories, and the recent conversation. Select the best immediate action from the available criteria.`)}
pendingGuidance: ${quote(`conversationSignals.pendingRequest, when present, is something ${name} asked the player on an earlier turn that they still owe an answer to. Treat it as still open until responseStatus is 'satisfied' or 'refused'. `)}
${FENCE}

## Profiles
- [[${slug}-default]]

## Actions
${actions.map((action) => `- [[${action.id}]]`).join("\n")}
`);

  await add(`profiles/${slug}-default.md`, `---
type: profile
character: "[[${name}]]"
address: friend
label: Default
trustThreshold: 55
voice: en-gb+f3
rate: 1
pitch: 1
preDelayMs: 60
---

# ${slug}-default

${name}'s only profile so far. Add more profiles (and list them in [[${name}]]) for different moods or accents; one is picked at random each game.

## Decision style
Practical and fair, but not a pushover.
`);

  for (const action of actions) {
    const props = [
      "type: action",
      `character: "[[${name}]]"`,
      `label: ${action.label}`,
      ...(action.available ? ["available:", ...action.available.map((item) => `  - ${item}`)] : []),
      "effects:",
      ...action.effects.map((item) => `  - ${item}`),
      ...(action.ends ? [`ends: "[[${action.ends}]]"`] : []),
      ...(action.id.endsWith("END_CONVERSATION") ? [] : ["acknowledgesName: true"]),
      `dialogue: "[[${kebab(action.id)}]]"`
    ];
    await add(`actions/${action.id}.md`, `---
${props.join("\n")}
---

# ${action.id}

## Criteria
${action.criteria}

## Mock
What the offline Mock does when there is no Jev key: the available action with the highest \`priority\` whose \`when\` holds, else the one marked \`default\`.

${FENCE}yaml
${Object.entries(action.mock).map(([key, value]) => `${key}: ${value}`).join("\n")}
${FENCE}
`);
    await add(`dialogue/${kebab(action.id)}.md`, `---
type: dialogue
action: "[[${action.id}]]"
---

# ${action.id} — lines

## neutral
${action.lines.map((line) => `- ${line}`).join("\n")}
`);
  }

  await add(`dialogue/${slug}-lines.md`, `---
type: lines
character: "[[${name}]]"
---

# ${name} — other lines

## opening
- Hello, [[address]]. What do you need?

## name-acknowledgement
- All right, [[playerName]].
`);

  await add(`${slug}-portraits.md`, `---
type: portraits
character: "[[${name}]]"
---

# ${name} — portraits

Fill this in once the art on [[${name}.canvas]] is made: copy the layout of [[arthur-portraits]] (\`## Idle\`, \`## Talking\`, \`## Talking by mood\`, \`## Cues\`, \`## Blink\`) and link ${name}'s \`${slug}-booth-…\` frames.
`);

  await add(`${slug}-talk-over.md`, `---
type: outcome
result: failure
title: ${name} ends the talk
code: Talk over
---

# ${name} ends the talk

${name} has had enough and stops talking.
`);

  await add(`${slug}-tree.canvas`, JSON.stringify({
    nodes: [
      text("legend", -700, 0, "### How to read this\n\n**open** node: the player types freely and the model picks an action.\n**script** node: fixed lines, no model call.\n\nSee [[arthur-tree.canvas]] for a fuller example (an item and a phone call).", 600, 300),
      text("talk", 0, 0, `## talk\nopen\nsay opening\n\nFree talk with [[${name}]].`, 480, 220)
    ],
    edges: []
  }, null, "\t"));

  // Their own canvas: notes on top, then every art recipe, ready to run.
  const look = 2000;
  const talk = look + 1700;
  const nodes = [
    text("readme", 0, -320, `# ${name}\n${description}\n\nEverything about ${name}, top to bottom. Right-click a recipe card to make its art; it saves into \`${base}/art/\`. Make them in order: room and actor, then the moods, then the talking loops, then the booth.`, 1600, 240),
    group("g-who", "Who they are", -40, -80, 1960, 520),
    file("n-character", `${base}/${name}.md`, 0, 0, 560, 400),
    file("n-profile", `${base}/profiles/${slug}-default.md`, 640, 0),
    file("n-portraits", `${base}/${slug}-portraits.md`, 1100, 0),
    group("g-decides", "How they decide, and what they say", -40, 520, 2420, 820),
    file("n-tree", `${base}/${slug}-tree.canvas`, 0, 600, 420, 300),
    ...actions.map((action, index) => file(`n-${action.id}`, `${base}/actions/${action.id}.md`, 480 + index * 460, 600)),
    ...actions.map((action, index) => file(`n-${kebab(action.id)}`, `${base}/dialogue/${kebab(action.id)}.md`, 480 + index * 460, 960)),
    file("n-lines", `${base}/dialogue/${slug}-lines.md`, 0, 960),
    group("g-look", "Look: the room, the actor, moods and blinks", -40, look - 80, 4200, 1560),
    text(`${slug}-room`, 700, look, recipe(`${slug}-room`, "image", { model: "z-image", size: "1024x768", seed: 11 },
      `the place where ${name} works, seen through a camera: (describe it). ${description}`)),
    text(`${slug}-actor`, 700, look + 400, recipe(`${slug}-actor`, "image", { model: "krea-2", size: "1024x768", seed: 12 },
      `${description}, seen waist-up, facing the camera`)),
    text(`${slug}-keep`, 0, look + 800, `## ${slug}-keep\nstyle\n# Holds ${name} steady in edits: only the named part changes.\ntemplate: ${quote(`Keep the exact same person: same face, hair and clothes (${description}). Keep the exact same framing, crop, camera position and pose, and the same flat, evenly lit chroma-key green screen background, lighting and camera quality. Only change {prompt}`)}\n`, 560, 360),
    ...Object.entries(MOODS).map(([mood, prompt], index) =>
      text(`${slug}-${mood}`, 1900 + (index % 3) * 760, look + 800 + Math.floor(index / 3) * 360, recipe(`${slug}-${mood}`, "edit", { model: "qwen-edit", seed: 7 }, prompt), 560, 300)),
    group("g-talk", "Talking: a loop per mood, then everything into the room", -40, talk - 80, 4200, 1500),
    text(`${slug}-talk`, 700, talk, recipe(`${slug}-talk`, "animate", { model: "h3-max-turbo", seconds: 5, from: 0.5, to: 4.5, frames: 8, fps: 8, pingpong: true },
      "talks into the camera with small, natural mouth and head movements, locked-off static camera, the green screen background stays flat and unchanged")),
    ...TALKING.map((mood, index) =>
      text(`${slug}-${mood}-talk`, 1900 + (index % 3) * 760, talk + Math.floor(index / 3) * 400, recipe(`${slug}-${mood}-talk`, "animate", { model: "h3-max-turbo", seconds: 5, from: 0.5, to: 4.5, frames: 8, fps: 8, pingpong: true },
        `talks into the camera in a ${mood} way, small natural movements`), 560, 340)),
    text(`${slug}-booth`, 700, talk + 900, `## ${slug}-booth\ncomposite\nstatus: idea\n# Free: every ${name} picture into the room, keyed together so moods and blinks line up.\nalign: true\nshot: waist-up\nheight: 0.92\nx: 0.45\nseed: 3\ncrunch: 4\njpeg: 50\n`, 560, 380)
  ];
  const styles = [
    await libraryStyle(vault, "style-room", 0, look),
    await libraryStyle(vault, "style-actor-green", 0, look + 400),
    await libraryStyle(vault, "talk-loop", 0, talk)
  ].filter(Boolean);
  nodes.push(...styles);
  const has = (id) => nodes.some((node) => node.id === id);
  const edges = [
    has("style-room") && edge("style-room", `${slug}-room`, "style"),
    has("style-actor-green") && edge("style-actor-green", `${slug}-actor`, "style"),
    ...Object.keys(MOODS).flatMap((mood) => [edge(`${slug}-actor`, `${slug}-${mood}`, "edit"), edge(`${slug}-keep`, `${slug}-${mood}`, "style")]),
    edge(`${slug}-actor`, `${slug}-talk`, "start"),
    has("talk-loop") && edge("talk-loop", `${slug}-talk`, "style"),
    ...TALKING.flatMap((mood) => [edge(`${slug}-${mood}`, `${slug}-${mood}-talk`, "start"), ...(has("talk-loop") ? [edge("talk-loop", `${slug}-${mood}-talk`, "style")] : [])]),
    edge(`${slug}-room`, `${slug}-booth`, "room"),
    edge(`${slug}-actor`, `${slug}-booth`, "actor"),
    ...Object.keys(MOODS).map((mood) => edge(`${slug}-${mood}`, `${slug}-booth`, "actor")),
    edge(`${slug}-talk`, `${slug}-booth`, "actor"),
    ...TALKING.map((mood) => edge(`${slug}-${mood}-talk`, `${slug}-booth`, "actor"))
  ].filter(Boolean);
  await add(`${name}.canvas`, JSON.stringify({ nodes, edges }, null, "\t"));
  return { canvas: `${base}/${name}.canvas`, written };
}

// ------------------------------------------------------------------ scene

async function newScene(vault, name, description) {
  const slug = slugOf(name);
  const base = `screens/${slug}`;
  if (existsSync(join(vault, base))) throw new Error(`${base} already exists`);
  const written = [];
  const add = async (path, body) => written.push(await write(vault, `${base}/${path}`, body));
  await add(`${slug}.md`, `---
type: screen
title: ${name}
width: 640
height: 360
objective: (what the player should do here)
---

# ${name}

${description}

Made from the scene template. Its art is on [[${slug}.canvas]]. Where things sit is the \`${slug}\` group on [[World.canvas]]: make the background, then drag its picture into that group, and drag props and objects on top.
`);
  const nodes = [
    text("readme", 0, -320, `# ${name}\n${description}\n\nRight-click a recipe card to make its art; it saves into \`${base}/art/\`. Then place it on [[World.canvas]] in the \`${slug}\` group.`, 1600, 240),
    group("g-screen", "The screen", -40, -80, 700, 500),
    file("n-screen", `${base}/${slug}.md`, 0, 0, 560, 360),
    group("g-art", "Art: the background, and a prop cut out of green (left to right: make, cut out)", -40, 520, 3000, 900),
    text(`${slug}-background`, 700, 600, recipe(`${slug}-background`, "image", { model: "z-image", size: "1280x720", seed: 21 }, `${description}, seen straight on from a security camera`)),
    text(`${slug}-prop`, 700, 1000, recipe(`${slug}-prop`, "image", { model: "krea-2", size: "768x1024", seed: 22 }, `(a prop for this scene), seen straight on`)),
    text(`${slug}-prop-cut`, 1400, 1000, `## ${slug}-prop-cut\ncutout\nstatus: idea\n# Free: keyed off the green screen. mirror: true also makes a mirror image.\ncrunch: 4\njpeg: 50\n`, 520, 260)
  ];
  const styles = [await libraryStyle(vault, "style-room", 0, 600), await libraryStyle(vault, "krea-prop-green", 0, 1000)].filter(Boolean);
  nodes.push(...styles);
  const edges = [
    styles.some((node) => node.id === "style-room") && edge("style-room", `${slug}-background`, "style"),
    styles.some((node) => node.id === "krea-prop-green") && edge("krea-prop-green", `${slug}-prop`, "style"),
    edge(`${slug}-prop`, `${slug}-prop-cut`, "cut out")
  ].filter(Boolean);
  await add(`${slug}.canvas`, JSON.stringify({ nodes, edges }, null, "\t"));

  // A screen group on the world canvas, below everything else.
  const worldPath = join(vault, "World.canvas");
  if (existsSync(worldPath)) {
    const world = JSON.parse(await readFile(worldPath, "utf8"));
    const bottom = Math.max(0, ...world.nodes.map((node) => node.y + node.height));
    world.nodes.push(
      group(`screen-${slug}`, slug, 0, bottom + 200, 1360, 820),
      text(`hint-${slug}`, 40, bottom + 260, `Make the background on [[${slug}.canvas]], then drag its picture into this group to set the screen.`, 600, 160)
    );
    await writeFile(worldPath, JSON.stringify(world, null, "\t"));
    written.push("World.canvas (new group)");
  }
  return { canvas: `${base}/${slug}.canvas`, written };
}

// ------------------------------------------------------------------ item

async function newItem(vault, name, description) {
  const slug = slugOf(name);
  const base = `items/${slug}`;
  if (existsSync(join(vault, base))) throw new Error(`${base} already exists`);
  const written = [];
  const add = async (path, body) => written.push(await write(vault, `${base}/${path}`, body));
  await add(`${slug}.md`, `---
type: item
name: ${name}
startWith: false
once: true
useText: ${quote(`I show the ${name.toLowerCase()}.`)}
effects:
  - item ${slug} shown
---

# ${name}

${description}

Made from the item template. Its art is on [[${slug}.canvas]].

- \`startWith: true\` puts it in the player's hands at the start.
- \`usableOn: "[[Character]]"\` lets the player show it to that character; a \`if item.${slug} = shown\` arrow in their dialogue tree then reacts to it.
`);
  const nodes = [
    group("g-item", name, -40, -80, 2600, 900),
    file("n-item", `${base}/${slug}.md`, 0, 0, 560, 360),
    text(`${slug}-picture`, 700, 0, recipe(`${slug}-picture`, "image", { model: "krea-2", size: "1024x768", seed: 31 }, `${description}, lying flat, seen straight on`)),
    text(`${slug}-picture-cut`, 1400, 0, `## ${slug}-picture-cut\ncutout\nstatus: idea\n# Free: keyed off the green screen.\ncrunch: 4\njpeg: 50\n`, 520, 260)
  ];
  const style = await libraryStyle(vault, "krea-prop-green", 0, 420);
  if (style) nodes.push(style);
  const edges = [style && edge("krea-prop-green", `${slug}-picture`, "style"), edge(`${slug}-picture`, `${slug}-picture-cut`, "cut out")].filter(Boolean);
  await add(`${slug}.canvas`, JSON.stringify({ nodes, edges }, null, "\t"));
  return { canvas: `${base}/${slug}.canvas`, written };
}

export async function newThing(kind, name, description = "", vault = join(ROOT, "game")) {
  if (!name || !slugOf(name)) throw new Error("Give it a name.");
  const make = { character: newCharacter, scene: newScene, item: newItem }[kind];
  if (!make) throw new Error(`Make a character, scene, or item (not "${kind}").`);
  return make(vault, String(name).trim(), String(description || name).trim());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const vaultFlag = args.indexOf("--vault");
  const vault = vaultFlag >= 0 ? args.splice(vaultFlag, 2)[1] : join(ROOT, "game");
  const [kind, name, description] = args;
  try {
    const { canvas, written } = await newThing(kind, name, description, vault);
    console.log(`Made ${kind} "${name}": ${written.length} files. Open ${canvas}`);
  } catch (error) {
    console.error(`Could not make it: ${error.message}`);
    process.exitCode = 1;
  }
}
