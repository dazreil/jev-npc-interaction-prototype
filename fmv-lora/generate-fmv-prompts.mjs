#!/usr/bin/env node
// Generates a varied prompt set for a synthetic 90s-FMV style LoRA dataset.
// Aesthetic: tacky dystopia + 90s hacker culture + cassette futurism + a little cyberpunk,
// plus actors shot against chroma-key green and blue screens.
//
//   node generate-fmv-prompts.mjs \
//        --zit-trigger "fmvstyle" --count 120 --seed 1 --out fmv-prompts.json
//
// Each entry has:
//   prompt  -> send to the Flux FMV LoRA (its caption prefix + the scene description)
//   caption -> training caption for the Z-Image LoRA (content only + your new trigger)
// Content varies on purpose; the style stays constant so the LoRA learns the style, not a face or a room.

import { writeFileSync } from "node:fs";

// ---------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const COUNT = Number(args.count ?? 120);
const SEED = Number(args.seed ?? 1);
// The LoRA's documented trigger: a fixed caption prefix with the scene description appended.
const FLUX_PREFIX = args["flux-prefix"] ??
  "The image is a screenshot from a 3D-rendered scene, possibly from a video game or a virtual environment. The scene depicts ";
const ZIT_TRIGGER = args["zit-trigger"] ?? "fmvstyle";
const OUT = args.out ?? "fmv-prompts.json";

// ---------- seeded rng ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------- pools ----------
// Varied people so the LoRA doesn't memorise one face. Appearance only (no clothing): roles and wardrobe supply costume.
const PEOPLE = [
  "a man in his 40s with a thick mustache",
  "a woman in her 30s with a permed bob",
  "an older man with gray hair and round glasses",
  "a young man with a bleached buzzcut",
  "a Black woman in her 20s with box braids",
  "a stern woman in her 50s with short silver hair",
  "a South Asian man in his 30s with a goatee",
  "a lanky young man with floppy hair",
  "a heavyset man in his 50s with a beard",
  "an East Asian woman in her 30s with a sleek ponytail",
  "a tall thin man in his 20s with slicked-back hair",
  "a Latina woman in her 40s with big curly hair",
  "a bald man in his 50s",
  "a woman in her 20s with a shaved undercut and dyed pink hair",
  "a Black man in his 40s with a shaved head",
  "a young man with frosted spiky tips",
  "a young East Asian man with long straight hair",
  "a woman in her 20s with blonde feathered hair",
  "a pale young woman with jet-black hair and heavy eyeliner",
  "an elderly woman with her hair in a bun",
];

// Style groups bundle settings + roles + actions so combinations stay coherent.
const GENRES = {
  hackers: {
    settings: [
      "a cluttered teenage bedroom full of CRT monitors, posters and tangled cables",
      "an underground club with laser beams and a cheap fog machine",
      "a rooftop with a painted night skyline and satellite dishes",
      "a garage full of beige computer towers and cable spaghetti",
      "a grimy subway platform with a payphone on the wall",
      "a garish cyberspace set with glowing toy-like wireframe towers and pastel gel lighting",
      "an office cubicle farm at night lit only by monitors",
      "a skate park under neon lights",
    ],
    roles: [
      "a teenage hacker in an oversized patterned jacket and LED goggles",
      "a rollerblading courier in a shiny windbreaker and mirrored sunglasses",
      "a pirate TV broadcaster in a headset and holographic-look vest",
      "a corporate security agent in a cheap black suit and thin sunglasses",
      "a punk hacker girl in a torn band tee and chunky boots",
      "a nervous systems administrator in a wrinkled shirt and lanyard",
    ],
    actions: [
      "typing furiously on a beige keyboard",
      "holding up a floppy disk triumphantly",
      "squinting at a glowing monitor",
      "whispering into a chunky headset",
      "pointing at a screen in alarm",
      "tapping a payphone handset against their palm",
    ],
  },
  cassette: {
    settings: [
      "a mainframe room with reel-to-reel tape drives and wall-sized blinking panels",
      "a cramped control room with beige plastic consoles, toggle switches and amber monochrome CRT screens",
      "a dim terminal room with green phosphor screens and stacked cassette decks",
      "a retro-futuristic lab with chunky knobs, analog dials and label-maker tags",
      "a corridor lined with tall beige computer cabinets and cable trays",
      "a radar room with round amber screens and a rotating sweep",
    ],
    roles: [
      "a technician in a gray jumpsuit with a headset",
      "a systems operator in a white lab coat and thick glasses",
      "a flight-deck officer in a cheap metallic uniform",
      "a nervous engineer in a short-sleeved shirt and tie",
      "a stern commander in a high-collared tunic",
      "a rookie analyst in a turtleneck holding a clipboard",
    ],
    actions: [
      "flipping a toggle switch on a console",
      "turning a large dial",
      "reading a printout with a worried frown",
      "sliding a cassette tape into a deck",
      "staring at an amber screen",
      "reporting grimly into a wall intercom",
    ],
  },
  dystopia: {
    settings: [
      "a megacorp lobby with cheap chrome, plastic plants and garish neon shapes, no readable text",
      "a surveillance control room with a wall of mismatched CRT monitors",
      "a dystopian game-show studio with overbright neon and plastic set pieces",
      "a propaganda broadcast studio with a huge banner of abstract symbols",
      "a cheap futuristic interrogation cell with glowing tube lights",
      "a sterile apartment corridor with flickering ceiling panels",
      "a dystopian shopping arcade with neon signs and vending machines, no readable text",
    ],
    roles: [
      "a smiling state broadcaster in a shiny silver blazer",
      "a megacorp executive in a stiff pinstripe suit with huge shoulder pads",
      "a riot guard in a plastic helmet and clunky body armor",
      "a game-show host in a glittery jacket with a headset mic",
      "a bureaucrat in a gray uniform with an ID badge",
      "a rebel in a patched coat and a gas mask pushed up on the forehead",
    ],
    actions: [
      "smiling rigidly into the camera",
      "reading from a prompter with a flat voice",
      "pointing at an unseen crowd",
      "holding up an official-looking tablet",
      "glaring with menacing over-acting",
      "saluting awkwardly",
    ],
  },
  cyberpunk: {
    settings: [
      "a rainy neon street built on a backlot with wet pavement and steam vents",
      "a cramped noodle stand under glowing signs, no readable text",
      "a crowded street market with hanging cables and colored gels",
      "a back-alley clinic with buzzing tube lights and a reclined chair",
      "a rooftop with a painted night skyline and magenta and cyan gels",
    ],
    roles: [
      "a street mercenary in a long vinyl coat with prop implants",
      "a data courier in a hooded jacket with glowing cable accents",
      "a black-market surgeon in a stained apron and visor",
      "a neon-lit fixer in a metallic jacket and mirrored visor",
      "a wary drifter in a patched trench coat",
    ],
    actions: [
      "lighting a cigarette under neon",
      "handing over a small plastic data cartridge",
      "glancing over a shoulder",
      "adjusting a prop cybernetic arm",
      "staring coldly at the camera",
    ],
  },
};

// Acting cues: the "poorly acted" part of the look.
const ACTING = [
  "stiff posture, eyes slightly off-camera",
  "over-emphatic expression, wide-eyed",
  "deadpan line-reading face, mouth slightly open",
  "forced smile that doesn't reach the eyes",
  "theatrical gesture, hand raised awkwardly",
  "wooden, unconvincing serious look",
  "glancing at something off-screen with exaggerated concern",
  "frozen mid-sentence, slightly unnatural pose",
];

const LIGHTING = [
  "saturated magenta and cyan gel lights",
  "amber CRT glow with deep shadows",
  "green phosphor screen glow in a dark room",
  "harsh flat fluorescent lighting with washed-out colors",
  "smoke-machine haze with laser beams and colored rim lights",
  "flat studio key light with a hard shadow on the backdrop",
  "blue moonlight gel with a magenta rim light",
  "sickly overhead tube lighting with heavy shadows",
];

const SHOTS_PERSON = ["a medium shot", "a medium close-up", "a close-up", "a waist-up shot", "a chest-up portrait"];

// Insert shots, cassette futurism and hacker tech. No readable text.
const INSERTS = [
  "a hand flipping a toggle switch on a beige console",
  "a reel-to-reel tape spinning on a mainframe drive",
  "a chunky cassette tape being pushed into a deck",
  "an amber monochrome CRT showing glowing abstract wireframe shapes, no readable text",
  "a hand inserting a floppy disk into a beige computer",
  "a payphone handset swinging on its steel cord",
  "a rack of blinking LEDs on a rack-mounted panel",
  "a gloved hand gripping a big red lever",
  "a pair of mirrored sunglasses reflecting a screen",
  "a dial with tiny glowing numbers and a trembling needle",
  "a dot-matrix printer spitting out blank paper",
  "a row of tiny CRT monitors showing static",
  "a hand pressing a chunky illuminated button",
  "a tangle of colored cables plugged into a beige panel",
];

// ---------- chroma-key shots ----------
// Wardrobe avoids green and blue so the actor can be keyed cleanly.
const WARDROBE = [
  "a silver metallic jumpsuit",
  "a black vinyl trench coat and mirrored sunglasses",
  "a red leather jacket over a black tee",
  "a white lab coat and thick glasses",
  "a gold lame jacket with huge shoulder pads",
  "an orange jumpsuit with a utility belt",
  "a magenta windbreaker with LED goggles on the forehead",
  "a gray corporate suit with a cheap tie",
  "a black tactical vest and plastic helmet",
  "a pink holographic-look raincoat",
  "a black turtleneck and a silver chain",
  "a white plastic jumpsuit with a silver visor",
  "a black leather jacket with spiked collar",
  "a yellow hazard suit with the hood down",
];
const CHROMA_POSES = [
  "pointing at empty space as if at a giant hologram",
  "reaching toward something invisible",
  "looking up at something enormous off-screen",
  "arms crossed, glaring at the camera",
  "mid-stride walking toward the camera",
  "hands raised as if typing on an invisible keyboard",
  "gesturing at an invisible map",
  "holding a chunky prop scanner out in front",
  "leaning forward as if peering into an unseen monitor",
  "standing rigidly at attention",
];
const CHROMA_SHOTS = ["a full-body shot", "a medium shot", "a waist-up shot", "a full-length shot"];
const CHROMA_LIGHT = [
  "evenly lit screen with slight wrinkles and a soft shadow on the floor",
  "flat even lighting with a faint hot spot on the screen",
  "slightly uneven lighting with color spill on the edges of hair and clothes",
  "bright soundstage lighting with visible seams in the screen",
];

// The LoRA was trained on Phantasmagoria/Harvester: live actors composited over pre-rendered 3D rooms.
// Half of the people shots get one of these cues, which doubles as an A/B test of the prompts.
const COMPOSITE_CUES = [
  "the live-action actor looks cut out and pasted over a pre-rendered 3D background",
  "a digitized actor composited into a rendered 3D room with mismatched lighting",
  "the actor is lit differently from the computer-generated background",
  "a live-action character standing in a pre-rendered low-polygon environment",
];
const composite = () => (rand() < 0.5 ? `, ${pick(COMPOSITE_CUES)}` : "");

// ---------- builders ----------
// Weighted so cyberpunk stays "a little" and the other three carry the look.
const GENRE_WEIGHTS = { hackers: 0.3, dystopia: 0.3, cassette: 0.25, cyberpunk: 0.15 };
function pickGenre() {
  let r = rand();
  for (const [k, w] of Object.entries(GENRE_WEIGHTS)) {
    if ((r -= w) < 0) return k;
  }
  return "hackers";
}
let chromaCount = 0; // alternate screens so green and blue stay balanced

function build(kind) {
  const gk = pickGenre();
  const g = GENRES[gk];
  const setting = pick(g.settings);
  const light = pick(LIGHTING);

  if (kind === "single") {
    return { genre: gk, kind, content: `${pick(SHOTS_PERSON)} of ${pick(PEOPLE)}, playing ${pick(g.roles)}, ${pick(g.actions)}, ${pick(ACTING)}, in ${setting}, ${light}${composite()}` };
  }
  if (kind === "two") {
    const a = pick(PEOPLE);
    let b = pick(PEOPLE);
    while (b === a) b = pick(PEOPLE);
    const ra = pick(g.roles);
    let rb = pick(g.roles);
    while (rb === ra) rb = pick(g.roles);
    return { genre: gk, kind, content: `a two-shot of ${a} as ${ra} and ${b} as ${rb}, facing each other in a stilted conversation, ${pick(ACTING)}, in ${setting}, ${light}${composite()}` };
  }
  if (kind === "wide") {
    return { genre: gk, kind, content: `a wide shot of ${setting}, with ${pick(g.roles)} small in frame, ${pick(g.actions)}, ${pick(ACTING)}, ${light}${composite()}` };
  }
  if (kind === "empty") {
    return { genre: gk, kind, content: `an empty wide shot of ${setting}, no people, ${light}` };
  }
  if (kind === "insert") {
    return { genre: "cassette", kind, content: `an insert shot of ${pick(INSERTS)}, ${light}` };
  }
  // chroma: alternate green / blue
  const screen = chromaCount++ % 2 === 0 ? "green" : "blue";
  const screenDesc = `standing in front of a solid bright chroma-key ${screen} screen with a matching ${screen} floor`;
  if (rand() < 0.25) {
    const a = pick(PEOPLE);
    let b = pick(PEOPLE);
    while (b === a) b = pick(PEOPLE);
    let wa = pick(WARDROBE);
    let wb = pick(WARDROBE);
    while (wb === wa) wb = pick(WARDROBE);
    return { genre: `chroma-${screen}`, kind: "chroma", content: `a full-body two-shot of ${a} in ${wa} and ${b} in ${wb}, ${screenDesc}, ${pick(CHROMA_POSES)}, ${pick(ACTING)}, ${pick(CHROMA_LIGHT)}` };
  }
  return { genre: `chroma-${screen}`, kind: "chroma", content: `${pick(CHROMA_SHOTS)} of ${pick(PEOPLE)} in ${pick(WARDROBE)}, ${screenDesc}, ${pick(CHROMA_POSES)}, ${pick(ACTING)}, ${pick(CHROMA_LIGHT)}` };
}

// Target mix (sums to 1).
const MIX = [["single", 0.32], ["chroma", 0.2], ["wide", 0.15], ["insert", 0.13], ["two", 0.1], ["empty", 0.1]];
const targets = MIX.map(([k, p]) => [k, Math.round(COUNT * p)]);
// Fix rounding drift on the biggest bucket.
targets[0][1] += COUNT - targets.reduce((s, [, n]) => s + n, 0);

const uniq = new Set();
const entries = [];
let attempts = 0;
for (const [kind, n] of targets) {
  let made = 0;
  while (made < n && attempts < COUNT * 400) {
    attempts++;
    const e = build(kind);
    if (uniq.has(e.content)) continue;
    uniq.add(e.content);
    entries.push(e);
    made++;
  }
}

// Shuffle so batches are mixed, then finalise.
for (let i = entries.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [entries[i], entries[j]] = [entries[j], entries[i]];
}

const out = entries.map((e, i) => ({
  id: String(i + 1).padStart(3, "0"),
  genre: e.genre,
  kind: e.kind,
  seed: Math.floor(rand() * 2 ** 31),
  prompt: `${FLUX_PREFIX}${e.content}.`,
  caption: `${ZIT_TRIGGER}, ${e.content}`,
}));

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`wrote ${out.length} prompts to ${OUT}`);
const tally = (key) => out.reduce((m, e) => ((m[e[key]] = (m[e[key]] ?? 0) + 1), m), {});
console.log("by kind:", tally("kind"));
console.log("by genre:", tally("genre"));
