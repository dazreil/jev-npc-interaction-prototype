# Scene Engine Spec

Status: draft, 1 October 2026. Revision 3: the game is written in an Obsidian vault and runs in the desktop app. The old browser game (`index.html`, `js/app.js`) is frozen; new work goes into the desktop app only.

The game is in `game/`. It is the source: the desktop app runs Arthur entirely from its notes (section 13). `npm run vault:check` checks it.

## 1. Why

The Arthur encounter proves the idea. The model picks an action. A person writes every line.

But most of the game lives in code, not in data:

| Thing | Where it is now |
| --- | --- |
| Arthur's lines, templates, branches, performance cues | `data/dialogue.json` (data — good) |
| Personality, state, goals | `data/arthur.json` (data — good) |
| Four character profiles (`pal`, `sir`, `mate`, `friend`) | `js/character.js` (code) |
| The 12 actions | `AVAILABLE_ACTIONS` in `js/game.js` |
| When an action is allowed (e.g. `ALLOW_ENTRY` needs suspicion < 78) | `getAvailableActions()` in `js/game.js` |
| What the model is told each action means | `ACTION_CRITERIA` in `js/providers/jev.js` |
| State change per action | `ACTION_STATE_CHANGES` in `js/providers/jev.js` |
| Limits (`MAX_REFUSALS`, `MAX_SUPPORT_REQUESTS`) | constants in `js/game.js` |
| Endings (entry granted, refused, expelled, locked out, exposed) | `resolveTerminalOutcome()` in `js/game.js` |
| Word detectors (purpose, weapon, proof, name) | regex in `js/conversation-signals.js`, `js/game.js` |
| Fake ID and company phone call | hand-written methods in `js/game.js` |
| Gate screen, hotspots, tower screen | `index.html` + `js/app.js` |

So a second NPC or a second place needed new JavaScript. This spec changes that. **Now (1 October 2026):** every row above is a note in the vault, and the desktop app runs from the notes. Only the Mock provider is still code (section 14, question 2).

**Goal:** a small engine that runs scenes from an Obsidian vault. Obsidian is the editor. A new NPC, a new screen, or a new event needs notes only. No new code.

**Non-goals:**

- No big general engine (no physics, no inventory grid).
- No model-written dialogue. This rule does not change.
- No custom text editor. Obsidian does that job.
- No big Obsidian plugin. A small one (Game Tools) runs asset cards and opens the game from inside Obsidian; the game itself never needs it.
- No browser for players. The game ships as a standalone desktop app (section 10.4).

## 2. Rules the engine keeps

These come from `ROADMAP.md` and stay true:

1. The model never writes dialogue. It picks one action from a list the engine gives it.
2. Every spoken line comes from an authored note.
3. The engine checks every model answer. A bad answer becomes a safe fallback action.
4. State changes, memories, and endings are done by engine rules, not by the model.
5. Runs are repeatable. Same seed plus same input gives the same result.
6. The vault is the source of truth. Tools only read it, except the screen editor (section 12.7) and the templates (section 7.4), which write only what you asked them to.

## 3. Big picture

```text
 Obsidian vault  game/                    workbench page (localhost:5174)
   notes (.md)  canvas (.canvas)            hotspots · play · replay
          │   ▲                                   │
          │   └──── writes hotspot blocks only ───┘
          ▼
   compiler + checker ──► vault bundle (in memory)
          │
          └──► _reports/*.md  (errors and stats, readable in Obsidian)
                                   │
                                   ▼
          engine core (no DOM)  ◄──►  decision provider (mock / jev)
                                   │
                                   ▼
          renderer (DOM: screens, portraits, speech, sound)
```

- **Vault:** the `game/` folder in this repo. You open it in Obsidian as a vault. Git tracks it like any other folder.
- **Compiler + checker:** reads notes and canvas files, checks them, and writes one JSON bundle. It also writes report notes back into the vault, so you see errors in Obsidian.
- **Workbench:** a small local web page for the three jobs Obsidian cannot do: draw hotspots, play, and replay logs.
- **Engine core:** pure JavaScript. No DOM. Runs in Node for tests and in the desktop app for play.
- **Renderer:** `js/engine/ui.js` (UI notes), `js/engine/session.js` (a play session), and `js/engine/sound.js` (voice and effects), inside the desktop app (section 10.4).
- **Provider:** same as today. It gets a context and a list of actions. It gives back one action.

## 4. How the vault is written

### 4.1 Three places to put data

Each note is Markdown. Data can go in three places:

| Place | What it is | Use it for |
| --- | --- | --- |
| **Properties** | The YAML block at the top of a note. Obsidian shows it as a form. | Simple values: `type`, numbers, text, lists, links. |
| **Line sections** | Markdown headings with bullet lists under them. | Dialogue lines. They read like a script. |
| **Rule blocks** | A heading followed by a ```` ```yaml ```` code block. | Nested data: effects, `any` groups, slots, hotspots. |

Everything else in a note is ignored by the compiler. So normal text is a free comment. You can write design notes, reasons, and to-dos next to the data. Obsidian comments (`%% like this %%`) are ignored too.

**Why this split:** the Properties form in Obsidian cannot edit nested YAML. So Properties hold only flat values, and the rest goes in rule blocks. A rule block is still YAML, so it is the same format everywhere.

### 4.2 Every note has a `type`

The compiler reads the `type` property to know what the note is. A note with no `type` is ignored. That means you can keep any other notes in the vault.

Types: `game`, `character`, `profile`, `action`, `dialogue`, `lines`, `portraits`, `detectors`, `screen`, `ui`, `theme`, `object`, `timer`, `item`, `event`, `outcome`, `token`.

A `token` note documents a placeholder such as `[[address]]`. It also stops Obsidian showing the placeholder as a broken link.

A dialogue tree is a `.canvas` file, not a note (section 5.5).

### 4.3 Names and links

- **The file name is the id.** `ALLOW_ENTRY.md` is the action `ALLOW_ENTRY`. `south-gate.md` is the screen `south-gate`.
- **File names must be unique in the whole vault.** The checker enforces this, because Obsidian links find notes by name.
- **Links are references.** `[[south-gate]]` in a property or rule block means "the thing with id `south-gate`". The compiler turns links into ids.
- **Renaming is safe.** With "Automatically update internal links" turned on, Obsidian fixes every link when you rename a note.
- **Assets are links too.** `[[car-park-yard.webp]]` points to an image in `assets/`. Obsidian shows it in the note.

### 4.4 Folder layout

```text
game/                          ← open this folder as a vault
  .obsidian/                   ← only app.json and templates settings are committed
  Game.md                      ← type: game
  characters/
    arthur/
      Arthur.md                ← type: character
      profiles/  pal.md  sir.md  mate.md  friend.md
      actions/   ALLOW_ENTRY.md  REFUSE_ENTRY.md  ...
      dialogue/  refuse-entry.md  ...   arthur-lines.md
      arthur-tree.canvas       ← dialogue tree
  World.canvas                 ← the screens, laid out (section 7.3)
  Assets.canvas                ← the art guide, model list, and style library (section 7.4)
  detectors.md
  characters/arthur/           ← one folder per character
    Arthur.md  Arthur.canvas  arthur-tree.canvas  arthur-portraits.md  arthur-patrol.md
    profiles/  actions/  dialogue/  art/
  screens/south-gate/          ← one folder per screen
    south-gate.md  south-gate.canvas  intercom.md  ui/  art/
  screens/guard-tower-04/
  items/contractor-id/         ← one folder per item
    contractor-id.md  contractor-id.canvas  art/
  ui/        neon-theme.md                ← shared UI
  events/    gate-opens.md  locked-out.md  expelled.md  ...
  outcomes/  entry-granted.md  refused.md  ...
  assets/    generated/  references/  ui/  ← shared art
  _templates/                  ← starter notes for each type
  _reports/                    ← written by the checker; do not edit
```

### 4.5 Obsidian setup

Turn on these settings. The repo commits them in `game/.obsidian/app.json`, so they are on when you open the vault:

- Files and links → **Use [[Wikilinks]]**: on.
- Files and links → **Automatically update internal links**: on.
- Files and links → **Default location for new attachments**: `assets`.
- Core plugin **Templates**: on, folder `_templates`.
- Core plugin **Canvas**: on.

No community plugins are needed. The repo's own **Game Tools** plugin (`game/.obsidian/plugins/game-tools/`) adds the asset-card menu and the play and workbench commands. Git ignores `game/.obsidian/workspace*.json` and other per-person files.

### 4.6 Conditions

Many things need a test: action gates, dialogue branches, hotspots, events. They all use one condition format.

**Short form.** A list of plain strings. All must be true. This fits in Properties, so you can edit it in the Obsidian form:

```yaml
available:
  - flag.entry-basis
  - state.suspicion < 78
  - state.irritation < 71
  - no memory.tag in [threat, weapon, trespass] since repair
```

Short-form grammar (parsed, never run as code):

```text
<key>                      true when the value is true
not <key>                  true when the value is false or missing
<key> <op> <value>         op: =  !=  <  <=  >  >=
<key> in [a, b]            value is one of the list
some|no memory.tag in [a, b] [since repair]
```

**Long form.** For `any`, `not` groups, or nesting, use a rule block. It is the same as revision 1:

```yaml
all:
  - state.suspicion < 78
  - any:
      - detector = emergency
      - state.trust >= profile.trustThreshold
```

Short strings can sit inside long form, as shown.

**Quote rule text that holds a link when it is inside `[ ]`.** YAML reads `[screen [[south-gate]]]` as lists inside lists. Write `["screen [[south-gate]]"]`, or use a `- ` list, where no quotes are needed. The compiler reports this mistake as bad YAML.

Keys a condition can test:

| Key | Meaning |
| --- | --- |
| `state.<name>` | NPC state number (trust, suspicion, irritation, fear) |
| `personality.<name>` | NPC personality number |
| `var.<name>` | a game variable from `Game.md` |
| `flag.<name>` | a true/false game flag |
| `counter.<name>` | a number the engine counts (e.g. refusals) |
| `memory.tag` | memories with a tag; `since repair` means "after the last repair" |
| `lastAction` | the action the NPC just took |
| `previousAction` | the action the NPC took the turn before |
| `detector` | a named detector matched the player's text |
| `signal.<name>` | a built-in signal from code (listed in `Game.md`) |
| `playerContains` | plain words in the player's text (already used today) |
| `tone` | the current emotional tone |
| `profile` | the selected profile id |
| `screen` | the current screen id |
| `item.<id>` | the state of an item (`held`, `shown`, `used`) |

The engine has one function: `evaluate(condition, world) → true | false`. It is fully tested. An unknown key is a checker error, not a silent `false`.

### 4.7 Effects

Effects change the world. They are a list, run in order. The short form also works in Properties:

```yaml
effects:
  - state trust +10
  - state suspicion -14
  - flag reason-asked
  - counter refusals +1
  - sound unlock
  - screen [[guard-tower-04]]
  - end [[exposed]]
```

Effects with more than one value use a rule block:

```yaml
- memory: { fact: "Player apologised", tags: [repair], importance: 60 }
- animate: { layer: gate, play: opening, then: open }
- portrait: { character: "[[Arthur]]", cue: entry-granted }
```

Full list: `state`, `memory`, `flag`, `var`, `counter`, `say`, `narrate`, `sound`, `music`, `portrait`, `animate`, `show`, `hide`, `screen`, `start-dialogue`, `item`, `end`, `wait`, `send` (sends the `text-input` slot).

New effects are code. That is on purpose. The list stays short and easy to check.

## 5. Characters

### 5.1 Character note

````markdown
---
type: character
name: Arthur
role: South-gate night security guard
iq: 95
patience: 35
# ... greed, courage, sympathy, ruleFollowing, trust, suspicion, irritation, fear
memoryMax: 8
historyMax: 12
fallbackAction: "[[REFUSE_ENTRY]]"
tree: "[[arthur-tree.canvas]]"
lines: "[[arthur-lines]]"
portraits: "[[arthur-portraits]]"
---

## Style
Practical and ordinary. Uses simple reasoning and everyday language, ...

## Goals
```yaml
- { id: protect_warehouse, label: Protect warehouse grounds, priority: 100 }
```

## Tones
```yaml
- { tone: hostile, when: state.irritation > 70 }
- { tone: neutral }
```

## Scene
```yaml
location: warehouse car-park south-gate intercom
idCardPresented: { when: item.contractor-id = shown }
identityVerification: { when: item.contractor-id = shown, then: "Arthur has seen a contractor ID card ...", else: "Arthur has not seen an ID card" }
```

## Prompt
```yaml
role: South-gate night guard in Guard Tower 04, ...
instructions: Which single action should Arthur take ...
pendingGuidance: conversationSignals.pendingRequest, when present, ...
```

## Profiles
- [[pal]]

## Actions
- [[ANSWER_QUESTION]]
````

- Personality and state are flat Properties, so you edit them in the Obsidian form.
- `## Style` is plain text. It goes to the model as the cognition note.
- `## Tones`: the first row that is true sets his tone, and the tone picks the line set.
- `## Scene`: what he knows about where he is, sent to the model each turn. A value with `when` is worked out from the game (`then` / `else`, or true / false).
- `## Prompt`: how the model is asked to choose. Each action's `## Criteria` is added. `pendingGuidance` goes first on turns where the player still owes him an answer.
- `## Profiles` and `## Actions` list his profiles and actions, in order. The first random number picks the profile.
- Other text is a free comment.

### 5.2 Profile notes

One note per profile. It moves out of `js/character.js`. Properties override the character's values.

````markdown
---
type: profile
character: "[[Arthur]]"
address: pal
label: Fast-talking Italian American
patience: 22
courage: 88
trust: 18
suspicion: 42
irritation: 16
voice: en-us+m3
rate: 1.12
pitch: 0.74
preDelayMs: 25
---

## Decision style
Quick, streetwise, impatient with evasiveness, and unwilling to be pushed
around. He speaks fast and holds a firm boundary.
````

### 5.3 Action notes

One note per action. It joins what used to be in three code files: the action list, the gate rules, the text for the model, and the state change.

````markdown
---
type: action
character: "[[Arthur]]"
label: Open the car-park gate
available:
  - no memory.tag in [threat, weapon, bribe, contradiction, dishonesty, lie, suspicion] since repair
  - state.suspicion < 78
  - state.irritation < 71
effects:
  - state trust +20
  - state suspicion -20
  - state irritation -5
minConfidence: 0.25
judgment: entry_case_credible
judgmentMin: 0.45
gateFallback: ["[[ASK_FOR_PROOF]]", "[[REFUSE_ENTRY]]"]
ends: "[[entry-granted]]"
portraitCue: entry-granted
acknowledgesName: true
dialogue: "[[allow-entry]]"
---

## Criteria
Open only the warehouse car-park gate when ...

## Judgment
```yaml
id: entry_case_credible
instructions: Based on the complete conversation ...
"true": The player's spoken case is persuasive enough ...
"false": The player's spoken case is still too vague ...
```

## Also needs
```yaml
any:
  - state.trust >= profile.trustThreshold
  - some memory.tag in [authority, emergency, delivery, proof]
```

## Memory
```yaml
- fact: Arthur was persuaded to open the car-park gate ...
  importance: 90
  tags: [persuasion, cooperation]
```
````

- `available` (Properties) and `## Also needs` must both be true for the action to be offered.
- `effects` run when he takes it: state changes, counters (`counter refusals +1`), flags. A provider that brings its own state changes (the Mock) replaces the `state` ones.
- `## Criteria` is sent to the model. `## Judgment` is a second question in the same call. Below `judgmentMin`, or below `minConfidence` for the choice, he takes the first available `gateFallback` action instead.
- `## Memory`: what he remembers afterwards. The first entry whose `when` holds is kept. `when` can test `detector.<name>` and `signal.purpose` for this turn.
- `ends` sets the outcome. `portraitCue` is his face (left out: the face for his tone). `acknowledgesName: true` adds the name acknowledgement when the player gives a name.
- The Mock provider is still code (section 14, question 2).

### 5.4 Dialogue notes

One note per action. The lines are Markdown, so the note reads like a script.

````markdown
---
type: dialogue
action: "[[REFUSE_ENTRY]]"
portraitCue: irritated
sound: denial
---

## neutral
Template: {acknowledgement} {boundary}

### acknowledgement
- I understand what you're asking.
- I've heard you.
- Sorry.

### boundary
- I can't let you in without authorisation.
- That still isn't enough for me to open the gate.
- You'll need to come back when the warehouse is open.

### branch: personal item
```yaml
when: [playerContains in [phone, bag, friend, personal item]]
template: "{acknowledgement} {personalBoundary}"
slots:
  personalBoundary:
    - A personal errand still doesn't justify opening a closed warehouse.
    - You'll have to retrieve it when the site reopens.
```

## hostile
- I'm not here to satisfy your curiosity. Move along.

## neutral @friend
- No. Gate stays shut.
````

Rules for line sections:

- `## <tone>` starts a tone. `## @<profile>` replaces the lines for every tone when that profile is active (this is how the game works today).
- `## weapon` and `## name` are special sets. They are picked by the `weapon` detector and the `name-question` signal.
- A plain bullet list under a tone is a list of whole lines.
- A `Template:` line plus `###` slot headings is a template. Each slot is a bullet list.
- `### branch: <name>` plus a rule block is a branch. It uses the condition format from 4.6.
- `[[address]]` and `[[playerName]]` stay as tokens. The checker knows these two are tokens, not note links. (Obsidian shows them as unresolved links. That is harmless.)

Lines that are not tied to an action go in a `lines` note:

````markdown
---
type: lines
character: "[[Arthur]]"
---

## opening
- Evening, [[address]]. South gate's shut. What do you need?

## company-call-result
- All right. I rang the company. They have no record of sending you. The gate stays shut.
````

### 5.5 Dialogue trees in Canvas

A dialogue tree is an Obsidian Canvas. Canvas saves a `.canvas` file in the open JSON Canvas format. The compiler reads it with `JSON.parse`. You draw the tree as cards and arrows.

**Cards.** Each text card is one node. The first line names it. The second line says its kind:

````markdown
## gate-talk
open
````

````markdown
## id-shown
script
action [[ASK_FOR_PROOF]]
say id-shown

```yaml
do:
  - memory: { fact: "Player showed a contractor ID card; assignment remains unverified", importance: 76, tags: [identity, claim], topic: id, value: presented }
  - flag company-call-pending
  - counter company-call-turns = 0
```
````

````markdown
## company-call
script
action [[END_CONVERSATION]]
tone hostile
cue suspicious
say company-call-result
flag company-call-pending off
end [[exposed]]
````

- **`open` node:** the player types freely, and the model picks an action. This is today's Arthur. An optional `actions:` line limits the list.
- **`script` node:** fixed lines and fixed choices. No model call. `say <line>` (from the lines note) or `> text` is what the character says. `action X` makes the line count as action X in the talk history. `tone` and `cue` set how he says it. `end` sets the outcome. Other short-form lines and a `do:` block are effects. Any other text is a note for people.
- **The start node** is the first node no arrow points to. The engine moves along an `if` arrow as soon as it is true (showing the ID moves to `id-shown`). With player text, a `~ detector` arrow can fire, and an `else` arrow moves on from a script node.
- A card can also be a **file card** that points to a note. Use this for big nodes. The note uses the same layout.

**Arrows.** Each arrow is a way out of a node. The arrow's label says when it is taken:

| Arrow label | Meaning |
| --- | --- |
| `"Go ahead, call them."` (in quotes) | A player choice. It shows as a button. |
| `"Go ahead, call them." ~ company-call-consent` | A choice that free text can also pick, through a detector. (The button is not drawn yet.) |
| `~ company-call-consent` | An exit taken when free text matches a detector. No button. |
| `if item.contractor-id = shown` | An exit taken when the condition is true. |
| `else` | Taken when nothing else matches. |
| (no label) | Same as `else`. |

The Arthur fake ID flow as a canvas:

```text
 ┌───────────┐  if item.contractor-id = shown  ┌──────────┐ "Go ahead, call them." ~ accepts-company-call ┌──────────────┐
 │ gate-talk │ ──────────────────────────────► │ id-shown │ ─────────────────────────────────────────────► │ company-call │
 │   open    │ ◄────────────────────────────── │  script  │                                               │    script    │
 └───────────┘              else               └──────────┘                                               └──────────────┘
```

**Groups and colours.** Canvas groups and colours are for you. The compiler ignores them. Use them to mark scenes or unfinished parts.

Not checked yet: a card with no name, two cards with the same name, a script node with no way out, and a node nothing can reach.

## 6. Detectors

Detectors are named word patterns. They move out of `conversation-signals.js` and `game.js`. They live in one note, `detectors.md`, with one section each:

````markdown
---
type: detectors
---

## weapon
```yaml
pattern: '\b(gun|pistol|rifle|weapon|armed|shoot(ing)?)\b'
match: ["I have a gun", "I'm armed"]
miss: ["I fixed the gate arm"]
```

## emergency
```yaml
pattern: '\b(boiler|gas|leak|smoke|flood|emergency|burst)\b'
unless: '\bfire (alarm|panel|door|exit)\b'
match: ["There's a gas leak"]
miss: ["I service the fire alarm panel"]
```
````

- `match` and `miss` are tests. The checker runs them on every build, so a bad pattern cannot ship.
- Logic that is not a pattern (for example "message effort" or name pick-up) stays in code as a **built-in signal**. It has a name, so notes can still test it.

## 7. Screens

A screen is one place the player can look at. Today there are two: the south gate and Guard Tower 04.

A screen note holds the screen's settings and its overlay UI. Its pictures, objects, and exits are cards on [[World.canvas]] (section 7.3).

````markdown
---
type: screen
title: Car park / South gate
width: 640
height: 360
camera: CAM 04-B / EXTERIOR
objective: Find a way past Arthur
ui: "[[gate-hud]]"
---

![[car-park-yard.webp|320]]

## Status
```yaml
- { label: Barrier, when: flag.gate-open, then: Open, else: Secured }
```

## Hotspots
```yaml
# written by the workbench hotspot tool; you can also edit it by hand
- id: gate
  label: GATE
  rect: [170, 106, 300, 244]
  visible: [not flag.gate-open]
  verbs:
    Inspect: [narrate "Heavy locked leaves. Arthur controls the release from Tower 04."]
    Try gate: [narrate "Locked. You need Arthur to release it.", sound denied]
```
````

The south gate is built in layers on the canvas: the yard picture, life in the yard ([[gate-yard]]: Arthur's patrol and the dog), the gate front ([[gate-front]]: wall, swinging leaves, posts), and the call panel with the [[intercom]] object.

- The embedded image lets you see the screen in Obsidian.
- `rect` is `[x, y, width, height]` in screen pixels.
- `visible` and `enabled` take a condition.
- A hotspot has either `do` (one click) or `verbs` (a small menu, such as Inspect / Try gate). Each verb has its own effects.
- Every hotspot has a `label`. The renderer makes it a real `<button>`, as it does today.

### 7.1 Custom UI

A screen can have a UI: the frame, labels, meters, and buttons drawn over it. A UI is a `ui` note. A screen points to it with `ui: "[[gate-hud]]"`.

**Working now:** `js/engine/ui.js` draws UI notes. Samples: `game/ui/gate-hud.md`, `game/ui/intercom-hud.md`, and the theme `game/ui/neon-theme.md`. See them live with `npm run workbench` (section 12).

A UI note has `width`, `height`, `theme`, and optional `background` in Properties. The elements go in an `## Elements` rule block:

```yaml
- type: image
  at: [0, 0, 640, 360]          # x, y, width, height
  src: "[[car-park-yard.webp]]"
  fit: cover
  visible: [not flag.power-cut]
- type: text
  at: [22, 16, 260, 22]
  style: label                   # from the theme
  color: $cyan                   # a theme colour
  text: "Trust {state.trust}"    # a live value
- type: button
  at: [484, 276, 140, 32]
  style: button
  label: CALL ARTHUR
  key: C
  do: ["open intercom"]
```

Element types:

| Type | What it draws | Main properties |
| --- | --- | --- |
| `rect` | A box | `fill`, `stroke`, `strokeWidth`, `radius`, `glow`, `pattern: scanlines` |
| `ellipse` | A circle or oval | `fill`, `stroke`, `glow` |
| `line` | A line | `from`, `to`, `stroke`, `strokeWidth`, `dash`, `glow` |
| `polygon` | Any flat shape | `points`, `fill`, `stroke` |
| `text` | Text | `text`, `size`, `color`, `font`, `align`, `valign`, `uppercase` |
| `image` | A picture | `src`, `fit` (`contain`, `cover`, `fill`), `pixelated` |
| `nine-slice` | A picture frame that stretches without bending its corners | `src`, `slice`, `border` |
| `bar` | A meter | `value` (a world key such as `state.trust`), `max`, `fill`, `back` |
| `button` | A real button | `label`, `do`, `key`, `disabled`, and paint or `image` / `hoverImage` / `pressedImage` |
| `group` | A container | `clip` and paint |
| `slot` | A place the engine fills with a live part | `name`: `conversation-log`, `text-input`, `portrait` |

Rules:

- **Any element can have `children`.** Their `at` is measured from the parent's top-left corner.
- **`fill` can be a list** of colours. That makes a gradient.
- **`$name`** is a theme colour or font. **`style: name`** copies a theme style. The element's own values win.
- **`visible`** and a button's **`disabled`** take a condition. **`{...}`** in text shows a value, or picks text: `{flag.gate-open ? Open : Secured}`.
- **`mirror: true`** flips an element. **`swing: { when, hinge, to, seconds, steps }`** turns it toward its hinge edge while `when` holds: a 2D squash in a few held steps, like a pre-rendered 90s animation (the gate leaves). A swing needs an `id`; it is driven by a clock, so redraws continue it instead of restarting it. Use a mirrored picture rather than `mirror` on a swinging element.
- **`shade: 0..1`** darkens an element (1 is as drawn, 0 is black), so a bright prop sits in a dark scene. **`walk: { when, to: [x, y], seconds, back, loop, fps }`** moves an element in a straight line to `to` and (by default) back, in held steps, turning to face the way it goes (the picture faces right). Without `when` it always walks; `loop: true` repeats. Like `swing`, it needs an `id` and is driven by a clock.
- **`clip: { when, frames, fps, wait, gap, back, loop }`** plays a numbered frame sequence on an image (its `src` is frame `-01`): after `wait` seconds, once across, then `gap` seconds hidden, then mirrored back. `loop: true` repeats. Use it for a walk filmed across the whole frame: the box is the path, so the engine does not move the sprite and the walk looks natural. Arthur's patrol and the guard dog work this way ([[gate-yard]]). Like `swing`, it needs an `id` and runs on a clock.
- **`hoverLabel: true`** on a button shows its label only on hover or keyboard focus, so a hotspot does not cover the art it sits on.
- **Buttons are real `<button>` elements**, with focus and a label for screen readers. `key` is a keyboard shortcut. Bars have the `meter` role.
- **Typos are caught:** an unknown element type is an error, and a property that does nothing (for example `colour`) is a warning.

A `theme` note has three rule blocks: `## Colors`, `## Fonts`, and `## Styles`.

**Portraits.** A character's portraits note drives the `portrait` slot: `## Idle` (his resting frame), `## Talking` (frames played while a line is spoken, longer for longer lines), `## Talking by mood` (a talking loop per cue, used instead of the neutral one when he speaks in that mood), `## Cues` (the game's portrait cue for each line, such as `hostile`, mapped to a mood picture), and `## Blink` (frames played every `minGapMs`–`maxGapMs` while he is silent). He speaks each line in its mood, then settles back to `## Idle` and blinks. Arthur's come from the mood sheet and the talking composite on `Assets.canvas`.

### 7.2 In-world objects

An **object** is a thing the player can use inside a scene, such as the intercom on its post. It is not a screen. Using it opens its own UI **in place**, over the scene, and the scene stays visible behind it.

```yaml
# objects/intercom.md (Properties)
type: object
name: Video intercom
screen: "[[south-gate]]"     # the scene it stands in
label: VIDEO INTERCOM
key: C                        # keyboard shortcut
rect: [485, 185, 43, 69]      # where it is (the World.canvas card sets this)
ui: "[[intercom-hud]]"        # its face, a normal ui note
panel: [160, 4, 424, 300]     # where that face opens on the screen
conversation: "[[Arthur]]"    # calling it starts the talk
noAnswer: [flag.arthur-out]   # nobody picks up while this holds
ringSeconds: 6
```

- The engine adds a hotspot at `rect`. Using it runs `open intercom`, unless the note sets its own `use` effects.
- While it is open, the engine dims the scene (`dim: false` turns this off, and `dim: "#0008"` sets the colour) and draws the object's UI in `panel`, scaled to fit.
- `close intercom` closes it. A `screen` effect closes every open object.
- `open.<id>` is a condition, so other elements can react. For example, **Show ID** appears only while the intercom is open.
- An element with `layer: top` draws above opened objects and the dim. Use it for the player's own things, such as items.
- The `ui` element type embeds one UI note inside another. The engine uses it for objects, and you can use it yourself too.

### 7.3 Build the world in Canvas (working now)

The game's screens are built on one Obsidian Canvas, named in `Game.md` as `world: "[[World.canvas]]"`. Where a card sits is where it is in the game. The sample is `game/World.canvas`.

| On the canvas | In the game |
| --- | --- |
| A **group** | A screen. Its label is the screen id. It counts only if a screen note has that name, or it holds a picture. |
| The **image card** in a group | The scene picture. It sets the screen frame: its width becomes 640 game pixels, and everything else is measured from it. |
| An **image card** on the picture | An image layer. |
| An **object note** card on the picture | That object, clickable where the card sits. |
| An **item note** card on the picture | That item lying in the scene. A click picks it up (`item <id> held`), and then it is gone from the scene. |
| A **ui note** card on the picture | That UI, drawn in the card's box. |
| A **text card** | Text on the screen. If it embeds a picture (`![[some-picture.webp]]`), it is an image layer. |
| A first line `if <condition>` in a text card | The card shows only when the condition is true. |
| An **arrow** from a text card to another screen group | That card becomes a button that goes there. An arrow label `if <condition>` also gates it. |
| An **arrow** from an object card to a ui note card inside the frame | Where that object's UI opens. If the ui card is outside the frame, the object's `panel` property is used. |
| An **arrow** from an object or item card to an image card | **Click shape.** The object takes that picture's box and its shape: only the picture's solid pixels take clicks and show the hover glow; a click on its see-through part goes to what is behind. The object moves with the picture. An item's picture also goes when the item is picked up. |
| `if: <condition>` on an image card | The picture shows only while the condition holds (set it in the editor's settings). |
| `shade: 0..1` on an image card | Darkens the picture (1 is as drawn, 0 is black), so a prop sits in a dark room (set it in the editor's settings). |
| `focus: [x, y]` on an image card | Where the picture sits inside its box, in percent (`[50, 50]` is the middle, the default). A picture fills its box (cover), so it slides only the way it sticks out. Set it with **Option-drag** in the editor (12.7). The click shape slides with it. |
| **Cards outside screen groups** | Notes for people. The engine ignores them. |

Rules:

- **Order is layering.** Cards later in the canvas draw on top. The screen's `ui` note (for example the camera overlay) draws above the canvas cards. Objects and buttons draw above that.
- **A variant picture** (for example the yard with the power cut) is a text card with `if flag.gate-open` and the picture. Put it *before* the main picture in the canvas order, so Obsidian shows the normal picture on top while you edit. The game draws it above when its condition holds.
- **A screen with no picture** uses the group box as its frame and the theme's `screen` colour.
- **The checker** reports a card that points to a missing file, and a card on a screen that is not an image, object, item, or ui note.
- **A person or prop you click** (Arthur at his desk, a torch on a shelf): cut the picture out of a green screen (a `cutout` card), put it on the screen, put the object or item card on it, and draw an arrow from that card to the picture. The arrow label does not matter (`shape` is a good one).
- **Screen notes still hold settings,** such as `title`, `objective`, and the overlay `ui`. A screen that is not on the world canvas falls back to its `ui` note and object `rect` values.

### 7.3a Recorded voices (working now)

A character with `voice:` in their note (a Kokoro voice on fal, such as `am_michael`, `am_liam`, `af_sky`, `am_onyx`) and an optional `voiceSpeed:` (default 1) speaks in that voice. `npm run voices:silver` (or `node scripts/voices.mjs` with `GAME_VAULT`) records every authored line once, about $0.02 per 1,000 characters, into `characters/<name>/voice/` as small MP3 files, listed in `<name>-voice.json`. `--dry-run` counts lines and cost without spending; `--character Arthur` does one character.

- The game plays the recording when it shows that exact line, and the talking frames run while it plays.
- Lines that change at play time (with the player's name) and narrated lines are not recorded; they use the live voice.
- Change a line, the voice or the speed, run it again: only those lines are recorded again, and recordings no line uses are deleted.

### 7.3d The Characters workspace

Cmd+E → **Characters ✎** makes and edits characters in the game, without Obsidian (`player/characters-editor.js`; the app does the file work in `lib/studio.mjs`).

- **New character:** a name and a description; the character template makes their notes, starter actions, lines, portraits note and every art card.
- **Details:** name, role, how they talk (the note's `## Style`), their moods and starting values (`## State`), when each tone shows (`## Tones`, with a condition check), and their recorded voice and speed.
- **Art:** every art card on their canvas, in canvas order, as a tile: its result, status, what it is made from, its model (from the model list, with prices) and prompt (saved on change). **Make** asks first, with the price, before calling fal; cut-outs, crops and composites are free; **Redo finish** is free. **Import picture** puts a picture made by hand or elsewhere in as an image or edit card's result (its clean original, then the card's finish), so the cards that build on it work as usual; **Import a picture as a new card** makes a new image card for it.

### 7.3e Keys and services

Cmd+E → **Library ⚙** (`player/library-panel.js`) has four tabs: **Keys**, **Models**, **LoRAs** and **Styles**. **Keys** sets a key for each service: Jev (TypeSafe, `TYPESAFE_API_KEY`; how characters decide what to do; read on each use, so a new key works without a restart), fal, Replicate, OpenAI, Google, ElevenLabs, and Civitai (added to the link of LoRAs that need a login). The app writes keys into the project's `.env` (`FAL_KEY`, `REPLICATE_API_TOKEN`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`); the page only ever learns whether a key is set. **Test** makes a free call that checks the key (fal has none; for Jev it sends an empty request, which TypeSafe refuses for a wrong key and answers "incomplete" for a good one, with no work done). Each service's "get a key" page opens in your browser.

`lib/services.mjs` holds the other services' models (with estimated prices) and one adapter each:

| Model id | Service | Kind |
| --- | --- | --- |
| `flux-schnell`, `flux-1.1-pro` | Replicate | image |
| `flux-kontext-pro` | Replicate | edit |
| `gpt-image-2`, `gpt-image-2.5-flare` | OpenAI | image |
| `gpt-image-2-edit`, `gpt-image-2.5-sunburst` | OpenAI | edit |
| `nano-banana-2` | Google | image |
| `nano-banana-2-edit`, `nano-banana-2-lite-edit`, `nano-banana-pro-edit` | Google | edit |

A card whose `model:` is one of these goes to that service with the same prompt (styles included) and reference pictures; the picture comes back as the card's clean original and gets the card's finish, like a fal one. Video stays on fal. In the Characters workspace, a service's models can be picked once its key is set.

**Models you add** (Library → Models; saved in the game folder as `library/models.json`, `lib/library.mjs`): any model hosted on fal (its endpoint) or Replicate (`owner/name`, or `owner/name:version`) that makes pictures, edits, video or voices: its id (what cards use as `model:`), its cost, the name of its picture input if it is not the usual one, whether it takes LoRAs, and extra inputs (JSON) sent with every call. A fal voice model also names its text and voice inputs; a character picks it as their voice service.

**LoRAs** (Library → LoRAs; `library/loras.json`): an id, a Civitai version link or a Hugging Face `.safetensors` link (changed to the link of the file itself; nothing is downloaded: fal or Replicate fetch the LoRA from that link when a card runs), trigger words, a strength and a note on the model family it was made for. A card's or a style's `lora:` list takes library ids or links, each with an optional `@strength`; each LoRA is used once (the card's entry wins over a style's), its trigger words lead the prompt, and Civitai file links get your Civitai key (Civitai refuses some files to anyone not logged in, including fal's and Replicate's servers). Models that take LoRAs: `flux-lora`, `flux-2-lora`, and models you added with LoRAs on.

**Styles** (Library → Styles): the style cards on `Assets.canvas`: words before the prompt, after it, or a template around it (`{prompt}`), and LoRAs. In the Characters workspace (Art), each card shows the styles as chips: click one to turn it on (the first time, the style card is copied onto that canvas and linked to the card) or off. Each card also shows its own LoRAs, with their strength.

**Voices:** `voiceService: elevenlabs` in a character note makes `voice:` an ElevenLabs voice id (with accents), and `voiceModel:` picks `eleven_multilingual_v2` ($0.10 per 1,000 characters) or `eleven_flash_v2_5` ($0.05). The Details tab lists the voices in your ElevenLabs account.

### 7.3f Music

Each screen can have a looping track: its note's `music:` (a link to an `.ogg` in `music/`; Cmd+E → Screen settings → Music). The game fades from one track to the next when the screen changes; music plays clean (not through the intercom filter), and **M** mutes it with everything else.

Tracks are made with [Strudel](https://strudel.cc): `music/<name>.strudel` is the pattern, and `npm run music:silver` (`scripts/music.mjs`) renders it into a seamless loop, `music/<name>.ogg` (free; only changed patterns are rendered again; `--all`, `--track <name>`). A pattern sets its loop length with `// @loop 8` (cycles); two loops are rendered and the second kept, so the reverb and echo from the end carry into the start. Screen settings has **Open its pattern in Strudel ↗**, which opens the pattern on strudel.cc, ready to hear and change.

Strudel and the renderer (`strudel-render`, run with npx, in headless Chrome) are AGPL, and are only used on your computer to make the files: the game plays the audio files and contains no Strudel code. The Silver Edit's tracks use only Strudel's built-in synthesizers; any samples added later should be CC0 (no rights reserved).

### 7.3c Moods and faces

A line's tone is its portrait cue, so a character's own moods (warm, uneasy, cold…) can each have a face: a `## Cues` block in their portraits note maps a mood to a picture. With `restOnMood: true` in the portraits note, the character rests on the face of their current mood between lines (otherwise on the idle frame). `lib/emotions.json` (133 expressions in plain words, from VNCCS, MIT) gives mood prompts for the character template; edit recipes keep the likeness with a "keep" style that points at the reference picture instead of describing the face.

### 7.3b Scenes and the story editor (working now)

A **scene** is a timeline, like a Dialogic timeline: blocks read top to bottom. Scenes are made in the game (Cmd+E → **Story ✎**), not in Obsidian, and saved as `story/<id>.json` in the game folder. `js/engine/story.js` plays them; the vault check checks them.

| Block | Does |
| --- | --- |
| Line | Someone says something: who (a character, or Elena), their mood (their face and talking loop follow it), the text. The player clicks **Continue** (or presses Enter). |
| Narration | What happens, in the story's voice. |
| Choice | Buttons for the player. Each option has its own branch of blocks, and can show only if a condition holds. |
| If / else | Two branches, picked by a condition. |
| Set | Changes a mood (state), a flag, a counter, an item, or the screen. Built from lists, not typed. |
| Free talk | The player types and the AI answers (the character's actions), until a condition holds; then the scene goes on. Skipped if the condition already holds. |
| Label / Jump | A place, and a jump to it. Renaming a label renames the jumps. |
| End | Ends the scene: close the talk, or keep talking freely; an ending can end the game. |

**The editor:**
- Left: the scenes, a new scene, and the blocks to add. A block goes after the selected block, into the selected branch, or at the end.
- Middle: the scene. Drag a block to move it, also into or out of a branch.
- Right: the selected block's settings (people and moods from lists, conditions with suggestions and a check), or, with nothing selected, the scene's: its name, who it is with, **Starts when you click** (an object; it plays the first time, then they talk freely), and its problems.
- **▶ Play from here** plays the scene from the selected block, saved or not. Undo, Redo, Save (Cmd+S), Delete.
- A button or effect can also start a scene: `scene <id>`.

### 7.4 Make assets with AI on a canvas (working now)

**Where art lives.** Every character, screen, and item has its own folder with its own canvas (such as `characters/arthur/Arthur.canvas`). A recipe saves beside the canvas it is on, in that folder's `art/<recipe>/`: the finished files, and the clean originals in `_source/`. The runner owns these folders. Shared art goes in `game/assets/`:

| Folder | Holds |
| --- | --- |
| `ui/` | Frame and button art for UI notes. |
| `references/` | Shared pictures you give to recipe cards. |
| `generated/<recipe>/` | What recipes on `Assets.canvas` make. |

`Assets.canvas` keeps the guide, the model list, and the **style library**. A canvas uses a style by holding its own copy of the card (copy it from the library) with an arrow to the recipe.

**Templates.** `npm run new -- character "Mira" "a tired night nurse in her 50s, short grey hair, blue scrubs"` (or Game Tools → *New character…* in Obsidian) makes a character's folder: the character note, one profile, four starter actions with lines and `## Mock` rules (ask what they want, answer a question, say no, end the talk), a lines note, a dialogue tree, an outcome, a two-layer portraits note, and its canvas with every art recipe ready (room, actor, moods and blinks, talking loops, the booth composite, and *In the scene*: the character placed in a screen and cut out, their talk-portrait cutout, and the background crop), all `status: idea`. It can be talked to at once, offline, through the vault Mock. `scene` and `item` work the same: a screen note, its art canvas (background, a prop and its cut-out) and a group on `World.canvas`; or an item note and its art canvas (a picture and its cut-out, ready to lay in a scene with a click shape). Nothing is generated or spent until you run a card.

File names stay unique across the whole vault, so links such as `[[booth-guard-talk-01.webp]]` work wherever a file lives.

`game/Assets.canvas` is a workbench for game art. Each **recipe card** makes one asset through fal.ai. Results come back as cards on the same canvas and as files in `game/assets/generated/`.

```text
## gate-dawn          ← name, also the output file name
image                 ← style, image, or animate
status: go            ← "go" runs it; the runner writes running / done / error
model: flux-lora
size: 1280x720
prompt: warehouse car-park gate at dawn …
```

| Card | Does |
| --- | --- |
| `style` | Holds `lora:` (`<url> @0.9`, one or a list), `prefix:`, `suffix:`, and `template:` (wraps the recipe prompt where it says `{prompt}`, for LoRAs trained on a fixed caption). An arrow from it adds these to a recipe. It is never run by itself. |
| `image` | Text to image. `model:` `z-image` (Z-Image Turbo, about $0.004 a picture, best for empty pre-rendered rooms), `krea-2` (Krea 2 Turbo, about $0.006, best for 1990s-looking actors on a chroma-key screen), `flux-lora` (FLUX.1 [dev], takes FLUX.1 LoRAs, about $0.035) or `flux-2-lora` (FLUX.2 [dev], FLUX.2 LoRAs only). Also `size`, `seed`, `steps`, `guidance`, `width` (output scale). |
| `edit` | Changes the pictures that point to it (the references), as its prompt says: the same person with a new mood, pose or angle. `model:` `qwen-edit` (Qwen Image Edit 2511, about $0.024, the default: kept Arthur's face best) or `flux2-edit` (FLUX.2 [dev] edit, about $0.021). A style card's `template` is a good place for "keep the same man, framing and green screen; only change {prompt}". Blinks are edits too: eyes half closed, eyes closed. |
| `cutout` | No AI call, free. Keys the picture that points to it off its green or blue screen, trims it, and keeps it transparent (crunched with transparency kept), so a prop can be layered over a scene. `mirror: true` also writes `<name>-mirrored.webp`. The key works in three steps: a colour-difference matte, then edge unmixing (each edge pixel is split into the screen colour and the actor colour nearby, for soft, accurate hair and fabric edges), then colour cleaning (the screen's share is taken out of part-covered pixels, so no green fringe). The method is adapted from VNCCS (MIT; see THIRD_PARTY_NOTICES.md). `keyLow` and `keyHigh` (0–1, defaults 0.3 and 0.65) set how green a pixel must be to go see-through; raise them (`0.5`, `0.85`) when green light makes parts of the picture half see-through. `despill: strong` pulls the green tint off what is left, for chrome and other shiny things. Keep green out of the picture itself: a green lamp shade vanishes with the screen. The gate leaf, posts and call panel are cut-outs. Fed by an `animate` card instead, it keys every frame of the clip (one screen colour, one trim box) into a transparent limited animation: a walk cycle in place that the engine moves with `walk`, or a walk across the whole frame that `clip` plays (`arthur-cross-cut`, `dog-cross-cut`). |
| `composite` | No AI call, free. With several `actor` arrows it makes one picture per actor, `<card>-<actor>.webp`, all with the same placement; `align: true` keys them together (one screen colour, one trim box) so moods and blinks line up exactly. An arrow labelled `room` (a picture of an empty room) and one labelled `actor` (an actor on a green or blue screen) come in. The runner keys the actor off the screen with a colour-difference key, trims them, and pastes them over the room with slightly wrong lighting and hard edges, like a 1990s FMV game. `shot` (`full` or `waist-up`), `height` and `x` (shares of the frame), and `seed` place the actor; `brightness`, `contrast`, `temperature`, `feather` and `shadow` override the seeded look. Crunch applies as for images. | If the `actor` arrow comes from an `animate` card, every frame of that card's clean clip is keyed (one screen colour read from the first frame, one trim box for all frames, so nothing flickers or jumps) and pasted over the still room; the result is a limited animation (`name.webp`, frames, `name.mp4`) with the animate card's frame count and speed and the composite card's crunch and colours. Animate the actor on the green screen, not the finished composite: the room then stays perfectly still, as in the original games.
| `crop` | No AI call, free. Cuts a box out of the picture that points to it: `box: [x, y, w, h]` (in that picture's pixels, or a World.canvas card box when the picture is a scene picture, as `[482, 260, 323, 250]`), plus `bleed: 10` pixels all round. Used for the background layer of a talk portrait: the scene behind the character's click box. |
| `animate` | Image to video with `model: h3-max-turbo` (about $0.13 for 5 s at 480p) or `minimax-h3` (about $0.25), then **limited animation**. An arrow from an image (a file card or an image recipe) is the first frame. An arrow labelled `end` is the last frame. With no `end`, the clip ends on its first frame, so it loops. |

Limited animation settings on `animate` cards:

| Setting | Meaning | Default |
| --- | --- | --- |
| `seconds`, `resolution` | Clip length and size from the video model | `5`, `480P` |
| `from`, `to` | The part of the clip to use, in seconds | whole clip |
| `frames` | How many drawings to keep, spread evenly | `6` |
| `fps` | Playback speed of those drawings | `8` |
| `colors` | Reduce to this many colours with ordered dithering, for a 90s look (`0` = off) | `0` |
| `width` | Scale the frames to this width | clip size |
| `pingpong` | Play forward then back, so the loop has no jump | `false` |

**Crunch finish.** For a compressed, CD-ROM-video look, a recipe or style can set `crunch: 4` (how many times smaller) and `jpeg: 50` (quality, 1–100, lower is crunchier). The picture is shrunk, saved as a JPEG at that quality, then enlarged back to full size with no smoothing (`crunchFilter: neighbor`; `bilinear` is softer). It applies to images and to every animation frame, before any `colors` palette. `crunch: off` turns it off for one recipe. The FMV style card sets `crunch: 4` and `jpeg: 50`.

**Originals and refinish.** The runner keeps the clean picture and the clean video clip in the recipe's own `_source/` folder, as `name.source.png` and `name.source.mp4` (the `.source` ending keeps file names unique, as Obsidian links need). `--card NAME --refinish` (right-click → *Redo finish only (free)*) remakes the finished files from those, with the card's current crunch, frame, and colour settings. There is no AI call and no cost.

The runner writes `name.webp` (an animated, looping WebP, for the game), `name-01.webp`… (the single frames, for a portrait's talk sequence), and `name.mp4` (the same finished loop as an H.264 video, repeated to about 4 seconds and enlarged with sharp pixels to at least 640 px wide, for sharing in apps that do not show WebP). The clean AI clip is kept as `name/_source/name.source.mp4`. Finished pictures also get a `name.jpg` twin for sharing.

Any other fal model works with `endpoint:` and `params:` (extra input fields, passed as they are).

```bash
npm run assets -- --dry-run   # show the requests, spend nothing
npm run assets                # run every card set to "status: go"
npm run assets -- --watch     # keep running; set cards to go in Obsidian
```

- The key is `FAL_KEY` in `.env`. It never goes into the vault.
- Local images are sent as `data:` URIs, so nothing needs uploading first.
- The runner re-reads the canvas before each write and changes only its own card and result cards, so edits you make meanwhile are kept.
- A rerun replaces that card's old result cards. Files with the same name are overwritten.

**In Obsidian (Game Tools plugin, working now).** The vault ships a small local plugin, `game/.obsidian/plugins/game-tools/`, so nothing needs a terminal:

- **Right-click a recipe card** on any canvas: *Generate "name" now* (runs `--card name`, whatever its status), *Preview request (free)* (a dry run, shown in a window), and *Status: idea / go* (edits the card's `status:` line).
- **Card colours** show progress: yellow while running, green when done, red on an error.
- **Commands** (`Cmd+P` → Game Tools): generate every card set to go, preview them, start or stop watching the canvas, play the game (`npm run app`), and open the workbench. The status bar shows running jobs and the watcher.
- The plugin runs the same `scripts/assets.mjs` from the repo folder, through a login shell, so `node` is found the way the terminal finds it. It uses Obsidian's `canvas:node-menu` event, which exists (checked in Obsidian 1.13.7) but is not in the public API, so a future Obsidian update could change it.
- It is desktop only. Community plugins must be turned on once in Obsidian's settings.

**Research notes (30 September 2026):**

- **FLUX.1 LoRAs do not load on FLUX.2.** To use a FLUX.1 style LoRA (such as a "[FLUX]" LoRA from Civitai), use `flux-lora`. To move the look to a newer model, train a FLUX.2 LoRA on fal from a set of 15–30 images made with the old one.
- **MiniMax H3 on fal** takes a first frame (`image_url`) and an optional last frame (`end_image_url`), 480P to 4K. This is what makes looping clips possible.
- **RefMod** is a new set of MiniMax H3 reference adapters for character consistency. It runs only in local ComfyUI with a GPU, and is marked "under construction". It is not available through fal or the MiniMax API, so the runner does not use it. The first-frame image already carries the character's look.

## 8. Items

````markdown
---
type: item
name: Contractor ID card
image: "[[contractor-id.webp]]"
startWith: true
usableOn: "[[Arthur]]"
once: true
effects:
  - item contractor-id shown
---

The card shows a name. It does not prove the job. Arthur says so.
````

The tree exit `if item.contractor-id = shown` (section 5.5) takes over from there.

## 9. Events and outcomes

An event is "when this happens, if this is true, do this". It is how rules like endings stop being code. One note per event:

````markdown
---
type: event
on: action
priority: 30
if:
  - some memory.tag in [threat, weapon, trespass] since repair
effects:
  - end [[locked-out]]
---

## Also needs
```yaml
any: [lastAction = END_CONVERSATION, counter.refusals >= 6]
```

Locked out beats expelled, so this has the higher priority.
````

- `if` (Properties) and `## Also needs` (rule block) must both be true.
- Higher `priority` runs first. The first `end` wins.
- An event can have a `## Memory` block, like an action ([[remember-purpose]]).
- **Working now:** `action`, `action <ID>`, `turn`, and `reply`. The others are planned.

````markdown
---
type: event
on: action ALLOW_ENTRY
effects:
  - flag gate-open
  - sound unlock
---

`flag gate-open` swings the gate leaves open ([[gate-front]]).
````

A note can also put longer effects in an `## Effects` rule block. When a note has both, the Properties list runs first.

Triggers (`on`):

| Trigger | Fires when |
| --- | --- |
| `start` | the game starts |
| `enter <screen>` / `leave <screen>` | a screen is entered or left |
| `input` | the player sends text, before the model call |
| `action` / `action <ID>` | an NPC action is applied |
| `turn` | every turn ends |
| `reply` | his line is picked, before the turn's effects. `append <line>` adds a line from the lines note (the company-call warnings). |
| `flag <name>` / `var <name>` | a value changes |
| `item <id>` | an item is used |
| `timer <seconds>` | seconds pass on a screen |
| `end` | an outcome is set |

An outcome is a note too:

````markdown
---
type: outcome
result: success
---

The barrier lifts. Report to Guard Tower 04.
````

The note body is the ending card text. `result` keeps the old `success` / `failure` values, so providers and tests still work.

## 10. Engine core

### 10.1 Modules

| Module | Job |
| --- | --- |
| `scripts/compile-vault.mjs` | Read every note, canvas and tree. Notes keep their Properties, rule blocks, and every section's text. |
| `scripts/check-vault.mjs` | Check the vault and write `_reports/check.md`. |
| `engine/character-data.js` | Build a character from its notes: template, profiles, actions, lines (in the old data shapes). |
| `engine/encounter.js` | One encounter: available actions, the provider call, the judgment bar, effects, memory, events, the dialogue tree. |
| `engine/conditions.js` | Parse short form. `evaluate(condition, world)`. |
| `engine/effects.js` | Parse short form. `applyEffects(effects, world) → events[]`. |
| `engine/session.js` | A play session: screens, objects, UI, timers, sound, and the encounter. |
| `engine/ui.js`, `engine/canvas-world.js`, `engine/sound.js` | Drawing, the world canvas, and sound. |
| `dialogue.js`, `performance.js`, `conversation-signals.js`, `npc.js` | Line picking, the performance, built-in signals, state helpers. Shared with the frozen browser game. |
| `providers/jev-vault.js`, `providers/mock.js` | The decision providers. |

The core has no DOM. The session gives it input and plays what it returns.

### 10.2 One turn

1. Player sends text.
2. Run detectors and built-in signals.
3. Fire `input` events.
4. If the node is `script`: match a choice, run its effects, go to the next node. Stop.
5. If the node is `open`: list actions whose `available` is true.
6. Call the provider with the context and that list.
7. Check the answer. Unknown action → `fallbackAction`. Failed confidence or judgment → fallback.
8. Run the action effects. Add the memory. Bump counters.
9. Pick the line for the action, tone, and profile.
10. Fire `action` and `turn` events. The first `end` effect sets the outcome.
11. Follow any tree arrow whose condition is now true.
12. Return a **turn result**: line, performance cues, screen changes, outcome, and the full debug record.

If the provider fails, nothing changes and the player's text stays.

**Working now** in `js/engine/encounter.js`. Before step 4, the tree may take the input instead (a `~ detector` or `if` arrow to a script node). After step 9, `on: reply` events run (they can `append` a line). Steps 10 and 11 are `on: action` and `on: turn` events.

### 10.3 Play session

`js/engine/session.js` runs a play session: the world, the current screen, open objects, and the encounter (`js/engine/encounter.js`, run from the vault) feeding the `conversation-log` and `text-input` slots. The desktop app and the workbench both use it, so what you test is what ships.

### 10.4 Desktop app (working now)

The game runs as a standalone desktop app built with Electron. No browser is involved.

```bash
npm run app
```

- `desktop/main.mjs` opens one game window and serves the game files from an internal `app://game/` address. The game page cannot leave it or open other windows.
- The vault is compiled when the app starts. In development, saving a note in Obsidian redraws the open game.
- Jev calls run in the app's main process, so the `.env` key never reaches the game page. With no key, the app uses Mock.
- `npm run app:smoke` opens the game hidden, clicks the intercom, saves two screenshots to `build/`, and quits. It is a quick "does it start" check.
- Menu: **Game → Restart** (`Cmd+R`), full screen, and **Develop → Toggle DevTools**.
- **Sound (working now):** `js/engine/sound.js` gives the session Arthur's voice and the sound effects, reusing the browser game's parts: the Piper neural voice through the intercom filter (eSpeak and browser speech as fallbacks), the intercom key-up click, the gate ambience, button clicks, and the cue for each line (relay, warning, unlock, denied, lockdown). Each line is spoken in its profile's voice settings, and his talking frames run exactly while the audio plays. The greeting waits until the player calls him. `M` mutes in the app; the workbench has a Sound checkbox and logs which voice spoke.
- **Connecting.** Calling someone on an in-world object with a `conversation` (the intercom) first shows CONNECTING on its screen: "Ringing Tower 04…", or "Tuning voice N%" while the voice model (about 60 MB) downloads on the first launch. The line goes live once the neural voice is ready and a short ring has passed (1.8 s on the first call, 1 s after). Only then does the greeting appear and play, so Arthur's first line is always spoken in his real voice. The text box waits too. UI notes read `call.connecting` and `call.status`. The model is cached after the first launch.
- **No answer.** An object's `noAnswer` condition (the intercom: `[flag.arthur-out]`) makes a call ring for `ringSeconds` and then show NO ANSWER (`call.unanswered`). It does not count as the first call, so the greeting waits for a real one.
- **Timers.** A `type: timer` note switches a flag on a clock: each cycle of `every` seconds, `flag` is true for the last `for` seconds, and the clock stops while `pause` holds. [[arthur-patrol]] sends Arthur out for 26 s of every 70 s, never during a call.
- **Not yet:** a packaged `.app` / `.exe` file for other people (electron-builder), and shipping the voice model inside the app so the first launch needs no download.

### 10.5 Provider contract

```js
provider(context, availableActions) → { action, confidence, reason, judgments?: { [id]: number }, stateChanges?, memory? }
```

- `context.prompt` carries the character's role, instructions, the `## Criteria` of each available action, and each `## Judgment`. `providers/jev-vault.js` turns it into the Jev request, so the Jev provider has no character in it. The request body is the same as the old one (tested).
- A provider that returns `stateChanges` or `memory` replaces the action note's state effects or `## Memory`. The Mock does; Jev does not.
- The Mock provider: Arthur keeps his own, written in code (`providers/mock.js`). Any other character uses `providers/mock-vault.js`, which reads each action's `## Mock` block (`when`, `priority`, or `default: true`).

## 11. Compiler and checker

Command: `npm run vault:check` (also part of `npm run check`). It compiles the vault, builds every character, runs the detector tests, and writes the report (11.3). The app and the workbench compile the vault themselves when they start, and again each time you save a note. `npm run vault:watch` (`vault:watch:silver` for The Silver Edit) checks again after every save and rewrites the report; the report itself and `.obsidian` do not count as saves.

### 11.1 Reading notes

- Properties: the `yaml` npm package, in YAML 1.2 core mode (so `no` stays text, not `false`).
- Note body: a small own parser. It needs only headings, bullet lists, `>` quotes, `Template:` lines, and fenced code blocks. It ignores all other Markdown.
- Canvas: `JSON.parse`, then read `nodes` and `edges`.
- Links: `[[name]]`, `[[name|alias]]`, and `![[embed]]` become the id `name`.

### 11.2 What it checks

It fails with a clear message (note, line, what is wrong) when:

- two files have the same name;
- a link points to nothing;
- a property, condition, or effect has an unknown key or bad short form;
- a note has an unknown `type`;
- an action has no dialogue for the `neutral` tone;
- a template uses a slot that does not exist, or a `[[token]]` is not a note and not a known token;
- a detector fails its `match` or `miss` tests;
- a tree node has no name, a script node has no way out, or a node cannot be reached;
- an outcome is never set by anything;
- an asset file is missing, or is over the size budget from `check-release.mjs`.

### 11.3 Reports in the vault

The checker writes plain notes to `game/_reports/` (today only `check.md`). You read them in Obsidian. Every item links to the note that has the problem.

| Report | Shows |
| --- | --- |
| `_reports/check.md` | Errors and warnings, each with a link. "All clear" when there are none. |
| `_reports/stats.md` | Counts: actions, lines, possible rendered lines, screens, events. |
| `_reports/coverage.md` | Lines never used in saved playtest logs, per action and tone. |
| `_reports/actions.md` | One table: each action, its gates, and its state changes. |

Git ignores `_reports/`.

## 12. Workbench

### 12.1 Why it exists

Obsidian does files, text, links, search, graph, and trees. It cannot do three things this game needs. The workbench does only these three.

### 12.2 Shape

- A page at `http://localhost:5174`, started with `npm run workbench`. It is its own small server, only for local dev. It is never deployed.
- It compiles the vault in memory. When you save a note in Obsidian, the page redraws in under a second.
- Plain HTML and JavaScript, same as the game. No framework.
- It reads the compiled bundle. It never edits notes, except the hotspot tool.

### 12.3 UI preview (working now)

- Pick any `ui` note. It draws at the right size for the window.
- Sliders and checkboxes change Arthur's state, flags, and items. The UI follows at once.
- Buttons and their `key` shortcuts run their effects. A `screen` effect jumps to that screen's UI. Other effects show in the event log.
- Slots show as dashed boxes. **Open note in Obsidian** opens the note you are looking at.
- Problems from the compiler and the UI checker show in the sidebar.

**Play (working now):** with **Play** on, the real encounter (`js/game.js`, Mock or Jev) fills the slots. `text-input` becomes a text box, and `conversation-log` shows the talk. The `send` effect and `item contractor-id shown` drive the game. The world follows the game, so bars, flags, and the gate picture update after each turn. Jev calls go through the workbench server with the `.env` key, as in `server.mjs`.

### 12.4 Hotspot tool

- Pick a screen. It shows the screen image with hotspots drawn on top.
- Drag to add, move, or resize a hotspot. Type its `id` and `label`.
- **Save** writes only the rule block under `## Hotspots` in that screen note. The rest of the note stays the same, including comments.
- If the note changed on disk since the tool loaded it, the save stops and asks you to reload.

### 12.5 Play

- Runs the game in the page, with the mock or Jev provider.
- **Start here:** start at any screen or tree node. Set flags, items, and NPC state first.
- Shows the debug record for each turn: detectors hit, actions offered, model answer, rules and events that fired.
- Each item in the debug record has an **Open in Obsidian** link. It uses Obsidian's own URL scheme (`obsidian://open?vault=game&file=...`), so one click opens the note that caused it.

### 12.6 Replay

- Load a saved playtest log from `playtest-logs/`.
- Step through it turn by turn and see which rules fired.
- **What if:** change one number (for example the `ALLOW_ENTRY` suspicion limit) in the page, and replay with the mock provider to see what changes. To keep the change, you edit the note in Obsidian.

### 12.7 Screen editor (working now)

Press **Cmd+E** in the desktop app (**Game → Edit screen**) to edit the screen you are on, on top of the real game picture. The scene freezes (the clocks pause) and every part of the screen gets a box.

- **Select** a box, or a row in the layer list. **Drag** to move; drag a **corner** to resize, with **Shift** to keep the shape; **arrow keys** nudge 1 pixel (Shift: 10). The x, y, w, h fields take exact numbers.
- **Snap:** while you drag, a box's edges and middle snap to the edges and middles of the other boxes and of the screen, when they come within 6 pixels. Hold **Cmd** to drag freely.
- **Pictures:** **Option-drag** inside a picture's box slides the picture inside it; the box stays put (saved as `focus` on its card, 7.3). A picture with a click shape (an arrow from an object or item card) is one box, labelled `picture (click: object)`: moving it moves the click area too, and its click shape shows inside the box (cyan; pink when selected).
- **Talk portrait:** **Option-drag** inside the portrait box moves the character; **Option-Shift-drag** moves the background layer (saved in the character's portraits note as `offset`/`zoom` and `backdropFocus`/`backdropZoom`).
- **Layers:** the screen's cards (UI layers, images, text), its objects, and its exits, front at the top. **▲ ▼** change the drawing order; **●** hides a layer while you edit (not saved). The scene picture is locked: it sets the screen's frame.
- **Edit inside:** **▸**, or click a layer twice, opens a UI layer (such as [[gate-front]]) to edit its parts; **Esc** goes back.
- **Preview:** switches for flags, open objects and items, to see the screen in another state.
- **Add** (screen level only):
  - **＋ Picture:** the vault's finished pictures (not `_source` originals, single animation frames, or `.jpg` twins), with search. A click puts the picture in the middle of the screen, a third of its width.
  - **＋ Thing:** the object, item and UI notes not yet on this screen. An object or item goes in as a small box, a UI as half the screen.
  - **＋ Exit:** choose a screen. A button that goes there appears at the bottom (a text card with an arrow to that screen's group). Change its label, where it goes, and when it shows in its settings.
  - **＋ New screen:** type a name, then click a picture. It saves at once: a new group with that picture, below everything on `World.canvas`, and a screen note (`screens/<name>/<name>.md`, the name as its title), and the editor goes there. Then add parts, and an exit to it from another screen.
- **Screen list** at the top of the panel: go to another screen to edit it (save or undo first).
- **Screen settings** (nothing selected): the screen note's *Title*, *Objective* and *Overlay* (a UI note drawn over the whole screen). A screen with no note gets a **Make a screen note** button.
- **Settings** for the selected part (each change can be undone, and is written on Save):
  - **Picture:** which picture it shows, *Show when* (a condition, saved as `if:` on its card), and *Shade*.
  - **Text card:** its text, and *Show when* (its first line `if …`).
  - **Exit:** its label, *Goes to* (the screen), and *Show when* (the arrow label `if …`).
  - **Object or item:** its note's `label`, `key`, `visible` (*Show when*, one condition per line) and `use` (*On click*, one effect per line). The note is shared, so this changes it on every screen.
  - **A part inside a UI layer:** its own fields for what the engine knows: *Show when*, *Opacity* and *Shade* (sliders), *Mirror*, *Rotate*, and a group of fields each for **Swing** (while, hinge, how far, seconds, steps), **Walk** (while, to x and y, seconds, steps a second, comes back, repeats) and **Clip** (images only: while, frames, frames a second, wait, gap, plays back, repeats). **＋** adds one with starting values; *Remove* takes it off. A field left at the engine's default is not written. Every other setting is a text box (text, a number, or JSON for lists); an empty value removes it; *Add* adds one (the box suggests the settings that element type takes). Only that setting's text changes in the note, in the note's own style.
- **Click shape:** select an object, then choose a picture in *Click shape from a picture…* (an arrow on the canvas). Select the picture and press **Remove the click shape** to undo it.
- **Remove from screen** takes a card and its arrows off `World.canvas`. Removing a picture removes its click shape too.
- **Undo / Redo** (Cmd+Z, Shift+Cmd+Z). **Save** (Cmd+S) writes into the vault: new and removed cards, arrows, card boxes and order on `World.canvas`, and element boxes (`at`) and order in UI notes. Only the changed text is replaced, so comments and formatting stay (`lib/editor-save.mjs`). If a file changed on disk since you started (in Obsidian, say), it asks before overwriting.
- Parts of the screen stay on the scene picture, because a card dragged off it would drop out of the screen.
- The game page on the workbench server (`/player/index.html`) has the same editor, saving through the workbench.

**Not yet:** editing parts nested deeper than one layer, and an animation timeline.

## 13. Moving Arthur over

Each step keeps the game working. Steps 3 to 6 are proven by `tests/vault-engine.test.mjs`: the same scripted talks (all 5 endings, all 12 actions, every profile) give the same lines, actions, state, memories and endings as the old code, with the Mock and with a stand-in Jev, and the same Jev request body.

| Step | Work | Status |
| --- | --- | --- |
| 1 | The `game/` vault, the compiler. Arthur's data rebuilt from notes. | **Done.** The notes rebuild `data/*.json` and the profile table exactly (tested). The one-time export script is retired: the vault is the source. |
| 2 | `conditions.js` and `effects.js`, with tests. | **Done.** |
| 3 | Actions from notes: list, criteria, effects, `available`. | **Done** for the desktop app. |
| 4 | Detectors and profiles from notes. | **Done** for the desktop app. |
| 5 | Endings and limits as event and outcome notes. | **Done.** Ending sounds are in the outcome notes. |
| 6 | The fake ID and company call as Canvas tree `script` nodes. | **Done.** |
| 7 | Screens and hotspots from notes. | **Done** (World.canvas). |
| 8 | Reports in `_reports/` and `--watch`. | **Done:** `npm run vault:check`, and `npm run vault:watch`. |
| 9 | Workbench: hotspot tool. | Replaced by the screen editor (12.7): objects and exits are boxes you drag. |
| 10 | Workbench: play and replay, with Open in Obsidian links. | Play done; replay not built. |
| 11 | **Proof:** add a second NPC at Guard Tower 04 with notes and a canvas only. | Next. The character template and the vault Mock make this possible; it needs an object on the tower screen to talk to them. |

The old code (`js/game.js`, `js/character.js`, `js/providers/jev.js`) stays only for the frozen browser game and as the reference for the parity test.

Step 11 is the real test of this spec.

## 14. Open questions

1. **Short form limits.** The short form covers most rules. Should `any` also get a short form (for example `a | b`)? This spec says no, to keep the grammar small. Use a rule block for `any`.
2. **Mock provider.** Answered: new characters use `## Mock` sections (`providers/mock-vault.js`). Arthur keeps his code Mock, because the parity test compares against it.
3. **Shared actions.** This spec puts actions under each character. A shared action (for example `WARN_PLAYER` for all guards) may come later with an `extends` property.
4. **Obsidian plugin.** Built, small: Game Tools runs asset cards, sets their status, and opens the game and the workbench. It could later show checker errors and the hotspot tool as views.
5. **Dataview.** The community plugin Dataview could show live tables in the vault. The `_reports/` notes cover the same need without a plugin, so it stays optional.
