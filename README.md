# Jev NPC Interaction Prototype

A small browser-based text game that explores whether a decision model can make hand-authored NPC dialogue feel reactive and autonomous.

Arthur's spoken lines all come from `data/dialogue.json`. The Mock and Jev providers select only a structured action and return developer-facing decision metadata. The game validates the action before selecting an authored line.

The player experience runs inside a responsive 640×480 security terminal inspired by mid-1990s CD-ROM interfaces. A short hardline boot sequence opens the encounter; Arthur occupies the gatehouse feed while a shadowed external feed represents the player. Each participant has one current message, avoiding a duplicated subtitle-and-transcript view, and developer telemetry remains available through the **Developer** control or <kbd>F2</kbd>. Browser speech, replay, mute, volume, skip, ambience, and authored interface sounds sit behind replaceable presentation adapters; the current incoming message and deterministic timing remain available when browser media APIs are missing.

## Run locally

The complete offline Mock experience needs no credentials. Start it with:

```bash
npm run start:mock
```

Then open [http://localhost:5173](http://localhost:5173).

Do not open `index.html` directly from Finder. Safari and other browsers block the module and JSON requests made from a `file://` address. The page detects this case and displays the server command instead of remaining on the connection placeholder.

To use Jev, copy `.env.example` to `.env`, set `TYPESAFE_API_KEY`, and run:

```bash
npm start
```

The Node server keeps the credential out of browser source and forwards only structured decision requests to TypeSafe. `.env` is gitignored. No packages or build step are required.

Run the unit tests and dialogue-content linter together with:

```bash
npm run check
```

The linter verifies action coverage, dialogue variants, template slots, supported branch conditions, and unresolved placeholders before a playtest reaches the browser.

With the Jev server running in another terminal, rerun the complete provider comparison and regenerate the report with:

```bash
npm run playtest
```

The resulting Mock-versus-Jev transcript, complete action coverage, confidence review, dialogue-content audit, failure checks, and recommendation are recorded in `PLAYTEST_REPORT.md`. Use `MANUAL_PLAYTEST.md` to collect blind player feedback that automated scenarios cannot provide.

## Interaction routes

- Make a polite request and explain why you need access.
- Claim to be from head office, then provide work identification.
- Report an emergency, then provide specific technical details.
- Present a delivery claim, then provide a manifest.
- Earn Arthur's trust through sustained respectful conversation before asking for an exception.
- Change your stated reason for being there and watch Arthur remember the contradiction.
- Acknowledge a contradiction or hostile moment, repair the conversation, then return to a proof-based route.
- Ask Arthur a question.
- Offer a bribe.
- Insult or threaten Arthur repeatedly.
- Threaten Arthur with a gun or other weapon and enter a calm, authored de-escalation exchange.
- Type `[[invalid]]` to make the mock provider deliberately return an invalid action and verify the safe fallback in the debug panel.

The expandable debug views show the exact decision context and raw provider response. Provider reasons are diagnostic data only and are never displayed as Arthur's dialogue.

The encounter has four terminal presentations. Credible proof or earned trust grants entry; choosing to leave records a refusal; repeated personal hostility gets the player expelled; threats or forced-entry behaviour trigger a full security lockout. The simulation retains its original `active`, `success`, and `failure` status values for provider and test compatibility while exposing the more precise outcome to the performance layer.

Arthur keeps up to eight important memories separately from the latest six conversation exchanges. On each reset his form of address selects a complete character profile that remains fixed throughout the encounter:

| Address | Arthur's character |
| --- | --- |
| `pal` | Fast-talking Italian American; impatient with evasiveness and difficult to intimidate. |
| `sir` | Formal New England rule-keeper; precise, suspicious, and strongly bound to procedure. |
| `mate` | Talkative Irish American; patient, sympathetic, and inclined to hear the player out. |
| `friend` | Terse Eastern European English learner; reserved, direct, and economical with words. |

The profile changes Arthur's starting mood, personality values, trust threshold, authored phrasing, speech rate, pitch, and pre-delay. Jev receives the same profile in its structured decision context. Claims record a purpose, contradictions and admitted lies sharply increase suspicion, and unrepaired serious memories can remove `ALLOW_ENTRY` from the actions sent to the provider. Arthur asks for the player's purpose once per conversational attempt; if the player stays vague, he holds the boundary instead of asking a reworded version of the same question. A sincere apology or clarification selects `REPAIR_CONVERSATION`, lowers tension, and marks the earlier damage as repaired so a later credible proof can reopen entry. Message effort also nudges mood: terse replies add a small amount of irritation, while considered explanations can slightly improve trust. A first weapon threat selects `DEESCALATE_THREAT`, giving Arthur a calm response that asks what the player needs without provoking them.

## Authored dialogue branches

Dialogue can stay authored without requiring one complete string for every situation. A tone entry may use a template with named slots, each slot containing a short list of approved phrases. The same entry can also define branches selected from a small set of facts such as a remembered tag or Arthur's previous action:

```json
{
  "template": "{opening} {request}",
  "slots": {
    "opening": ["I hear you.", "All right."],
    "request": ["show me the work order.", "give me a reference I can check."]
  },
  "branches": [
    {
      "when": { "memoryTag": "repair" },
      "template": "We can continue. {request}",
      "slots": { "request": ["show me what supports your story."] }
    }
  ]
}
```

The game combines only these authored phrases and still displays one ordinary Arthur line. Variant selection is deterministic, so playtests remain repeatable while the slots create many small wording changes.

## Provider inspection

The developer panel identifies the provider used for the latest attempt and whether its result was accepted, replaced by a safe fallback, or failed before selecting an action. Both the exact decision context and the structured response received by the game are available in expandable JSON views.

Selecting Jev sends the same decision context to the local server, where a TypeSafe `choice` question is built from only the actions currently available to Arthur. Jev's selected action, probability distribution, confidence, model, and token usage are inspectable in the raw response view. State changes and memory records remain deterministic code-side effects.

If the server, network, or TypeSafe API fails, no turn or state change is applied, the player's text is preserved, and the selector returns to Mock so the same message can be retried.

## Architecture

- `js/game.js` owns the interaction loop, bounded history and memory, state-dependent action availability, validation, and terminal states.
- `js/providers/mock.js` interprets player intent and selects a structured action.
- `js/dialogue.js` selects an authored line for the chosen action and deterministic emotional tone.
- `js/dialogue-lint.js` validates every authored line, template slot, and conditional branch.
- `js/npc.js` owns NPC state helpers and clamping.
- `js/layout.js` keeps the 640×480 terminal proportional, fills the available viewport, and caps enlargement at 2×.
- `js/performance.js` maps committed turns to renderer metadata and controls the idle, typing, decision, reaction, speaking, and ending lifecycle.
- `js/portrait.js` maps performance phases to deterministic idle, blink, listening, mouth, and emotional portrait frames with a neutral fallback.
- `js/speech.js` supplies deterministic delivery profiles, the replaceable Web Speech adapter, actual speech-event timing, replay, cancellation, and silent fallback timing.
- `js/audio.js` owns optional Web Audio ambience and the band-limited, compressed relay, warning, denial, lockdown, interface, and door-unlock sounds.
- `js/app.js` renders the UI and translates browser events into game turns.
- `js/providers/jev.js` builds and validates the Jev `choice` request and maps the selected action to deterministic game effects, including the repair path.
- `server.mjs` serves the game and protects the TypeSafe credential behind the same-origin Jev endpoint.
- `scripts/run-playtests.mjs` runs the repeatable provider comparison and writes `PLAYTEST_REPORT.md`.
- `scripts/lint-dialogue.mjs` audits dialogue content and reports the number of possible rendered lines.
- `assets/arthur-portrait.jpg` is the generated, web-sized portrait used for Arthur's left-side chat avatar.
- `assets/arthur-speech/frame-1.jpg` through `frame-4.jpg` are sequenced at eight frames per second while Arthur speaks.
- `assets/arthur-reactions/` contains identity-matched blink, listening, emotional, and entry-granted portraits; the browser rasterizes them to a 96×72 source surface before enlarging them with nearest-neighbour rendering.
- `assets/arthur-speaking.gif` is retained as a legacy source artifact and is no longer used by the interface.
- `assets/player-shadow.jpg` is the anonymous player avatar displayed on the opposite side of the chat.
- `assets/fonts/VT323-Regular.ttf` is the single bundled monospace pixel font used across the complete player and developer interface under the SIL Open Font License in `assets/fonts/OFL.txt`.

See [ROADMAP.md](ROADMAP.md) for milestones and acceptance criteria. Phases 9–15 cover the planned retro CD-ROM vertical-slice conversion; [RETRO_CDROM_DESIGN_SPEC.md](RETRO_CDROM_DESIGN_SPEC.md) records the full visual, audio, interaction, and evaluation direction.
