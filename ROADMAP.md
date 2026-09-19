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

## Implementation Order

Work in this order to keep every stage runnable:

1. Project skeleton and JSON loading.
2. Conversation input and rendering.
3. Decision-context builder.
4. Mock provider and action validation.
5. Authored dialogue and deterministic tone selection.
6. State updates and clamping.
7. Debug panel and reset.
8. Memory, history bounds, and outcome tuning.
9. Raw context/response inspection.
10. Verified Jev integration.
11. Structured playtesting and final tuning.

## Out of Scope

- Generated NPC dialogue.
- Multiple NPCs or locations.
- A general dialogue editor or RPG engine.
- Accounts, databases, or cross-session saves.
- Production hosting and deployment infrastructure.
- Voice input or speech synthesis.
- Complex natural-language simulation inside game logic.
- Fine-tuning or training a model.

## Immediate Next Milestone

The automated prototype roadmap is complete. The next useful evidence should come from blind sessions using `MANUAL_PLAYTEST.md`; after that, choose between tuning the recorded weak spots, adding another NPC scenario, or preparing a deployable build.
