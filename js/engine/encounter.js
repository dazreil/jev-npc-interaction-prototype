// One encounter with a character, run from the vault (ENGINE_SPEC.md
// sections 5, 9 and 10.2). Everything about the character comes from notes:
// its profiles, its actions and when they are allowed, what they change and
// what Arthur remembers, the lines, the dialogue tree (the ID card and the
// company call), and the events that end the talk. The code here is the
// engine: it knows how to run a turn, not what Arthur does.

import { resolveDialoguePerformance, selectDialogue } from "../dialogue.js";
import { createNpcPerformance } from "../performance.js";
import { deriveConversationSignals, hasUnresolvedSuspicion, inferPurpose, resolvePendingRequest } from "../conversation-signals.js";
import { STATE_KEYS, applyStateChanges, assessMessageEffort, clamp, cloneNpc } from "../npc.js";
import { buildCharacter } from "./character-data.js";
import { evaluate } from "./conditions.js";
import { applyEffects, parseEffect } from "./effects.js";

/** How far to walk an action's variants looking for one not yet said. */
export const MAX_VARIANT_WALK = 8;
const ADDRESS_TOKEN = "[[address]]";
const NAME_TOKEN = "[[playerName]]";

// Built-in signal: a name the player gives ("call me Sam").
const PLAYER_NAME_PATTERN = /\b(?:my name is|call me|i am|i'm|im)\s+([a-z][a-z'-]{1,24})\b/i;
const NON_NAME_INTRODUCTIONS = new Set([
  "a", "an", "at", "bringing", "carrying", "delivering", "doing", "fixing", "from", "going", "here",
  "looking", "not", "repairing", "sorry", "the", "trying", "with"
]);

export function extractPlayerName(input = "") {
  const candidate = String(input).match(PLAYER_NAME_PATTERN)?.[1];
  if (!candidate || NON_NAME_INTRODUCTIONS.has(candidate.toLowerCase())) return null;
  if (candidate.toLowerCase().endsWith("ing")) return null;
  return candidate
    .toLowerCase()
    .split(/(['-])/)
    .map((part) => (/^[a-z]/.test(part) ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join("");
}

export class DecisionProviderError extends Error {
  constructor(providerId, message) {
    super(`${providerId} provider failed: ${message}`);
    this.name = "DecisionProviderError";
    this.providerId = providerId;
  }
}

function validateStateChanges(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return STATE_KEYS.reduce((changes, key) => {
    const delta = Number(value[key]);
    if (Number.isFinite(delta)) changes[key] = clamp(delta, -25, 25);
    return changes;
  }, {});
}

function validateMemory(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.fact !== "string" || !value.fact.trim()) return null;
  return {
    fact: value.fact.trim().slice(0, 160),
    importance: clamp(Number(value.importance) || 50),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag) => typeof tag === "string").slice(0, 4) : [],
    topic: typeof value.topic === "string" ? value.topic.slice(0, 40) : null,
    value: typeof value.value === "string" ? value.value.slice(0, 60) : null
  };
}

/**
 * Checks a provider's answer. An action that is not available becomes the
 * character's fallback, with no state change and no memory. A provider may
 * bring its own `stateChanges` and `memory` (the Mock does); otherwise the
 * action note's effects and `## Memory` decide them.
 */
export function validateDecision(raw, availableActions, fallbackAction) {
  const answer = raw && typeof raw === "object" ? raw : {};
  const fallbackUsed = !availableActions.includes(answer.action);
  const reason =
    fallbackUsed
      ? "The provider returned an unavailable action, so the safe fallback was used."
      : typeof answer.reason === "string" && answer.reason.trim()
        ? answer.reason.trim().slice(0, 500)
        : "The provider supplied no usable reason.";
  return {
    action: fallbackUsed ? fallbackAction : answer.action,
    confidence: clamp(Number(answer.confidence) || 0, 0, 1),
    reason,
    stateChanges: fallbackUsed ? {} : validateStateChanges(answer.stateChanges),
    memory: fallbackUsed ? null : validateMemory(answer.memory),
    ownsStateChanges: fallbackUsed || "stateChanges" in answer,
    ownsMemory: fallbackUsed || "memory" in answer,
    judgments: answer.judgments && typeof answer.judgments === "object" ? answer.judgments : null,
    fallbackUsed,
    invalidAction: fallbackUsed ? String(answer.action ?? "missing") : null
  };
}

/** Named word patterns from the detectors note. `unless` names a detector that cancels it. */
function compileDetectors(note) {
  const detectors = {};
  for (const [name, block] of Object.entries(note?.blocks ?? {})) {
    if (block?.pattern) detectors[name] = { regex: new RegExp(block.pattern, block.flags ?? "i"), unless: block.unless ?? null };
  }
  const matches = (name, text, seen = new Set()) => {
    const detector = detectors[name];
    if (!detector || seen.has(name)) return false;
    seen.add(name);
    return detector.regex.test(text) && !(detector.unless && matches(detector.unless, text, seen));
  };
  return { names: Object.keys(detectors), matches };
}

/** A scene value: plain, or { when, then, else } worked out from the world. */
function sceneValue(value, view) {
  if (value && typeof value === "object" && !Array.isArray(value) && "when" in value) {
    return evaluate(value.when, view) ? (value.then ?? true) : (value.else ?? false);
  }
  return value;
}

/** First memory rule whose `when` holds, without its `when`. */
function firstMemory(rules, view) {
  const rule = [].concat(rules ?? []).find((item) => evaluate(item.when ?? null, view));
  if (!rule) return null;
  const { when: _when, ...memory } = rule;
  return validateMemory(memory);
}

const SCRIPT_WORDS = new Set(["say", "action", "tone", "cue", "end"]);

export class Encounter {
  /**
   * @param vault the compiled vault (scripts/compile-vault.mjs)
   * @param characterId the character note, such as "Arthur"
   * @param provider (context, availableActions) → { action, confidence, reason, judgments?, stateChanges?, memory? }
   * @param random the first call picks the profile (0..1)
   */
  constructor({ vault, characterId = null, provider, providerId = "mock", random = () => 0 }) {
    this.vault = vault;
    const id = characterId ?? Object.entries(vault.notes).find(([, note]) => note.type === "character")?.[0];
    this.character = buildCharacter(vault, id);
    this.tree = vault.trees?.[this.character.tree] ?? { nodes: {}, edges: [], start: null };
    this.detectors = compileDetectors(Object.values(vault.notes).find((note) => note.type === "detectors"));
    this.events = Object.entries(vault.notes)
      .filter(([, note]) => note.type === "event")
      .map(([eventId, note]) => ({ id: eventId, ...note.props, also: note.blocks["Also needs"] ?? null, memory: note.blocks.Memory ?? null }));
    this.actionsById = Object.fromEntries(this.character.actions.map((action) => [action.id, action]));
    this.provider = provider;
    this.providerId = providerId;
    this.random = random;
    this.reset();
  }

  reset() {
    const { profileIds, profiles, template } = this.character;
    const roll = Number(this.random());
    const normalized = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.999999) : 0;
    this.characterProfile = profiles[profileIds[Math.floor(normalized * profileIds.length)]];
    this.playerAddress = this.characterProfile.address;
    this.npc = cloneNpc(template);
    this.npc.personality = { ...this.npc.personality, ...this.characterProfile.personality };
    this.npc.state = { ...this.npc.state, ...this.characterProfile.initialState };

    const game = Object.values(this.vault.notes).find((note) => note.type === "game");
    const variables = game?.blocks.Variables ?? {};
    // Flags start unset: the encounter reports only the ones it changes.
    this.flag = {};
    this.counter = { ...(variables.counters ?? {}) };
    this.item = Object.fromEntries(
      Object.entries(this.vault.notes)
        .filter(([, note]) => note.type === "item" && note.props.startWith)
        .map(([itemId]) => [itemId, "held"])
    );

    this.playerName = null;
    this.memories = [];
    this.history = [];
    this.turn = 0;
    this.status = "active";
    this.outcome = "active";
    this.node = this.tree.start;
    this.actionUses = new Map();
    this.spokenLines = new Set();
    this.pendingRequest = null;
    this.lastDecision = null;
    this.lastContext = null;
    this.lastRawResponse = null;
    this.lastProviderId = null;
    this.lastProviderError = null;
    this.lastPerformance = null;
    this.debugLog = [];
    this.debugSequence = 0;
  }

  setProvider(provider, providerId) {
    if (typeof provider !== "function") throw new TypeError("A decision provider must be a function.");
    this.provider = provider;
    this.providerId = providerId;
  }

  // ------------------------------------------------------------ the world the rules read

  /** What conditions see: state, flags, counters, items, memories, signals, and this turn. */
  view(extra = {}) {
    const start = this.characterProfile.initialState ?? {};
    const state = this.npc.state;
    return {
      state,
      flag: this.flag,
      counter: this.counter,
      item: this.item,
      memories: this.memories,
      turn: this.turn,
      profile: { id: this.characterProfile.id, trustThreshold: this.characterProfile.trustThreshold },
      lastAction: this.lastDecision?.action ?? null,
      ...extra,
      signal: {
        "unresolved-suspicion": hasUnresolvedSuspicion(this.memories),
        "tension-raised":
          state.suspicion > (Number(start.suspicion) || 0) + 8 || state.irritation > (Number(start.irritation) || 0) + 12,
        ...(extra.signal ?? {})
      }
    };
  }

  detectorsFor(text) {
    return Object.fromEntries(this.detectors.names.map((name) => [name, this.detectors.matches(name, text)]));
  }

  getAvailableActions() {
    if (this.status !== "active") return [];
    const view = this.view();
    return this.character.actions
      .filter((action) => evaluate(action.available ?? null, view) && evaluate(action.alsoNeeds ?? null, view))
      .map((action) => action.id);
  }

  toneFor(state) {
    const view = this.view({ state });
    return this.character.tones.find((row) => evaluate(row.when ?? null, view))?.tone ?? "neutral";
  }

  personalize(line) {
    return String(line).replaceAll(ADDRESS_TOKEN, this.playerAddress);
  }

  getOpeningDialogue() {
    const dialogue = this.character.dialogue;
    return this.personalize(dialogue.profiles?.[this.characterProfile.id]?.opening ?? dialogue.opening);
  }

  /** What the model is told: the character's scene and prompt, from its note. */
  buildDecisionContext(playerInput, introducedPlayerName = null) {
    const messageEffort = assessMessageEffort(playerInput);
    const contextNpc = cloneNpc(this.npc);
    applyStateChanges(contextNpc, messageEffort.stateChanges);
    const view = this.view();
    const context = {
      npc: {
        id: contextNpc.id,
        cognition: structuredClone(contextNpc.cognition ?? null),
        personality: structuredClone(contextNpc.personality),
        state: structuredClone(contextNpc.state),
        goals: structuredClone(contextNpc.goals),
        characterProfile: {
          id: this.characterProfile.id,
          label: this.characterProfile.label,
          decisionStyle: this.characterProfile.decisionStyle
        }
      },
      world: Object.fromEntries(Object.entries(this.character.scene).map(([key, value]) => [key, sceneValue(value, view)])),
      player: { name: introducedPlayerName ?? this.playerName },
      memories: structuredClone(this.memories),
      recentConversation: structuredClone(this.history.slice(-this.character.historyMax)),
      playerInput,
      messageEffort,
      turn: this.turn + 1
    };
    context.conversationSignals = deriveConversationSignals({ ...context, pendingRequest: this.pendingRequest });
    context.availableActions = this.getAvailableActions();
    // For the offline Mock (providers/mock-vault.js): each action's ## Mock rule,
    // and what its conditions can see this turn.
    if (this.character.hasMockRules) {
      context.mockRules = Object.fromEntries(this.character.actions.filter((action) => action.mock).map((action) => [action.id, action.mock]));
      context.mockView = this.view({ detector: this.detectorsFor(playerInput), signal: { purpose: inferPurpose(playerInput) }, turn: this.turn + 1 });
    }
    context.prompt = {
      ...this.character.prompt,
      criteria: Object.fromEntries(context.availableActions.map((id) => [id, this.actionsById[id].criteria])),
      judgments: Object.fromEntries(
        this.character.actions
          .filter((action) => action.judgmentRule?.id)
          .map(({ judgmentRule: { id, instructions, ...criteria } }) => [id, { instructions, criteria }])
      )
    };
    return context;
  }

  // ------------------------------------------------------------ lines and memory

  selectFreshDialogue(action, tone, options) {
    const uses = this.actionUses.get(action) ?? 0;
    this.actionUses.set(action, uses + 1);
    // The profile's own lines first, so he keeps his voice; then the shared ones.
    const sources = [options, { ...options, profileId: "" }];
    const tried = new Set();
    let line = null;
    for (const source of sources) {
      for (let step = 0; step <= MAX_VARIANT_WALK; step += 1) {
        const candidate = selectDialogue(this.character.dialogue, action, tone, uses + step, source);
        if (line === null) line = candidate;
        if (tried.has(candidate)) continue;
        tried.add(candidate);
        if (!this.spokenLines.has(candidate)) {
          this.spokenLines.add(candidate);
          return candidate;
        }
      }
    }
    this.spokenLines.add(line);
    return line;
  }

  addMemory(memory) {
    if (!memory) return;
    const index = this.memories.findIndex((existing) => existing.fact.toLowerCase() === memory.fact.toLowerCase());
    if (index >= 0) {
      const existing = this.memories[index];
      this.memories[index] = {
        ...existing,
        importance: Math.max(existing.importance, memory.importance),
        tags: [...new Set([...existing.tags, ...memory.tags])],
        mentions: (existing.mentions ?? 1) + 1
      };
    } else {
      this.memories.push({ ...memory, createdTurn: this.turn, mentions: 1 });
    }
    this.memories = this.memories
      .sort((left, right) => right.importance - left.importance)
      .slice(0, this.character.memoryMax);
  }

  /** Applies effects to the encounter's flags, counters, items and state. Returns the rest as events. */
  applyWorldEffects(effects) {
    const memories = [];
    const plain = [];
    for (const effect of [].concat(effects ?? [])) {
      if (effect && typeof effect === "object" && effect.memory) memories.push(effect.memory);
      else plain.push(effect);
    }
    const { world, events } = applyEffects(plain, { flag: this.flag, counter: this.counter, item: this.item, state: this.npc.state });
    this.flag = world.flag ?? {};
    this.counter = world.counter ?? {};
    this.item = world.item ?? {};
    this.npc.state = world.state;
    for (const memory of memories) this.addMemory(validateMemory(memory));
    return events;
  }

  /** Runs the events for a trigger, highest priority first. The first `end` wins. */
  runEvents(trigger, action, view) {
    const fired = [];
    const due = this.events
      .filter((event) => event.on === trigger || (trigger === "action" && event.on === `action ${action}`))
      .sort((left, right) => (Number(right.priority) || 0) - (Number(left.priority) || 0));
    for (const event of due) {
      const current = { ...this.view(view), lastAction: action };
      if (!evaluate(event.if ?? null, current) || !evaluate(event.also ?? null, current)) continue;
      for (const effect of this.applyWorldEffects(event.effects ?? [])) {
        if (effect.kind === "end") {
          if (this.outcome === "active") this.outcome = effect.value;
        } else {
          fired.push(effect);
        }
      }
      if (event.memory) this.addMemory(firstMemory(event.memory, current));
    }
    return fired;
  }

  setStatusFromOutcome() {
    if (this.outcome === "active") return;
    this.status = this.vault.notes[this.outcome]?.props.result === "success" ? "success" : "failure";
  }

  // ------------------------------------------------------------ the dialogue tree

  /** The edges out of a node that match this input (detector or condition), else-edge last. */
  nextNode(name, input) {
    const edges = this.tree.edges.filter((edge) => edge.from === name);
    const view = this.view();
    for (const edge of edges) {
      const detector = edge.label.match(/~\s*([\w-]+)\s*$/)?.[1];
      if (detector && input !== null && this.detectors.matches(detector, input)) return edge.to;
      const condition = edge.label.match(/^if\s+(.+)$/)?.[1];
      if (condition && evaluate(condition, view)) return edge.to;
    }
    return input !== null ? edges.find((edge) => edge.label === "else")?.to ?? null : null;
  }

  /**
   * Follows the tree from the current node. With input, detector arrows can
   * fire, and an `else` arrow moves on from a script node. Stops at an open
   * node with nowhere to go, or at a script node, which it returns.
   */
  walkTree(input) {
    for (let step = 0; step < 10 && this.node; step += 1) {
      const next = this.nextNode(this.node, input);
      if (!next) return null;
      this.node = next;
      if (this.tree.nodes[next]?.kind === "script") return next;
    }
    return null;
  }

  /** Runs a script node: fixed lines and effects, no model call. */
  runScript(name, playerText) {
    const node = this.tree.nodes[name];
    let action = null;
    let tone = "neutral";
    let cue = null;
    let line = null;
    const effects = [];
    for (const command of node.commands) {
      if (command.startsWith("> ")) {
        line = command.slice(2).trim();
        continue;
      }
      const [word, ...rest] = command.split(/\s+/);
      const arg = rest.join(" ");
      if (word === "say") line = this.character.dialogue.lines[arg] ?? line;
      else if (word === "action") action = arg;
      else if (word === "tone") tone = arg;
      else if (word === "cue") cue = arg;
      else if (word === "end") effects.push(`end ${arg}`);
      else if (!SCRIPT_WORDS.has(word)) {
        try {
          parseEffect(command);
          effects.push(command);
        } catch {
          // Plain prose on the card is a note for people.
        }
      }
    }
    line = this.personalize(line ?? "");
    this.turn += 1;
    this.history.push({ speaker: "player", text: playerText });
    this.history.push({ speaker: "arthur", text: line, ...(action ? { action } : {}) });
    this.history = this.history.slice(-this.character.historyMax);
    const events = [];
    for (const effect of this.applyWorldEffects([...effects, ...node.do])) {
      if (effect.kind === "end") {
        if (this.outcome === "active") this.outcome = effect.value;
      } else {
        events.push(effect);
      }
    }
    this.setStatusFromOutcome();
    const performance = createNpcPerformance({
      action: action ?? "SCRIPT",
      tone,
      line,
      portraitCue: cue ?? this.actionsById[action]?.portraitCue,
      soundEffect: this.vault.notes[this.outcome]?.props.sound,
      speech: this.characterProfile.speech,
      status: this.status,
      outcome: this.outcome
    });
    if (this.status !== "active") this.lastPerformance = performance;
    this.debugLog.push({
      sequence: ++this.debugSequence,
      turn: this.turn,
      result: "script",
      node: name,
      playerInput: playerText,
      dialogue: line,
      status: this.status,
      outcome: this.outcome
    });
    return {
      playerInput: playerText,
      dialogue: line,
      decision: action ? { action, confidence: 1, reason: `Script node ${name}.`, tone } : null,
      npcPerformance: structuredClone(performance),
      status: this.status,
      outcome: this.outcome,
      events,
      node: name
    };
  }

  /**
   * The player uses an item on the character (such as showing the ID card).
   * Its effects run, and the tree may move to a script node, which answers.
   * Returns null when the item cannot be used now.
   */
  useItem(itemId) {
    if (this.status !== "active") throw new Error("The encounter has ended.");
    const item = this.vault.notes[itemId];
    if (!item || item.type !== "item") return null;
    if (item.props.once && this.item[itemId] && this.item[itemId] !== "held") return null;
    this.applyWorldEffects(item.props.effects ?? []);
    const script = this.walkTree(null);
    if (!script) return null;
    return this.runScript(script, item.props.useText ?? `I use the ${item.props.name ?? itemId}.`);
  }

  // ------------------------------------------------------------ a turn

  async takeTurn(playerInput) {
    const input = String(playerInput ?? "").trim();
    if (this.status !== "active") throw new Error("The conversation has ended. Reset the scenario to continue.");
    if (!input) throw new Error("Enter something for Arthur to respond to.");

    const script = this.walkTree(input);
    if (script) return this.runScript(script, input);

    const introducedPlayerName = extractPlayerName(input);
    const isNewPlayerName = Boolean(introducedPlayerName) && introducedPlayerName !== this.playerName;
    this.lastContext = this.buildDecisionContext(input, introducedPlayerName);
    this.lastProviderId = this.providerId;
    this.lastProviderError = null;
    const available = this.lastContext.availableActions;

    try {
      this.lastRawResponse = await this.provider(this.lastContext, available);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastDecision = null;
      this.lastPerformance = null;
      this.lastProviderError = message;
      this.lastRawResponse = { provider: this.providerId, error: message, actionSelected: false };
      this.debugLog.push({
        sequence: ++this.debugSequence,
        turn: this.lastContext.turn,
        result: "provider_error",
        providerId: this.lastProviderId,
        playerInput: input,
        context: structuredClone(this.lastContext),
        rawProviderResponse: structuredClone(this.lastRawResponse),
        error: message
      });
      throw new DecisionProviderError(this.providerId, message);
    }

    const decision = validateDecision(this.lastRawResponse, available, this.character.fallbackAction);
    // A low-confidence choice, or a judgment below the action's bar, falls back.
    const rule = this.actionsById[decision.action];
    if (decision.judgments && rule?.judgment) {
      const judged = Number(decision.judgments[rule.judgment]);
      if (decision.confidence < Number(rule.minConfidence ?? 0) || !(judged >= Number(rule.judgmentMin ?? 0))) {
        const chosen = decision.action;
        decision.action = [].concat(rule.gateFallback ?? []).find((id) => available.includes(id)) ?? this.character.fallbackAction;
        decision.reason = `${this.providerId} chose ${chosen} at confidence ${decision.confidence.toFixed(2)} with ${rule.judgment} ${Number.isFinite(judged) ? judged.toFixed(2) : "missing"}; it needs ${Number(rule.minConfidence ?? 0).toFixed(2)} and ${Number(rule.judgmentMin ?? 0).toFixed(2)}, so ${decision.action} instead.`;
        decision.gated = { from: chosen };
      }
    }
    const action = this.actionsById[decision.action];
    const tone = this.toneFor(this.npc.state);
    const turnSignals = { purpose: inferPurpose(input) };
    const turnView = { lastAction: decision.action, previousAction: this.lastDecision?.action ?? null, detector: this.detectorsFor(input), signal: turnSignals };

    const dialogueOptions = {
      playerInput: input,
      profileId: this.characterProfile.id,
      dialogueContext: { memories: this.memories, history: this.history, state: this.npc.state, action: decision.action, turn: this.turn + 1 }
    };
    let dialogue = this.personalize(this.selectFreshDialogue(decision.action, tone, dialogueOptions));
    if (isNewPlayerName && action.acknowledgesName) {
      const dialogueData = this.character.dialogue;
      const acknowledgement =
        dialogueData.profiles?.[this.characterProfile.id]?.nameAcknowledgement ?? dialogueData.nameAcknowledgement ?? `All right, ${NAME_TOKEN}.`;
      dialogue = `${String(acknowledgement).replaceAll(NAME_TOKEN, introducedPlayerName)} ${dialogue}`;
    }
    // `on: reply` events may add a line (such as the company-call warnings).
    for (const effect of this.runEvents("reply", decision.action, turnView)) {
      if (effect.kind === "append") dialogue += ` ${this.personalize(this.character.dialogue.lines[effect.value] ?? effect.value)}`;
    }
    const authored = resolveDialoguePerformance(this.character.dialogue, decision.action, tone, this.characterProfile.id);
    const previousAction = this.lastDecision?.action ?? null;

    this.turn += 1;
    if (introducedPlayerName) this.playerName = introducedPlayerName;

    // A question Arthur asked stays outstanding until the player settles it.
    if (["satisfied", "refused"].includes(this.lastContext.conversationSignals?.responseStatus)) this.pendingRequest = null;
    this.pendingRequest = resolvePendingRequest(decision.action, dialogue, this.turn) ?? this.pendingRequest;
    this.history.push({ speaker: "player", text: input });
    this.history.push({ speaker: "arthur", text: dialogue, action: decision.action });
    this.history = this.history.slice(-this.character.historyMax);

    // The action's effects. A provider that brings its own state changes replaces the state ones.
    const noteEffects = [].concat(action.effects ?? []);
    const stateEffects = noteEffects.filter((effect) => parseEffect(effect).kind === "state");
    const otherEffects = noteEffects.filter((effect) => parseEffect(effect).kind !== "state");
    const events = this.applyWorldEffects(otherEffects);
    const changes = decision.ownsStateChanges
      ? decision.stateChanges
      : Object.fromEntries(stateEffects.map((effect) => parseEffect(effect)).map(({ key, delta, set }) => [key, set !== undefined ? set - this.npc.state[key] : delta]));
    applyStateChanges(this.npc, changes);
    applyStateChanges(this.npc, this.lastContext.messageEffort?.stateChanges);
    this.addMemory(decision.ownsMemory ? decision.memory : firstMemory(action.memory, { ...this.view(turnView) }));

    if (action.ends && this.outcome === "active") this.outcome = action.ends;
    const view = { ...turnView, previousAction };
    events.push(...this.runEvents("action", decision.action, view), ...this.runEvents("turn", decision.action, view));
    this.setStatusFromOutcome();

    this.lastDecision = { ...decision, tone };
    this.lastPerformance = createNpcPerformance({
      action: decision.action,
      tone,
      line: dialogue,
      portraitCue: authored.portraitCue ?? action.portraitCue,
      soundEffect: authored.soundEffect ?? this.vault.notes[this.outcome]?.props.sound,
      speech: { ...this.characterProfile.speech, ...authored.speech },
      timing: authored.timing,
      status: this.status,
      outcome: this.outcome
    });
    this.debugLog.push({
      sequence: ++this.debugSequence,
      turn: this.turn,
      result: "decision",
      providerId: this.lastProviderId,
      playerInput: input,
      context: structuredClone(this.lastContext),
      rawProviderResponse: structuredClone(this.lastRawResponse),
      decision: structuredClone(this.lastDecision),
      dialogue,
      performance: structuredClone(this.lastPerformance),
      stateAfter: structuredClone(this.npc.state),
      memoriesAfter: structuredClone(this.memories),
      status: this.status,
      outcome: this.outcome
    });
    return {
      playerInput: input,
      dialogue,
      decision: this.lastDecision,
      npcPerformance: structuredClone(this.lastPerformance),
      status: this.status,
      outcome: this.outcome,
      events
    };
  }
}
