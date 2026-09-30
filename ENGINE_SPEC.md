# Scene Engine Spec

Status: draft, 29 September 2026. Revision 2: the game is written in an Obsidian vault.

A working sample of this format is in `game/`. Build it again from the live game with `npm run vault:export`.

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

So a second NPC or a second place needs new JavaScript. This spec changes that.

**Goal:** a small engine that runs scenes from an Obsidian vault. Obsidian is the editor. A new NPC, a new screen, or a new event needs notes only. No new code.

**Non-goals:**

- No big general engine (no physics, no inventory grid).
- No model-written dialogue. This rule does not change.
- No custom text editor. Obsidian does that job.
- No Obsidian plugin in version 1. It can come later (section 14).
- No browser for players. The game ships as a standalone desktop app (section 10.4).

## 2. Rules the engine keeps

These come from `ROADMAP.md` and stay true:

1. The model never writes dialogue. It picks one action from a list the engine gives it.
2. Every spoken line comes from an authored note.
3. The engine checks every model answer. A bad answer becomes a safe fallback action.
4. State changes, memories, and endings are done by engine rules, not by the model.
5. Runs are repeatable. Same seed plus same input gives the same result.
6. The vault is the source of truth. Tools only read it, except the hotspot tool, which writes one block (section 12.3).

## 3. Big picture

```text
 Obsidian vault  game/                    workbench page (/workbench)
   notes (.md)  canvas (.canvas)            hotspots · play · replay
          │   ▲                                   │
          │   └──── writes hotspot blocks only ───┘
          ▼
   compiler + checker ──► dist/game.bundle.json
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
- **Engine core:** pure JavaScript. No DOM. Runs in Node for tests and in the browser for play.
- **Renderer:** today's `js/app.js`, `js/portrait.js`, `js/speech.js`, `js/audio.js`.
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

Types: `game`, `character`, `profile`, `action`, `dialogue`, `lines`, `portraits`, `detectors`, `screen`, `ui`, `theme`, `item`, `event`, `outcome`, `token`.

A `token` note documents a placeholder such as `[[address]]`. It also stops Obsidian showing the placeholder as a broken link.

A dialogue tree is a `.canvas` file, not a note (section 5.5).

### 4.3 Names and links

- **The file name is the id.** `ALLOW_ENTRY.md` is the action `ALLOW_ENTRY`. `south-gate.md` is the screen `south-gate`.
- **File names must be unique in the whole vault.** The checker enforces this, because Obsidian links find notes by name.
- **Links are references.** `[[south-gate]]` in a property or rule block means "the thing with id `south-gate`". The compiler turns links into ids.
- **Renaming is safe.** With "Automatically update internal links" turned on, Obsidian fixes every link when you rename a note.
- **Assets are links too.** `[[gate-closed.webp]]` points to an image in `assets/`. Obsidian shows it in the note.

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
  detectors.md
  screens/   south-gate.md  guard-tower-04.md
  items/     contractor-id.md
  events/    gate-opens.md  locked-out.md  expelled.md  ...
  outcomes/  entry-granted.md  refused.md  ...
  assets/    images, animations, sounds
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

No community plugins are needed. Git ignores `game/.obsidian/workspace*.json` and other per-person files.

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
greed: 25
courage: 70
sympathy: 55
ruleFollowing: 80
trust: 20
suspicion: 40
irritation: 10
fear: 5
memoryMax: 8
historyMax: 12
fallbackAction: "[[REFUSE_ENTRY]]"
profilePick: random
tree: "[[arthur-tree.canvas]]"
portraits: "[[arthur-portraits]]"
---

# Arthur

![[arthur-portrait.jpg|160]]

## Style
Practical and ordinary. Uses simple reasoning and everyday language, and
assumes late-night visitors already understand the basic gate procedure.

## Goals
```yaml
- { id: protect-warehouse, label: Protect warehouse grounds, priority: 100 }
- { id: keep-job, label: Keep his job, priority: 90 }
- { id: avoid-trouble, label: Avoid trouble, priority: 60 }
```

Design note: Arthur should feel tired, not stupid.
````

- Personality and state are flat Properties, so you edit them in the Obsidian form.
- The `## Style` section is plain text. The compiler sends it to the model as the cognition note.
- The last line is a free comment. The compiler ignores it.

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

One note per action. This joins four things that are now in three code files: the action list, the gate rules, the text for the model, and the state change.

````markdown
---
type: action
character: "[[Arthur]]"
label: Open the car-park gate
available:
  - flag.entry-basis
  - no memory.tag in [threat, weapon, trespass] since repair
  - state.suspicion < 78
  - state.irritation < 71
minConfidence: 0.25
judgment: entry-case-credible
judgmentMin: 0.45
effects:
  - state trust +20
  - state suspicion -20
  - state irritation -5
ends: "[[entry-granted]]"
dialogue: "[[allow-entry]]"
---

## Criteria
Open only the warehouse car-park gate when the player's conversation has
become coherent, persuasive, and consistent enough for a cautious exception.
A contractor ID card or a vague claim such as "I have them" is not enough.
Tell the visitor to report directly to Guard Tower 04.

## Judgment
Is the player's spoken case for entry credible?

## Mock
```yaml
when: [detector = work-detail, state.trust >= 30]
priority: 40
```
````

- `## Criteria` is sent to the model. It replaces `ACTION_CRITERIA`.
- `## Judgment` is the question for a second model call, like today's credibility check.
- `## Mock` tells the offline mock provider when to pick this action.
- `available` and `effects` are short form, so they are editable in the Properties form.

Other actions look the same. For example, `ASK_FOR_REASON.md` has `available: [not flag.reason-asked]` and `effects: [flag reason-asked, state trust +2]`, plus `opensRequest: purpose`.

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
> I can see the card. That tells me a name, not why you're here.
> I could ring your company to check the callout.

```yaml
do:
  - memory: { fact: "Player showed a contractor ID", tags: [identity, claim], importance: 76 }
  - flag company-call-pending
```
````

````markdown
## company-call
script
say company-call-result
end exposed
````

- **`open` node:** the player types freely, and the model picks an action. This is today's Arthur. An optional `actions:` line limits the list.
- **`script` node:** fixed lines and fixed choices. No model call. Lines starting with `>` are said by the character. Other plain lines are short-form effects.
- A card can also be a **file card** that points to a note. Use this for big nodes. The note uses the same layout.

**Arrows.** Each arrow is a way out of a node. The arrow's label says when it is taken:

| Arrow label | Meaning |
| --- | --- |
| `"Go ahead, call them."` (in quotes) | A player choice. It shows as a button. |
| `"Go ahead, call them." ~ accepts-company-call` | A choice that free text can also pick, through a detector. |
| `~ accepts-company-call` | An exit taken when free text matches a detector. No button. |
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

The checker rejects a card with no name, two cards with the same name, a script node with no way out, and a node nothing can reach.

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

````markdown
---
type: screen
title: Car park / South gate
width: 640
height: 360
camera: CAM 04-B / EXTERIOR
conversation: "[[Arthur]]"
conversationStyle: video-intercom
---

![[gate-closed.webp]]

## Layers
```yaml
- id: gate
  states:
    closed: "[[gate-closed.webp]]"
    opening: { animation: "[[gate-opening.webp]]", reducedMotion: open }
    open: "[[gate-open.webp]]"
  start: closed
- id: scan
  effect: scanlines
```

## Status
```yaml
- { label: Barrier, when: flag.gate-open, then: Open, else: Secured }
```

## Hotspots
```yaml
# written by the workbench hotspot tool; you can also edit it by hand
- id: intercom
  label: VIDEO INTERCOM
  rect: [412, 150, 90, 110]
  do: [start-dialogue [[Arthur]]]
- id: gate
  label: GATE
  rect: [120, 120, 260, 180]
  do: [say gate-locked]
- id: walk
  label: MOVE TO TOWER 04 →
  rect: [240, 200, 160, 80]
  visible: [flag.gate-open]
  do: [screen [[guard-tower-04]]]
```
````

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
  src: "[[gate-closed.webp]]"
  fit: cover
  visible: [not flag.gate-open]
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
rect: [531, 137, 64, 72]      # where it is in the scene picture
ui: "[[intercom-hud]]"        # its face, a normal ui note
panel: [262, 10, 370, 300]    # where that face opens on the screen
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
| A **ui note** card on the picture | That UI, drawn in the card's box. |
| A **text card** | Text on the screen. If it embeds a picture (`![[gate-open.webp]]`), it is an image layer. |
| A first line `if <condition>` in a text card | The card shows only when the condition is true. |
| An **arrow** from a text card to another screen group | That card becomes a button that goes there. An arrow label `if <condition>` also gates it. |
| An **arrow** from an object card to a ui note card inside the frame | Where that object's UI opens. If the ui card is outside the frame, the object's `panel` property is used. |
| **Cards outside screen groups** | Notes for people. The engine ignores them. |

Rules:

- **Order is layering.** Cards later in the canvas draw on top. The screen's `ui` note (for example the camera overlay) draws above the canvas cards. Objects and buttons draw above that.
- **A variant picture** (such as the open gate) is a text card with `if flag.gate-open` and the picture. Put it *before* the main picture in the canvas order, so Obsidian shows the normal picture on top while you edit. The game draws it above when its condition holds.
- **A screen with no picture** uses the group box as its frame and the theme's `screen` colour.
- **The checker** reports a card that points to a missing file, and a card on a screen that is not an image, object, or ui note.
- **Screen notes still hold settings,** such as `title`, `objective`, and the overlay `ui`. A screen that is not on the world canvas falls back to its `ui` note and object `rect` values.

### 7.4 Make assets with AI on a canvas (working now)

**Asset folders.** `game/assets/` has four parts:

| Folder | Holds |
| --- | --- |
| `scenes/` | Hand-placed game art for places, such as the gate pictures and the gate-opening animation. |
| `ui/` | Frame and button art for UI notes. |
| `characters/<name>/legacy/` | Older character art, kept for reference. |
| `generated/<recipe>/` | Everything one recipe card made: the finished files, and its clean originals in `_source/`. The runner owns this folder. |

File names stay unique across the whole vault, so links such as `[[night-guard-talk-01.webp]]` work wherever a file lives.

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
| `composite` | No AI call, free. With several `actor` arrows it makes one picture per actor, `<card>-<actor>.webp`, all with the same placement; `align: true` keys them together (one screen colour, one trim box) so moods and blinks line up exactly. An arrow labelled `room` (a picture of an empty room) and one labelled `actor` (an actor on a green or blue screen) come in. The runner keys the actor off the screen with a colour-difference key, trims them, and pastes them over the room with slightly wrong lighting and hard edges, like a 1990s FMV game. `shot` (`full` or `waist-up`), `height` and `x` (shares of the frame), and `seed` place the actor; `brightness`, `contrast`, `temperature`, `feather` and `shadow` override the seeded look. Crunch applies as for images. | If the `actor` arrow comes from an `animate` card, every frame of that card's clean clip is keyed (one screen colour read from the first frame, one trim box for all frames, so nothing flickers or jumps) and pasted over the still room; the result is a limited animation (`name.webp`, frames, `name.mp4`) with the animate card's frame count and speed and the composite card's crunch and colours. Animate the actor on the green screen, not the finished composite: the room then stays perfectly still, as in the original games.
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

````markdown
---
type: event
on: action ALLOW_ENTRY
effects:
  - flag gate-open
  - sound unlock
---

## Effects
```yaml
- animate: { layer: gate, play: opening, then: open }
```
````

When a note has both `effects` in Properties and an `## Effects` block, the Properties list runs first.

Triggers (`on`):

| Trigger | Fires when |
| --- | --- |
| `start` | the game starts |
| `enter <screen>` / `leave <screen>` | a screen is entered or left |
| `input` | the player sends text, before the model call |
| `action` / `action <ID>` | an NPC action is applied |
| `turn` | every turn ends |
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
| `engine/load.js` | Read `game.bundle.json`. Build lookup tables. |
| `engine/world.js` | The one state object: screen, flags, vars, counters, items, NPC states, memories, history, seed. |
| `engine/conditions.js` | Parse short form. `evaluate(condition, world)`. |
| `engine/effects.js` | Parse short form. `run(effects, world) → events[]`. |
| `engine/events.js` | Find and run events for a trigger, in priority order. |
| `engine/dialogue-tree.js` | Walk `open` and `script` nodes. |
| `engine/decide.js` | Build the context, call the provider, check the answer, pick the fallback. Moved from `game.js` and `jev.js`. |
| `engine/lines.js` | Pick an authored line (today's `dialogue.js`). |
| `engine/detectors.js` | Run detectors and built-in signals. |
| `engine/save.js` | Save and load the world as JSON. |

The core has no DOM, no `fetch`, no timers. The renderer gives it input and plays what it returns.

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

If the provider fails, nothing changes and the player's text stays. This is today's rule.

### 10.3 Play session

`js/engine/session.js` runs a play session: the world, the current screen, open objects, and the Arthur encounter (`js/game.js`) feeding the `conversation-log` and `text-input` slots. The desktop app and the workbench both use it, so what you test is what ships.

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
- **Not yet:** a packaged `.app` / `.exe` file for other people (electron-builder), and shipping the voice model inside the app so the first launch needs no download.

### 10.5 Provider contract

The provider interface stays. The engine builds the action criteria from the `## Criteria` sections, so the Jev server gets the same request shape as now.

```js
provider(context) → { action, confidence, reason, judgments?: { [id]: number } }
```

The mock provider picks the highest-priority action whose `## Mock` condition is true.

## 11. Compiler and checker

Command: `npm run build:game`. It also runs inside `npm run check`. `npm run build:game -- --watch` rebuilds each time you save a note in Obsidian.

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

The checker writes plain notes to `game/_reports/`. You read them in Obsidian. Every item links to the note that has the problem.

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

## 13. Moving Arthur over

Each step keeps the game working. Each step must pass `npm run check` and the Phase 14 parity check (same actions for the same scripted inputs, mock provider).

| Step | Work | Done when |
| --- | --- | --- |
| 1 | Make the `game/` vault with Obsidian settings and `_templates/`. Write a one-time script that turns `data/*.json` into notes. Add the compiler. The old code reads the bundle. | Bundle matches today's JSON. All tests pass. The vault opens in Obsidian with no broken links. |
| 2 | Add `conditions.js` and `effects.js`, with the short-form parser and full tests. | Every key and short form has a test. |
| 3 | Move actions: list, criteria, effects, `available`. Delete `AVAILABLE_ACTIONS`, `ACTION_CRITERIA`, `ACTION_STATE_CHANGES`, and the body of `getAvailableActions()`. | Parity check passes. Jev request body is the same. |
| 4 | Move detectors and profiles. | `character.js` and the regex constants are gone. |
| 5 | Move endings and limits to event and outcome notes. Delete `resolveTerminalOutcome()`. | All five outcomes are reached by the existing tests. |
| 6 | Add Canvas trees. Move the fake ID and company call into `script` nodes. | `presentFakeId()` and `resolveCompanyVerification()` are gone. |
| 7 | Move screens and hotspots. `index.html` keeps only the shell. | Gate and tower screens come from notes. |
| 8 | Reports in `_reports/` and `--watch`. | A broken link shows in `_reports/check.md` within 2 seconds of saving. |
| 9 | Workbench: hotspot tool. | Moving a hotspot changes only the `## Hotspots` block. Git diff shows only that. |
| 10 | Workbench: play and replay, with Open in Obsidian links. | Can replay a real playtest log and jump to each rule's note. |
| 11 | **Proof:** add a second NPC at Guard Tower 04 with notes and a canvas only. | No new `.js` file and no change to engine code. |

Step 11 is the real test of this spec.

## 14. Open questions

1. **Short form limits.** The short form covers most rules. Should `any` also get a short form (for example `a | b`)? This spec says no, to keep the grammar small. Use a rule block for `any`.
2. **Mock provider.** Move all its rules into `## Mock` sections, or keep the mock as code? Data is better for new NPCs. Code is fine if the mock is only a test tool.
3. **Shared actions.** This spec puts actions under each character. A shared action (for example `WARN_PLAYER` for all guards) may come later with an `extends` property.
4. **Obsidian plugin, later.** A plugin could show checker errors inside Obsidian and add the hotspot tool as a view. Build it only if the workbench feels slow to use. It is not needed for version 1.
5. **Dataview.** The community plugin Dataview could show live tables in the vault. The `_reports/` notes cover the same need without a plugin, so it stays optional.
