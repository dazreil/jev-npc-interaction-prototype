# Jev NPC Interaction Prototype Roadmap

## Purpose

Build a small browser-based text game that tests whether a decision model can make a hand-authored NPC feel reactive and autonomous.

The prototype has one scene: the player is outside a closed warehouse at night and must convince Arthur, the security guard, to let them inside. The player may type anything. Arthur's dialogue and possible actions are authored in advance; the decision provider only selects a valid action.

## Product Rules

These constraints apply throughout the project:

- The decision provider never writes Arthur's dialogue.
- Every spoken response comes from authored JSON.
- The provider may select only from actions supplied by the game.
- Invalid provider output is rejected and replaced with a safe fallback.
- Personality, emotional state, goals, memories, world state, and recent conversation can affect Arthur's decisions.
- Game state, UI rendering, dialogue selection, and provider integration remain separate.
- The prototype stays small, readable, and framework-free.
- Jev endpoints or SDK methods are never invented. Real integration begins only from verified documentation and credentials.

## Proposed Project Structure

```text
/
├── index.html
├── styles.css
├── README.md
├── ROADMAP.md
├── data/
│   ├── arthur.json
│   └── dialogue.json
└── js/
    ├── app.js
    ├── game.js
    ├── npc.js
    ├── dialogue.js
    └── providers/
        ├── mock.js
        └── jev.js
```

The structure may be simplified during implementation if two modules have no meaningful independent responsibility.

## Phase 0 — Project Skeleton

**Status:** Complete and verified on 19 September 2026.

Create the smallest local browser application that can load JavaScript modules and JSON data.

### Deliverables

- Semantic `index.html` with conversation and debug-panel regions.
- Base atmospheric styling for a warehouse entrance at night.
- ES module entry point.
- Minimal local development-server instructions.
- Arthur's personality, initial state, and goals in `data/arthur.json`.
- Authored action dialogue in `data/dialogue.json`.

### Acceptance Checks

- The application loads without console errors through a local server.
- Arthur's data is fetched from JSON rather than embedded in UI code.
- State values are represented on a 0–100 scale.
- Every initial action has at least a neutral authored line.

## Phase 1 — Mock-Provider Vertical Slice

**Status:** Complete and verified on 19 September 2026.

Implement one complete interaction loop before expanding the scenario:

```text
Player input
  → build decision context
  → mock provider selects a valid action
  → choose authored emotional variant
  → display response
  → apply state changes
  → update history and memory
  → refresh debug panel
```

### Deliverables

- Free-text input submitted with Enter or a button.
- Generic asynchronous provider interface:

  ```javascript
  async function chooseNpcAction(context, availableActions)
  ```

- Decision context containing:
  - Arthur's personality, state, and goals.
  - Warehouse world state.
  - Bounded memories.
  - A bounded recent-conversation window.
  - The player's latest input.
  - The actions currently available.
- Mock provider that interprets useful categories such as politeness, questions, authority claims, evidence, contradiction, bribery, persistence, and threats.
- Structured provider result with `action`, `confidence`, and developer-facing `reason`.
- Validation that guarantees the returned action is currently available.
- Deterministic tone selection:
  - `hostile` when irritation is greater than 70.
  - `irritated` when irritation is greater than 40.
  - `friendly` when trust is greater than 65.
  - `neutral` otherwise.
- State updates clamped to the 0–100 range.
- Live debug panel showing Arthur's state, current goal, last action, confidence, reason, and memories.
- Reset control that restores the initial scenario.

### Initial Action Set

- `ANSWER_QUESTION`
- `REFUSE_ENTRY`
- `ASK_FOR_REASON`
- `ASK_FOR_PROOF`
- `ALLOW_ENTRY`
- `WARN_PLAYER`
- `DEESCALATE_THREAT`
- `THREATEN_PLAYER`
- `SHOW_SYMPATHY`
- `BECOME_SUSPICIOUS`
- `REPAIR_CONVERSATION`
- `END_CONVERSATION`

### Acceptance Checks

- A player can complete at least five consecutive exchanges without refreshing.
- The debug panel visibly updates after each exchange.
- Arthur reacts differently to a polite request, an unsupported authority claim, useful evidence, repeated pressure, and a threat.
- Recent history can change a later decision; the same sentence need not produce the same result in a different state.
- Provider reasoning appears only in the debug panel and never as Arthur's dialogue.
- An invalid mock result triggers a safe authored fallback.
- No provider-generated text is displayed in the conversation.

## Phase 2 — Agency, Memory, and Outcome Tuning

**Status:** Complete and verified on 19 September 2026.

Make the mock experience strong enough to evaluate the interaction model rather than only its wiring.

### Deliverables

- Simple bounded memory store with fact, importance, and optional tags.
- Memory rules for claims, useful facts, threats, contradictions, and detected lies.
- A clear distinction between recent conversation and longer-lived memories.
- Action availability rules based on state and terminal conditions.
- State transitions associated with interpreted player intent and/or Arthur's selected action.
- Several authored variants for common actions and emotional tones.
- Success flow for `ALLOW_ENTRY`:

  ```text
  Arthur unlocks the warehouse door.

  YOU ARE INSIDE.
  ```

- Failure flow for `END_CONVERSATION`, after which input is disabled until reset.
- Multiple routes to success, such as credible authority, a convincing emergency, earned trust, or another authored route discovered during tuning.

### Acceptance Checks

- At least three meaningfully different conversational routes can reach `ALLOW_ENTRY`.
- Sustained hostility or repeated contradiction can reach `END_CONVERSATION`.
- A previously stored important fact affects a later action.
- Arthur sometimes pursues his own goal by demanding proof, warning the player, refusing to answer, or ending the exchange.
- Memory and history limits prevent context from growing indefinitely.
- Reset clears all transient state and produces a repeatable starting condition.

## Phase 3 — Developer Inspection Tools

**Status:** Complete and verified on 19 September 2026.

Expose enough internal information to understand and tune each decision.

### Deliverables

- Provider selector with `Mock` and `Jev` options.
- Expandable view of the exact context sent to the provider.
- Expandable view of the provider's raw structured response.
- Clear indication when validation replaced an invalid response with a fallback.
- Optional turn counter and memory-capacity indicator.

### Acceptance Checks

- A developer can explain why an action occurred using only the visible debug information.
- Context and raw response views update every turn.
- Debug output cannot be confused with Arthur's spoken dialogue.
- Selecting an unavailable provider fails clearly and leaves the mock provider usable.

## Phase 4 — Jev Provider Integration

**Status:** Complete and verified with the live TypeSafe API on 19 September 2026.

Connect Jev only after the mock-driven game loop and provider contract are stable.

### Preconditions

- Current Jev documentation or API access is available.
- Authentication and browser/server security requirements are understood.
- The expected structured-output mechanism is documented.
- It is clear whether a tiny local proxy is required to protect credentials or satisfy browser restrictions.

### Deliverables

- Jev-specific implementation isolated in `js/providers/jev.js`.
- A request that asks Jev to select one supplied action using the complete decision context.
- Strict parsing and validation of the structured response.
- Timeouts and readable error states.
- Safe fallback to an authored action when Jev is unavailable or returns invalid data.
- Configuration instructions that do not commit secrets.
- Provider switching without changes to game logic or UI logic.

### Acceptance Checks

- The game can switch between Mock and Jev through configuration or the debug control.
- Jev returns only structured decision data; its output is never used as dialogue.
- Removing network access still leaves the complete mock experience playable.
- Malformed, unknown, or unavailable actions cannot escape validation.
- Credentials are not embedded in client-side source or committed files.

## Phase 5 — Evaluation and Polish

**Status:** Complete and verified with Mock and live Jev playtests on 19 September 2026.

Use structured play sessions to decide whether AI-routed authored dialogue improves the NPC experience.

The recorded evaluation passed all 20 core provider/scenario checks and both failure-handling checks. Mock reached all eleven authored actions. On five unfamiliar paraphrase probes, Jev selected the intended action in all five while Mock missed all five. The firearm scenario now produces a calm authored de-escalation line in both providers before any harder escalation, and direct questions about Arthur's name receive a direct authored answer. The current recommendation is to retain Jev as the optional intelligent provider and Mock as the offline fallback. See `PLAYTEST_REPORT.md` for the full transcript.

### Evaluation Questions

- Does Arthur appear to have his own priorities?
- Do prior claims and behaviour visibly influence later decisions?
- Can players recover from suspicion through credible actions?
- Do multiple approaches work without feeling like a single hidden password?
- Does authored dialogue remain coherent when actions are selected dynamically?
- Are surprising decisions understandable from the debug panel?
- Does Jev make better decisions than the mock provider often enough to justify the integration?

### Suggested Test Scenarios

1. Polite visitor with no evidence.
2. Head-office claim followed by credible proof.
3. Boiler emergency with useful technical detail.
4. Contradictory story across several turns.
5. Bribe attempt.
6. Direct threat against a courageous Arthur.
7. Repeated pestering after a warning.
8. Sympathy-based appeal followed by cooperation.
9. Provider returns an invalid action.
10. Provider times out or is offline.

### Completion Criteria

- All twelve authored actions are reachable in an appropriate situation.
- Success and failure states work and lock further input until reset.
- State, history, and memory behaviour remain bounded and inspectable.
- Mock and Jev providers satisfy the same interface.
- A short playtest log records successful routes, failure routes, confusing decisions, and dialogue gaps.
- The team can answer the experiment's central question with evidence from playtesting.

## Phase 6 — Repair and Recovery

**Status:** Complete and verified with Mock and live Jev playtests on 19 September 2026.

Give Arthur a deliberate recovery route after the player damages trust. An apology or honest clarification can lower suspicion and irritation, but it does not erase the earlier memory; it marks that damage as repaired and asks the player to rebuild the case with a clear purpose and credible proof.

### Deliverables

- `REPAIR_CONVERSATION` as a structured action available to both providers.
- Mock recognition for apologies, remorse, and honest clarification after hostility, threats, bribes, lies, or contradictions.
- Jev criteria that distinguish a repair attempt from an ordinary polite request.
- Authored dialogue that accepts the repair cautiously and asks the player to start again.
- Repaired serious memories no longer block a later proof-based `ALLOW_ENTRY` route.
- A multi-turn Mock and Jev playtest covering contradiction → repair → proof → entry.

### Acceptance Checks

- A player can recover from a contradiction without resetting the scenario.
- Arthur's suspicion and irritation decrease after a sincere repair attempt.
- The original contradiction remains inspectable in memory.
- Credible evidence after the repair can reach `ALLOW_ENTRY`.
- Repeating hostility still follows the warning and end-conversation path.

## Phase 7 — Branching Authored Dialogue

**Status:** Complete and verified with the full Mock and live Jev playtests on 19 September 2026.

Expand authored variety by composing short approved phrases rather than duplicating every complete response. The provider still chooses only an action; the dialogue system selects a deterministic template, phrase slots, and optional branch from the current conversation context.

### Deliverables

- Template entries with named phrase slots and deterministic variant selection.
- Branch conditions for tone, remembered tags, previous Arthur actions, and authored input fragments.
- Backwards compatibility with existing string and string-array dialogue entries.
- Authored template branches for proof requests and repair responses.
- Unit coverage for slot composition and branch selection.

### Acceptance Checks

- A single authored entry can produce multiple coherent wording combinations.
- A remembered repair or previous suspicious action can change a later authored line.
- Missing or unknown slots fail clearly instead of displaying unresolved placeholders.
- Mock and Jev playtests still pass without provider-generated dialogue.

## Phase 8 — Content and Evaluation Pass

**Status:** Complete and verified with Mock and live Jev automated playtests on 20 September 2026. Blind human sessions remain an external follow-up using `MANUAL_PLAYTEST.md`.

Expand the most common authored responses, verify the complete structured action set with both providers, and make content quality and Jev uncertainty visible in the evaluation report.

### Deliverables

- Compositional variants for refusal, reason, warning, sympathy, suspicion, proof, and repair dialogue.
- A dialogue linter that rejects missing actions, unknown variants, broken template slots, invalid conditions, and empty authored text.
- Content statistics covering authored fragments, conditional branches, and possible rendered lines.
- Dedicated scenarios for `THREATEN_PLAYER` after de-escalation and `SHOW_SYMPATHY` without granting access.
- An insult → apology → proof → entry recovery scenario.
- Confidence and top-two probability-margin summaries for Jev decisions.
- A manual blind-playtest guide and rating sheet.

### Acceptance Checks

- `npm run check` passes the unit suite and dialogue lint.
- Both Mock and Jev reach all twelve available actions in the comparison suite.
- All core scenarios pass for both providers.
- The report identifies low-confidence decisions without treating confidence alone as failure.
- No missing dialogue or unresolved template slots appear in the report.
- Human feedback has a repeatable collection format for the next external playtest session.

## Retro CD-ROM Vertical Slice

Phases 9–15 convert the completed simulation into a polished, self-contained encounter inspired by mid-1990s FMV games. The detailed visual, audio, interaction, and architectural direction is recorded in [RETRO_CDROM_DESIGN_SPEC.md](RETRO_CDROM_DESIGN_SPEC.md).

The conversion preserves the core experiment: providers select one bounded action, Arthur speaks only authored dialogue, and deterministic game rules own state, memory, and consequences. The presentation should feel like a lost 1995 security-terminal scene without hiding the existing diagnostic evidence from developers.

The pre-conversion baseline is commit `de767cf`.

## Phase 9 — Presentation Boundary and Regression Lock

**Status:** Complete and verified on 20 September 2026.

Protect the validated simulation before replacing its frontend. Introduce a renderer-facing performance result and a lifecycle controller without changing provider requests, Jev parsing, dialogue selection, memory, or state consequences.

### Deliverables

- An `npcPerformance` result containing the selected action, tone, authored line, portrait cue, and timing defaults.
- Explicit lifecycle states for idle, player input, provider decision, reaction-in, speech, reaction-out, awaiting input, and ending.
- A performance controller that owns the existing 920 ms speaking-animation timer.
- Skip and failure paths that complete subtitles and apply each turn's state exactly once.
- Unit coverage for performance mapping, legal lifecycle transitions, skipping, and speech failure.
- A rendering-disabled regression harness that compares decisions, dialogue, and final state with the pre-conversion behaviour.

### Acceptance Checks

- `npm run check` passes.
- Existing Mock and Jev scenarios produce the same actions, dialogue, memories, and final state when rendering is disabled.
- A skipped or failed performance cannot apply state twice or leave input permanently disabled.

### Verification

- The full automated suite passes with 32 tests plus dialogue lint.
- A lifecycle-driven head-office route matches the rendering-disabled route turn for turn and ends with identical snapshots.
- Focused tests cover deterministic portrait cues, legal phase order, skip, presentation failure, terminal endings, and state-once behaviour.
- Browser verification confirms that input locks during the existing 920 ms speaking performance, unlocks afterward, and reset safely cancels an active performance.

## Phase 10 — 4:3 CD-ROM Interface Shell

**Status:** Complete and verified on 20 September 2026.

Replace the chat layout with a fixed logical 640×480 security terminal that scales responsively with letterboxing and integer scaling where practical.

### Deliverables

- An in-world industrial terminal shell with a 160×120 or 192×144 Arthur viewport.
- A subtitle area, compact transcript, free-text input, provider status, reset control, and accessibility controls.
- Developer diagnostics moved into an explicit modal or drawer with a keyboard shortcut.
- Nearest-neighbour image treatment, limited palette, bevels, warning stripes, and restrained optional scanline/noise effects.
- Keyboard navigation, visible focus, semantic controls, and reduced-motion support.

### Acceptance Checks

- The encounter remains playable at 100%, 2×, and responsive window sizes.
- The Arthur image, subtitles, input, and status remain readable without scrolling the logical stage.
- All current diagnostics remain available without dominating the player view.

### Verification

- The shell renders from a 640×480 logical stage, fills the available viewport continuously, caps at a crisp 2× scale, and proportionally scales down for smaller viewports.
- Browser playthrough confirms captions, compact transcript, input locking, Arthur's speaking fallback, and the entry-granted ending inside the new shell.
- The F2 developer dialog retains emotional state, decision reasoning, memory, exact context, and raw provider response, with focus restored when it closes.
- The visual-effects control, semantic labels, visible focus, and reduced-motion path remain available.
- The full automated suite passes with 34 tests plus dialogue lint.

## Phase 11 — Arthur Performance System

**Status:** Complete and verified on 20 September 2026. The blind perception check is scheduled with the wider human evaluation in Phase 14.

Promote Arthur from a chat avatar to the main performance surface using deterministic, frame-controlled animation.

### Deliverables

- Low-resolution, colour-reduced versions of the existing portrait and mouth frames.
- Idle, blink, listening, and talk A/B/C animation from current assets.
- Suspicious, irritated, hostile, friendly, afraid, dismissive, and entry-granted portrait states.
- Deterministic action-and-tone mapping for reaction-in, speaking, and reaction-out sequences.
- A neutral fallback for missing or invalid performance metadata.
- Authored frame drops and glitches used sparingly as part of the period style.

### Acceptance Checks

- Every one of the twelve actions resolves to a valid performance sequence.
- Missing art falls back safely to the neutral portrait.
- Blind testers can identify at least four broad Arthur attitudes without opening diagnostics.

### Verification

- All twelve actions resolve through deterministic action-and-tone mapping to a shipped portrait cue; invalid cues fall back to Arthur's neutral portrait.
- The browser plays listening while the player types, cycles the four mouth poses at eight frames per second, and restores the mapped reaction portrait after speech.
- Live Mock playthroughs verified the afraid weapon-de-escalation response and the persistent entry-granted ending, including the open-door terminal state.
- Blink timing, reduced-motion behaviour, sparse authored glitches, frame sequencing, and neutral fallback are covered by focused tests.
- Browser console inspection is clean, and the full automated suite passes with 38 tests plus dialogue lint covering 12 actions, 143 fragments, 13 templates, 6 branches, and 162 possible lines.

## Phase 12 — Speech and Period Audio

**Status:** Complete and verified on 20 September 2026. Browser and operating-system voice comparisons remain part of Phase 14.

Add replaceable speech and sound systems while keeping captions authoritative and preventing audio failure from blocking the encounter.

### Deliverables

- A speech-adapter interface with browser Web Speech API support first and room for a later eSpeak/WASM adapter.
- Per-line or per-tone rate, pitch, delay, and voice-preset metadata.
- Talk animation driven by actual speech duration, with a deterministic timing fallback.
- Subtitles enabled by default, plus mute, volume, replay, and speech-skip controls.
- Optional Web Audio intercom processing with light band-limiting, compression, and noise.
- Low-key ambience, relay/interface sounds, a warning sting, and an entry-unlock sound.

### Acceptance Checks

- Every line remains understandable with captions alone.
- Speech cancellation, an unavailable voice, or audio-context failure never blocks input or loses a completed turn.
- Mouth animation and captions start and finish with the active performance lifecycle.

### Verification

- A replaceable browser speech adapter now uses `SpeechSynthesisUtterance` start, end, error, and cancellation events to control speaking duration when the API is available.
- Neutral, friendly, irritated, hostile, de-escalation, entry, and ending deliveries resolve deterministic rate, pitch, pre-delay, and audio-preset metadata without changing authored dialogue.
- Unsupported or muted speech uses cancellable deterministic timing, leaves complete captions visible, and returns input safely after normal playback or skip.
- Replay, mute, volume, and skip controls are keyboard-accessible; the voice indicator distinguishes audible browser speech from silent fallback animation.
- Optional Web Audio provides a low warehouse hum and authored interface, relay, warning, and door-unlock cues through a band-limited compressed effects chain. Browser media failures remain silent and non-blocking.
- Browser verification covered responsive layout, the single incoming-message display, the restored shadowed player endpoint, fallback playback, skip, replay, mute, volume, focusable controls, and a clean console. The test browser exposed neither Web Speech nor Web Audio, so real voice and device-specific sound quality remain explicit Phase 14 checks.
- The full automated suite passes with 48 tests plus dialogue lint covering 4 character profiles, 12 actions, 204 fragments, 13 templates, 7 branches, and 220 possible lines. `ASK_FOR_REASON` is now a one-time prompt per conversational attempt, preventing Arthur from looping through reworded versions of the same question; a deliberate repair can reopen it. Each reset selects a fixed Arthur profile with distinct temperament, trust threshold, dialogue, and voice delivery.

## Phase 13 — Outcomes and Authored Performance Pass

**Status:** Planned.

Give the complete encounter a strong opening and four visibly distinct endings while adding performance metadata to the authored content incrementally.

### Deliverables

- A short connection/boot sequence that establishes the security-terminal fiction.
- Four presentation endings: entry granted, refused, expelled, and locked out.
- Backwards-compatible simulation outcomes so existing rules and tests remain useful.
- Optional dialogue metadata for portrait cue, speech preset, timing, and sound effects, with safe defaults for all 220 possible lines.
- A repetition and tone audit covering common routes and terminal responses.

### Acceptance Checks

- All four outcomes are visually and audibly distinct.
- At least three established entry strategies still reach success.
- Every authored line resolves to a valid performance without requiring duplicated dialogue text.

## Phase 14 — Provider and Human Evaluation

**Status:** Planned.

Measure whether the new presentation improves Arthur's legibility and dramatic presence without changing the structured-decision behaviour validated in Phase 8.

### Deliverables

- A complete Mock and live Jev rerun with action parity compared against the pre-conversion baseline.
- Blind sessions based on `MANUAL_PLAYTEST.md`.
- Evaluation prompts for emotional legibility, voice intelligibility, waiting time, retro authenticity, and Arthur's apparent agency.
- Browser, operating-system, and voice-engine notes for speech differences.
- Timing adjustments made before any proposed decision-rule changes.

### Acceptance Checks

- Automated checks and provider comparison remain green.
- Players can explain Arthur's current attitude and describe one way his memory affected the exchange without seeing diagnostics.
- Reported confusion is separated into presentation, dialogue-content, and decision-quality findings.

## Phase 15 — Release Polish

**Status:** Planned.

Prepare the vertical slice for a new player to launch, understand, complete, and inspect across desktop browsers.

### Deliverables

- Final palette, dithering, image compression, and restrained screen effects.
- Boot, loading, connection, ending, and credits presentation.
- A complete keyboard, focus, captions, mute, replay, and reduced-motion pass.
- Verification in current Chrome, Edge, Firefox, and Safari.
- Preloading limited to assets needed by the immediate encounter state.
- Simple deployment documentation for Mock-only hosting and server-backed Jev hosting.

### Acceptance Checks

- A new player can start and complete the encounter without developer guidance.
- A developer can still inspect the decision context, provider result, state, memory, and performance mapping.
- The release runs without a frontend framework or unnecessary deployment infrastructure.

## Implementation Order

The first eight phases established and evaluated the simulation. Continue in this order so every presentation stage remains runnable:

1. Lock the pre-conversion regression baseline and add the performance boundary.
2. Build the 640×480 terminal shell around the unchanged game loop.
3. Replace the GIF timer with frame-controlled Arthur performances.
4. Add speech, captions timing, and period audio behind adapters.
5. Author emotional portrait states and the four ending presentations.
6. Rerun provider comparisons and conduct blind human sessions.
7. Complete accessibility, browser verification, asset optimization, and release documentation.

## Out of Scope

- Generated NPC dialogue.
- Multiple NPCs or locations.
- A general dialogue editor or RPG engine.
- Accounts, databases, or cross-session saves.
- Production hosting and deployment infrastructure.
- Voice input, cloud voice services, or a large prerecorded voice library.
- Complex natural-language simulation inside game logic.
- Fine-tuning or training a model.
- Full generated video, multiple camera scenes, inventory systems, or quests.
- A frontend-framework migration or mobile-first redesign.

## Immediate Next Milestone

Implement Phase 13: add the connection sequence, four presentation endings, and optional per-line performance metadata while preserving every established entry route.
