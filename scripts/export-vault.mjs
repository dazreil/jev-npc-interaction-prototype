// One-time converter (ENGINE_SPEC.md step 1): writes the current Arthur
// encounter as an Obsidian vault in game/. It reads the live data and code
// constants, so the vault shows what the game does today. Rerun it freely;
// it overwrites only the files it writes.
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { ARTHUR_CHARACTER_PROFILES, getTrustEntryThreshold } from "../js/character.js";
import {
  ACTION_CRITERIA,
  ALLOW_ENTRY_MIN_CONFIDENCE,
  ALLOW_ENTRY_MIN_CREDIBILITY,
  deriveJevConsequences
} from "../js/providers/jev.js";
import { AVAILABLE_ACTIONS, FALLBACK_ACTION, MAX_HISTORY_ENTRIES, MAX_MEMORIES, MAX_REFUSALS, MAX_SUPPORT_REQUESTS } from "../js/game.js";
import { getPortraitCue } from "../js/performance.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vault = join(root, "game");
const read = async (path) => readFile(join(root, path), "utf8");
const arthur = JSON.parse(await read("data/arthur.json"));
const dialogue = JSON.parse(await read("data/dialogue.json"));
const FENCE = "```";
const written = [];

async function write(path, text) {
  const full = join(vault, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, text.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
  written.push(path);
}

function frontmatter(props) {
  return `---\n${YAML.stringify(props, { lineWidth: 0 }).trimEnd()}\n---\n`;
}

function rule(value) {
  return `${FENCE}yaml\n${YAML.stringify(value, { lineWidth: 0, flowCollectionPadding: true }).trimEnd()}\n${FENCE}\n`;
}

const link = (id) => `[[${id}]]`;
const kebab = (action) => action.toLowerCase().replaceAll("_", "-");

// ---------------------------------------------------------------- detectors
// The mock provider's patterns plus the two rules game.js uses directly.
const mockSource = await read("js/providers/mock.js");
const patternBody = mockSource.slice(
  mockSource.indexOf("const patterns = {") + "const patterns = ".length,
  mockSource.indexOf("};", mockSource.indexOf("const patterns = {")) + 1
);
const mockPatterns = new Function(`return ${patternBody}`)();
const gameSource = await read("js/game.js");
const grab = (name) => new Function(`return ${gameSource.match(new RegExp(`const ${name} =\\s*(\\/[\\s\\S]*?\\/[a-z]*);`))[1]}`)();
const detectors = {
  ...mockPatterns,
  "company-call-consent": grab("COMPANY_CALL_CONSENT"),
  "company-call-refusal": grab("COMPANY_CALL_REFUSAL")
};
const detectorTests = {
  weapon: { match: ["I have a gun", "I'm armed"], miss: ["I fixed the gate arm"] },
  emergency: { match: ["There's a gas leak in unit 4"], miss: ["I service the fire alarm panel"] },
  bribe: { match: ["I can pay you fifty quid"], miss: ["I work in payroll"] },
  repair: { match: ["Sorry, I lost my temper"], miss: ["Open the gate"] },
  hostile: { match: ["Shut up, old man"], miss: ["Thanks for your help"] },
  "company-call-consent": { match: ["Go ahead and call the company"], miss: ["Please don't call anyone"] }
};
const detectorNotes = {
  threat: "A threat against Arthur or the gate.",
  weapon: "A gun or other weapon. Also picks the `weapon` line set.",
  trespass: "The player says they will get in anyway.",
  bribe: "Money offered.",
  authority: "The player claims a work or official reason.",
  workTask: "The player names a work task, such as fixing a machine.",
  delivery: "The player claims a delivery.",
  personal: "A personal errand. Never enough to open the gate.",
  proof: "The player names a document or proof.",
  emergency: "An emergency. Fire alarm equipment does not count.",
  detail: "A specific work detail, such as a job number.",
  polite: "Polite words.",
  hostile: "Insults.",
  repair: "An apology or a clarification.",
  question: "A question.",
  sympathy: "An appeal for sympathy.",
  entryRequest: "A direct request to come in.",
  lieAdmission: "The player admits a lie.",
  leave: "The player is leaving.",
  "company-call-consent": "The player agrees that Arthur can call the company.",
  "company-call-refusal": "The player says not to call. Beats consent."
};
let detectorText = `${frontmatter({ type: "detectors" })}
# Detectors

Named word patterns. Conditions test them as \`detector = <name>\`.
Each \`match\` / \`miss\` list is a test. The checker runs it on every build.

`;
for (const [name, pattern] of Object.entries(detectors)) {
  const block = { pattern: pattern.source };
  if (pattern.flags && pattern.flags !== "i") block.flags = pattern.flags;
  const tests = detectorTests[name];
  if (tests) {
    for (const text of tests.match) if (!pattern.test(text)) throw new Error(`${name} should match: ${text}`);
    for (const text of tests.miss) if (pattern.test(text)) throw new Error(`${name} should miss: ${text}`);
    Object.assign(block, tests);
  }
  detectorText += `## ${name}\n${detectorNotes[name] ?? ""}\n\n${rule(block)}\n`;
}
await write("detectors.md", detectorText);

// ---------------------------------------------------------------- character
const RISK_TAGS = ["threat", "weapon", "bribe", "contradiction", "dishonesty", "lie", "suspicion"];
await write(
  "characters/arthur/Arthur.md",
  `${frontmatter({
    type: "character",
    name: arthur.name,
    role: arthur.role,
    iq: arthur.cognition.estimatedIq,
    ...arthur.personality,
    ...arthur.state,
    memoryMax: MAX_MEMORIES,
    historyMax: MAX_HISTORY_ENTRIES,
    fallbackAction: link(FALLBACK_ACTION),
    profilePick: "random",
    tree: link("arthur-tree.canvas"),
    lines: link("arthur-lines"),
    portraits: link("arthur-portraits")
  })}
# Arthur

![[arthur-intercom.webp|220]]

## Style
${arthur.cognition.style}

## Goals
${rule(arthur.goals.map(({ id, label, priority }) => ({ id: id.replaceAll("_", "-"), label, priority })))}
## Tones
The first row that is true sets his tone. The tone picks the line set.

${rule([
    { tone: "hostile", when: "state.irritation > 70" },
    { tone: "irritated", when: "state.irritation > 40" },
    { tone: "friendly", when: "state.trust > 65" },
    { tone: "neutral" }
  ])}
## Line choice order
1. A profile override (\`## @pal\` in a dialogue note).
2. The \`weapon\` set, when [[detectors#weapon]] matches.
3. The \`name\` set, when the player asks his name (built-in signal \`name-question\`).
4. The set for his tone, else \`neutral\`.

## Profiles
${Object.keys(ARTHUR_CHARACTER_PROFILES).map((id) => `- ${link(id)}`).join("\n")}

## Actions
${AVAILABLE_ACTIONS.map((action) => `- ${link(action)}`).join("\n")}

%% Design note: Arthur should feel tired, not stupid. %%
`
);

for (const [id, profile] of Object.entries(ARTHUR_CHARACTER_PROFILES)) {
  const personality = { ...arthur.personality, ...profile.personality };
  const line = dialogue.profiles?.[id] ?? {};
  await write(
    `characters/arthur/profiles/${id}.md`,
    `${frontmatter({
      type: "profile",
      character: link("Arthur"),
      address: id,
      label: profile.label,
      ...profile.personality,
      ...profile.initialState,
      trustThreshold: getTrustEntryThreshold(personality),
      voice: profile.speech.voice,
      rate: profile.speech.rate,
      pitch: profile.speech.pitch,
      preDelayMs: profile.speech.preDelayMs
    })}
# ${id} — ${profile.label}

Picked at random when the game starts. Arthur calls the player "${id}".

## Decision style
${profile.decisionStyle}

## Opening
> ${line.opening ?? dialogue.opening}

His own lines for some actions are in each dialogue note under \`## @${id}\`.
`
  );
}

// ---------------------------------------------------------------- actions
const ACTION_RULES = {
  ANSWER_QUESTION: { label: "Answer a harmless question", available: ["state.irritation <= 70"] },
  REFUSE_ENTRY: { label: "Refuse entry", effects: ["counter refusals +1"] },
  ASK_FOR_REASON: {
    label: "Ask why they are here",
    available: ["not flag.reason-asked"],
    effects: ["flag reason-asked"],
    opensRequest: "purpose"
  },
  ASK_FOR_PROOF: {
    label: "Ask for a detail he can check",
    available: [`counter.support-requests < ${MAX_SUPPORT_REQUESTS}`],
    effects: ["counter support-requests +1"],
    opensRequest: "proof"
  },
  ALLOW_ENTRY: {
    label: "Open the car-park gate",
    available: [
      `no memory.tag in [${RISK_TAGS.join(", ")}] since repair`,
      "state.suspicion < 78",
      "state.irritation < 71"
    ],
    alsoNeeds: {
      any: ["state.trust >= profile.trustThreshold", "some memory.tag in [authority, emergency, delivery, proof]"]
    },
    minConfidence: ALLOW_ENTRY_MIN_CONFIDENCE,
    judgment: "entry-case-credible",
    judgmentMin: ALLOW_ENTRY_MIN_CREDIBILITY,
    judgmentQuestion: "Is the player's spoken case for entry credible?",
    ends: link("entry-granted")
  },
  WARN_PLAYER: { label: "Give a firm warning" },
  DEESCALATE_THREAT: { label: "Calm a weapon threat" },
  THREATEN_PLAYER: { label: "Warn that security will be called" },
  SHOW_SYMPATHY: { label: "Show sympathy", available: ["state.irritation <= 70"] },
  BECOME_SUSPICIOUS: {
    label: "Challenge a contradiction",
    available: ["not signal.unresolved-suspicion"]
  },
  REPAIR_CONVERSATION: {
    label: "Accept an apology or clarification",
    alsoNeeds: {
      any: [
        "signal.unresolved-suspicion",
        `some memory.tag in [${RISK_TAGS.join(", ")}] since repair`,
        "signal.tension-raised"
      ]
    },
    effects: ["flag reason-asked off", "counter support-requests = 0"]
  },
  END_CONVERSATION: { label: "End the conversation" }
};

for (const action of AVAILABLE_ACTIONS) {
  const spec = ACTION_RULES[action];
  const changes = deriveJevConsequences(action, { playerInput: "" }).stateChanges;
  const stateEffects = Object.entries(changes).map(([key, delta]) => `state ${key} ${delta > 0 ? "+" : ""}${delta}`);
  const props = {
    type: "action",
    character: link("Arthur"),
    label: spec.label,
    ...(spec.available ? { available: spec.available } : {}),
    effects: [...stateEffects, ...(spec.effects ?? [])],
    ...(spec.opensRequest ? { opensRequest: spec.opensRequest } : {}),
    ...(spec.minConfidence !== undefined
      ? { minConfidence: spec.minConfidence, judgment: spec.judgment, judgmentMin: spec.judgmentMin }
      : {}),
    ...(spec.ends ? { ends: spec.ends } : {}),
    portraitCue: getPortraitCue(action, "__none__"),
    dialogue: link(kebab(action))
  };
  await write(
    `characters/arthur/actions/${action}.md`,
    `${frontmatter(props)}
# ${action}

## Criteria
${ACTION_CRITERIA[action]}
${spec.judgmentQuestion ? `\n## Judgment\n${spec.judgmentQuestion}\n` : ""}${spec.alsoNeeds ? `\n## Also needs\n${rule(spec.alsoNeeds)}` : ""}
%% Mock provider rules are still code in js/providers/mock.js (spec open question 2). %%
`
  );
}

// ---------------------------------------------------------------- dialogue
function renderValue(value, depth = "###") {
  if (typeof value === "string") return `- ${value}\n`;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.map((item) => `- ${item}\n`).join("");
  }
  if (Array.isArray(value)) return `${depth} variants\n${rule(value)}`;
  let out = "";
  const templates = value.templates ?? (value.template ? [value.template] : []);
  for (const template of templates) out += `Template: ${template}\n`;
  if (templates.length) out += "\n";
  for (const [slot, options] of Object.entries(value.slots ?? {})) {
    out += `${depth} ${slot}\n${renderValue(options)}\n`;
  }
  (value.branches ?? []).forEach((branch, index) => {
    const name =
      branch.when?.playerContains?.slice(0, 2).join(" / ") ??
      (branch.when?.lastAction ? `after ${branch.when.lastAction}` : null) ??
      (branch.when?.memoryTag ? `remembers ${branch.when.memoryTag}` : null) ??
      `${index + 1}`;
    const when = [];
    if (branch.when?.playerContains) when.push(`playerContains in [${branch.when.playerContains.join(", ")}]`);
    if (branch.when?.lastAction) when.push(`lastAction = ${branch.when.lastAction}`);
    if (branch.when?.memoryTag) when.push(`some memory.tag in [${branch.when.memoryTag}]`);
    if (branch.when?.tone) when.push(`tone = ${branch.when.tone}`);
    const { when: _when, ...rest } = branch;
    out += `${depth} branch: ${name}\n${rule({ when, ...rest })}\n`;
  });
  return out;
}

const specialTones = {
  weapon: "%% Used when [[detectors#weapon]] matches. %%",
  name: "%% Used when the player asks his name. %%"
};
let lineCount = 0;
for (const action of AVAILABLE_ACTIONS) {
  const tones = dialogue.actions[action];
  const perf = dialogue.performance?.actions?.[action] ?? {};
  const props = {
    type: "dialogue",
    action: link(action),
    ...(perf.portraitCue ? { portraitCue: perf.portraitCue } : {}),
    ...(perf.soundEffect ? { sound: perf.soundEffect } : {}),
    ...(perf.speech?.preDelayMs ? { preDelayMs: perf.speech.preDelayMs } : {}),
    ...(perf.timing?.reactionOutMs ? { reactionOutMs: perf.timing.reactionOutMs } : {})
  };
  let body = `${frontmatter(props)}\n# ${action} — lines\n\n`;
  for (const [tone, value] of Object.entries(tones)) {
    body += `## ${tone}\n${specialTones[tone] ? `${specialTones[tone]}\n` : ""}${renderValue(value)}\n`;
  }
  for (const [profile, data] of Object.entries(dialogue.profiles ?? {})) {
    const value = data.actions?.[action];
    if (value) body += `## @${profile}\n${renderValue(value)}\n`;
  }
  lineCount += (body.match(/^- /gm) ?? []).length;
  await write(`characters/arthur/dialogue/${kebab(action)}.md`, body);
}

let lines = `${frontmatter({ type: "lines", character: link("Arthur") })}
# Arthur — other lines

Lines not tied to an action. Scripts and effects use them by heading, for example \`say company-call-result\`.

## opening
- ${dialogue.opening}

`;
for (const [profile, data] of Object.entries(dialogue.profiles ?? {})) {
  if (data.opening) lines += `## opening @${profile}\n- ${data.opening}\n\n`;
}
lines += `## name-acknowledgement\n- ${dialogue.nameAcknowledgement}\n\n`;
for (const [profile, data] of Object.entries(dialogue.profiles ?? {})) {
  if (data.nameAcknowledgement) lines += `## name-acknowledgement @${profile}\n- ${data.nameAcknowledgement}\n\n`;
}
lines += `## id-shown
- I can see the card. That tells me a name, not why you're here. I could ring your company to check the callout.

## company-call-result
- All right. I rang the company. They have no record of sending you. The gate stays shut.
`;
await write("characters/arthur/dialogue/arthur-lines.md", lines);

// Arthur's intercom portrait: the talking composite made on Assets.canvas
// (night-guard-talk: Arthur animated on a green screen, keyed, and pasted
// into the guard booth; 8 frames at 8 fps, played forward then back).
// Talking loops come from the "booth" composite set, keyed together with
// the moods so switching never jumps: 8 frames each, played forward then back.
const talkLoop = (name) => {
  const frames = Array.from({ length: 8 }, (_, index) => `[[booth-${name}-0${index + 1}.webp]]`);
  return [...frames, ...frames.slice(1, -1).reverse()];
};
const TALK = talkLoop("guard-talk");
// His moods: the Arthur mood sheet on Assets.canvas (Qwen edits of the hero
// shot), keyed together and pasted into the booth by the "booth" card.
const MOOD = Object.fromEntries(
  ["neutral", "friendly", "irritated", "hostile", "suspicious", "afraid", "dismissive", "granted", "blink-half", "blink-closed"].map((mood) => [
    mood,
    `[[booth-${mood === "neutral" ? "guard-actor" : `arthur-${mood}`}.webp]]`
  ])
);
// The game's portrait cues (js/performance.js) → a mood picture.
const CUES = {
  neutral: MOOD.neutral,
  listening: MOOD.neutral,
  blink: MOOD["blink-closed"],
  friendly: MOOD.friendly,
  irritated: MOOD.irritated,
  hostile: MOOD.hostile,
  suspicious: MOOD.suspicious,
  afraid: MOOD.afraid,
  dismissive: MOOD.dismissive,
  "entry-granted": MOOD.granted
};
await write(
  "characters/arthur/arthur-portraits.md",
  `${frontmatter({ type: "portraits", character: link("Arthur") })}
# Arthur — portraits

The intercom shows Arthur from the \`portrait\` slot. He speaks in the mood of each line (its talking loop, longer for longer lines), then settles back to his neutral idle frame and blinks now and then.

The frames come from the \`night-guard-talk\` composite on [[Assets.canvas]]: Arthur animated on a green screen, then pasted into his guard booth. Remake them there, and the game uses the new ones.

## Idle
${rule({ frame: MOOD["neutral"] })}
## Talking
${rule({ frameMs: 125, msPerCharacter: 55, minMs: 1200, frames: TALK })}
## Talking by mood
While he speaks a line with one of these cues, he uses that mood's loop instead.

${rule(Object.fromEntries(
    [["friendly", "friendly"], ["irritated", "irritated"], ["hostile", "hostile"], ["suspicious", "suspicious"], ["afraid", "afraid"], ["dismissive", "dismissive"], ["entry-granted", "granted"]].map(([cue, mood]) => [cue, talkLoop(`arthur-${mood}-talk`)])
  ))}
## Cues
His mood picture for each game cue. He speaks in these moods (see Talking by mood); between lines he rests on Idle.

${rule(CUES)}
## Blink
Whenever he is not talking, he blinks now and then.

${rule({ frameMs: 70, minGapMs: 2500, maxGapMs: 6000, frames: [MOOD["blink-half"], MOOD["blink-closed"], MOOD["blink-half"]] })}
${Object.values(MOOD).map((frame) => `!${frame.replace("]]", "|110]]")}`).join(" ")}
`
);

// ---------------------------------------------------------------- assets
// Game art copied from the browser game, into the vault's tidy layout:
// scenes/ for places, characters/<name>/legacy/ for the old portrait.
// (assets/generated/ belongs to the asset runner; ui/ is made in the vault.)
const assets = {
  "assets/encounter/gate-closed.webp": "scenes",
  "assets/encounter/gate-open.webp": "scenes",
  "assets/gates/gate-opening.webp": "scenes",
  "assets/encounter/arthur-intercom.webp": "characters/arthur/legacy",
  "assets/encounter/arthur-talk-2.webp": "characters/arthur/legacy",
  "assets/encounter/arthur-talk-3.webp": "characters/arthur/legacy",
  "assets/encounter/arthur-talk-4.webp": "characters/arthur/legacy"
};
for (const [asset, folder] of Object.entries(assets)) {
  await mkdir(join(vault, "assets", folder), { recursive: true });
  await copyFile(join(root, asset), join(vault, "assets", folder, asset.split("/").pop()));
}

// ---------------------------------------------------------------- canvases
const edge = (id, fromNode, toNode, label, fromSide = "right", toSide = "left", extra = {}) => ({
  id, fromNode, fromSide, toNode, toSide, toEnd: "arrow", ...(label ? { label } : {}), ...extra
});
const card = (id, file, x, y, width = 400, height = 300) => ({ id, type: "file", file, x, y, width, height });
const group = (id, label, x, y, width, height, color) => ({ id, type: "group", label, x, y, width, height, color });
const canvas = (value) => JSON.stringify(value, null, "\t");

await write(
  "characters/arthur/arthur-tree.canvas",
  canvas({
    nodes: [
      { id: "legend", type: "text", x: -560, y: -40, width: 420, height: 440,
        text: "### How to read this\n\n**Green card** = `open` node. The player types freely. The model picks an action.\n\n**Blue card** = `script` node. Fixed lines. No model call.\n\n`> text` = Arthur says it.\nOther plain lines = effects.\n\n**Arrow labels**\n- `\"text\"` = a button\n- `~ name` = free text matched by a [[detectors|detector]]\n- `if ...` = taken when true\n- `else` = taken when nothing else fits" },
      { id: "gate-talk", type: "text", color: "4", x: 0, y: 0, width: 440, height: 300,
        text: "## gate-talk\nopen\nsay opening\n\nFree talk on the [[intercom]] (see [[World.canvas]]). Each turn the model picks one of the [[Arthur#Actions|actions]] he is allowed right now.\n\nEndings come from events, such as [[end-locked-out]] and [[gate-opens]]." },
      { id: "id-shown", type: "text", color: "5", x: 640, y: -20, width: 440, height: 340,
        text: `## id-shown\nscript\n> ${"I can see the card. That tells me a name, not why you're here. I could ring your company to check the callout."}\n\n${FENCE}yaml\ndo:\n  - memory: { fact: "Player showed a contractor ID", tags: [identity, claim], importance: 76 }\n  - flag company-call-pending\n${FENCE}` },
      { id: "id-talk", type: "text", color: "4", x: 640, y: 440, width: 440, height: 240,
        text: "## id-talk\nopen\n\nFree talk again, but Arthur keeps the company call in mind. [[company-call-countdown]] counts the turns." },
      { id: "company-call", type: "text", color: "5", x: 1300, y: 200, width: 420, height: 220,
        text: "## company-call\nscript\nsay company-call-result\nend [[exposed]]" },
      card("exposed-card", "outcomes/exposed.md", 1860, 180, 360, 260)
    ],
    edges: [
      edge("e1", "gate-talk", "id-shown", "if item.contractor-id = shown"),
      edge("e2", "id-shown", "company-call", "\"Go ahead, call them.\" ~ company-call-consent", "right", "top"),
      edge("e3", "id-shown", "id-talk", "else", "bottom", "top"),
      edge("e4", "id-talk", "company-call", "~ company-call-consent", "right", "left"),
      edge("e5", "id-talk", "company-call", "if counter.company-call-turns >= 3", "right", "bottom"),
      edge("e6", "company-call", "exposed-card", null, "right", "left", { color: "1" })
    ]
  })
);

// The world: each screen is a group, and what sits on its picture is where it
// is in the game. Game-pixel boxes are doubled onto the canvas so cards are
// easy to grab. Cards outside the screen groups are notes for people.
const SCENE = { x: 40, y: 60, scale: 2 };
const onScene = ([x, y, w, h], origin = SCENE) => ({
  x: origin.x + x * origin.scale,
  y: origin.y + y * origin.scale,
  width: w * origin.scale,
  height: h * origin.scale
});
const TOWER = { x: 40, y: 1060, scale: 2 };
const text = (id, box, value, extra = {}) => ({ id, type: "text", ...box, text: value, ...extra });
await write(
  "World.canvas",
  canvas({
    nodes: [
      text("readme", { x: 40, y: -420, width: 1280, height: 330 },
        "# World\nThis canvas **is the game**. Each labelled group is a screen.\n\n- The **picture card** in a group is the scene. Drag other cards onto it to place them.\n- An **object note** card (like the intercom) is clickable where it sits.\n- A **text card with an arrow** to another screen is a button that goes there. Label the arrow `if ...` to add a rule.\n- A text card that starts with `if ...` shows only when that is true.\n- Cards outside the screen groups are just notes.\n\nPlay it: `npm run app`. See [[Start here]]."),

      group("south-gate", "south-gate", 0, 0, 1360, 820, "6"),
      // Listed before the picture, so Obsidian shows the closed gate on top
      // while the engine draws this above it when the gate is open.
      text("gate-open-layer", onScene([0, 0, 640, 360]), "if flag.gate-open\n![[gate-open.webp]]"),
      card("gate-picture", "assets/scenes/gate-closed.webp", SCENE.x, SCENE.y, 1280, 720),
      { ...card("intercom", "objects/intercom.md", 0, 0), ...onScene([531, 137, 64, 72]) },
      text("walk", onScene([269, 176, 115, 108]), "MOVE TO TOWER 04 →"),

      group("guard-tower-04", "guard-tower-04", TOWER.x, TOWER.y, 1280, 720, "6"),
      text("tower-title", onScene([60, 110, 520, 90], TOWER), "## GUARD TOWER 04\nYou cross the car park. Arthur is waiting at the next checkpoint."),
      text("look-back", onScene([24, 300, 180, 40], TOWER), "← LOOK BACK AT GATE"),

      group("g-notes", "Notes (not screens)", 1440, -80, 700, 1900, "3"),
      card("intercom-face", "ui/intercom-hud.md", 1480, 0, 620, 520),
      card("tree", "characters/arthur/arthur-tree.canvas", 1480, 580, 620, 420),
      card("arthur", "characters/arthur/Arthur.md", 1480, 1060, 300, 300),
      card("allow", "characters/arthur/actions/ALLOW_ENTRY.md", 1800, 1060, 300, 300),
      card("o-entry", "outcomes/entry-granted.md", 1480, 1420, 300, 180),
      card("o-exposed", "outcomes/exposed.md", 1800, 1420, 300, 180),
      card("ev-gate", "events/gate-opens.md", 1480, 1620, 620, 180)
    ],
    edges: [
      edge("w1", "walk", "guard-tower-04", "if flag.gate-open", "bottom", "top"),
      edge("w2", "look-back", "south-gate", null, "top", "bottom"),
      edge("w3", "intercom", "intercom-face", "opens its UI", "right", "left"),
      edge("w4", "intercom", "tree", "talk", "right", "left"),
      edge("w5", "tree", "allow", "can pick", "bottom", "top"),
      edge("w6", "allow", "o-entry", "ends", "bottom", "top"),
      edge("w7", "tree", "o-exposed", "company call", "bottom", "top"),
      edge("w8", "allow", "ev-gate", "fires", "left", "right")
    ]
  })
);

// ---------------------------------------------------------------- report
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}
const files = await walk(vault);
const names = new Map();
for (const file of files) {
  const base = file.split("/").pop();
  const id = base.endsWith(".md") ? base.slice(0, -3) : base;
  names.set(id.toLowerCase(), [...(names.get(id.toLowerCase()) ?? []), relative(vault, file)]);
}
const TOKENS = new Set(["address", "playername"]);
names.set("check", ["_reports/check.md"]);
const problems = [];
for (const [id, paths] of names) if (paths.length > 1) problems.push(`Two files named \`${id}\`: ${paths.join(", ")}`);
for (const file of files.filter((f) => (f.endsWith(".md") || f.endsWith(".canvas")) && !f.includes("/_reports/"))) {
  const text = await readFile(file, "utf8");
  const refs = file.endsWith(".canvas")
    ? JSON.parse(text).nodes.filter((n) => n.type === "file").map((n) => n.file.split("/").pop().replace(/\.md$/, ""))
    : [...text.matchAll(/!?\[\[([^\]|#]+)/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (TOKENS.has(ref.toLowerCase()) || /^[\d\s.,-]+$/.test(ref)) continue; // number lists such as [[104, 10], ...]
    if (!names.has(ref.toLowerCase())) problems.push(`[[${file.split("/").pop().replace(/\.md$/, "")}]] links to missing \`${ref}\``);
  }
}
const noteCount = files.filter((f) => f.endsWith(".md") && !f.includes("/_")).length;
await write(
  "_reports/check.md",
  `# Check report

Written by \`npm run vault:export\`. Do not edit.

${problems.length ? `## ${problems.length} problem(s)\n${problems.map((p) => `- ${p}`).join("\n")}` : "## All clear\nEvery link points to a real note or asset. Every file name is unique. Every detector test passed."}

## Stats
| Thing | Count |
| --- | --- |
| Notes | ${noteCount} |
| Actions | ${AVAILABLE_ACTIONS.length} |
| Profiles | ${Object.keys(ARTHUR_CHARACTER_PROFILES).length} |
| Authored line options (bullets) | ${lineCount} |
| Detectors | ${Object.keys(detectors).length} |
| Detector tests | ${Object.values(detectorTests).reduce((n, t) => n + t.match.length + t.miss.length, 0)} |
| Refusals before the night ends | ${MAX_REFUSALS} |
`
);

console.log(`Wrote ${written.length} files to game/. Problems: ${problems.length}`);
for (const problem of problems) console.log(`  - ${problem}`);
