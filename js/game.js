import { selectDialogue } from "./dialogue.js";
import { createNpcPerformance } from "./performance.js";
import {
  STATE_KEYS,
  applyStateChanges,
  clamp,
  cloneNpc,
  assessMessageEffort,
  determineTone,
  getPrimaryGoal
} from "./npc.js";

export const AVAILABLE_ACTIONS = Object.freeze([
  "ANSWER_QUESTION",
  "REFUSE_ENTRY",
  "ASK_FOR_REASON",
  "ASK_FOR_PROOF",
  "ALLOW_ENTRY",
  "WARN_PLAYER",
  "DEESCALATE_THREAT",
  "THREATEN_PLAYER",
  "SHOW_SYMPATHY",
  "BECOME_SUSPICIOUS",
  "REPAIR_CONVERSATION",
  "END_CONVERSATION"
]);

export const FALLBACK_ACTION = "REFUSE_ENTRY";
export const MAX_HISTORY_ENTRIES = 12;
export const MAX_MEMORIES = 8;

export class DecisionProviderError extends Error {
  constructor(providerId, message) {
    super(`${providerId} provider failed: ${message}`);
    this.name = "DecisionProviderError";
    this.providerId = providerId;
  }
}

function cleanReason(value, fallbackUsed) {
  if (fallbackUsed) {
    return "The provider returned an unavailable action, so the safe fallback was used.";
  }

  if (typeof value !== "string" || !value.trim()) {
    return "The provider supplied no usable reason.";
  }

  return value.trim().slice(0, 500);
}

function validateStateChanges(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return STATE_KEYS.reduce((validChanges, key) => {
    const delta = Number(value[key]);

    if (Number.isFinite(delta)) {
      validChanges[key] = clamp(delta, -25, 25);
    }

    return validChanges;
  }, {});
}

function validateMemory(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.fact !== "string" || !value.fact.trim()) return null;

  return {
    fact: value.fact.trim().slice(0, 160),
    importance: clamp(Number(value.importance) || 50),
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag) => typeof tag === "string").slice(0, 4)
      : [],
    topic: typeof value.topic === "string" ? value.topic.slice(0, 40) : null,
    value: typeof value.value === "string" ? value.value.slice(0, 60) : null
  };
}

export function validateDecision(rawDecision, availableActions = AVAILABLE_ACTIONS) {
  const raw = rawDecision && typeof rawDecision === "object" ? rawDecision : {};
  const fallbackUsed = !availableActions.includes(raw.action);
  const action = fallbackUsed ? FALLBACK_ACTION : raw.action;

  return {
    action,
    confidence: clamp(Number(raw.confidence) || 0, 0, 1),
    reason: cleanReason(raw.reason, fallbackUsed),
    stateChanges: fallbackUsed ? {} : validateStateChanges(raw.stateChanges),
    memory: fallbackUsed ? null : validateMemory(raw.memory),
    fallbackUsed,
    invalidAction: fallbackUsed ? String(raw.action ?? "missing") : null
  };
}

export class Game {
  constructor({ npcTemplate, dialogueData, provider, providerId = "mock" }) {
    this.npcTemplate = npcTemplate;
    this.dialogueData = dialogueData;
    this.provider = provider;
    this.providerId = providerId;
    this.reset();
  }

  reset() {
    this.npc = cloneNpc(this.npcTemplate);
    this.memories = [];
    this.history = [];
    this.turn = 0;
    this.status = "active";
    this.reasonPrompted = false;
    this.lastDecision = null;
    this.lastContext = null;
    this.lastRawResponse = null;
    this.lastProviderId = null;
    this.lastProviderError = null;
    this.lastPerformance = null;
  }

  setProvider(provider, providerId) {
    if (typeof provider !== "function") {
      throw new TypeError("A decision provider must be a function.");
    }

    this.provider = provider;
    this.providerId = providerId;
  }

  getAvailableActions() {
    if (this.status !== "active") return [];

    const state = this.npc.state;
    const memoryTags = new Set(this.memories.flatMap((memory) => memory.tags));
    const hasEntryBasis =
      state.trust >= 55 ||
      memoryTags.has("authority") ||
      memoryTags.has("emergency") ||
      memoryTags.has("delivery") ||
      memoryTags.has("proof");
    const latestRepairTurn = this.memories.reduce(
      (latestTurn, memory) =>
        memory.tags?.includes("repair")
          ? Math.max(latestTurn, Number(memory.createdTurn) || 0)
          : latestTurn,
      -1
    );
    const hasUnrepairedRisk = this.memories.some(
      (memory) =>
        (memory.tags?.some((tag) =>
          ["threat", "weapon", "bribe", "contradiction", "lie"].includes(tag)
        ) ?? false) &&
        (Number(memory.createdTurn) || 0) > latestRepairTurn
    );

    return AVAILABLE_ACTIONS.filter((action) => {
      if (action === "ASK_FOR_REASON" && this.reasonPrompted) {
        return false;
      }

      if (action === "ALLOW_ENTRY") {
        return hasEntryBasis && !hasUnrepairedRisk && state.suspicion < 78 && state.irritation < 71;
      }

      if (["ANSWER_QUESTION", "SHOW_SYMPATHY"].includes(action) && state.irritation > 70) {
        return false;
      }

      return true;
    });
  }

  buildDecisionContext(playerInput) {
    const messageEffort = assessMessageEffort(playerInput);
    const contextNpc = cloneNpc(this.npc);
    applyStateChanges(contextNpc, messageEffort.stateChanges);

    return {
      npc: {
        id: contextNpc.id,
        personality: structuredClone(contextNpc.personality),
        state: structuredClone(contextNpc.state),
        goals: structuredClone(contextNpc.goals)
      },
      world: {
        location: "warehouse entrance",
        time: "02:13",
        warehouseOpen: false
      },
      memories: structuredClone(this.memories),
      recentConversation: structuredClone(this.history.slice(-MAX_HISTORY_ENTRIES)),
      playerInput,
      availableActions: this.getAvailableActions(),
      messageEffort,
      turn: this.turn + 1
    };
  }

  addMemory(memory) {
    if (!memory) return;

    const existingIndex = this.memories.findIndex(
      (existing) => existing.fact.toLowerCase() === memory.fact.toLowerCase()
    );

    if (existingIndex >= 0) {
      this.memories[existingIndex] = {
        ...this.memories[existingIndex],
        importance: Math.max(this.memories[existingIndex].importance, memory.importance),
        tags: [...new Set([...this.memories[existingIndex].tags, ...memory.tags])],
        mentions: (this.memories[existingIndex].mentions ?? 1) + 1
      };
    } else {
      this.memories.push({ ...memory, createdTurn: this.turn, mentions: 1 });
    }

    this.memories = this.memories
      .sort((left, right) => right.importance - left.importance)
      .slice(0, MAX_MEMORIES);
  }

  async takeTurn(playerInput) {
    const input = playerInput.trim();

    if (this.status !== "active") {
      throw new Error("The conversation has ended. Reset the scenario to continue.");
    }

    if (!input) {
      throw new Error("Enter something for Arthur to respond to.");
    }

    this.lastContext = this.buildDecisionContext(input);
    this.lastProviderId = this.providerId;
    this.lastProviderError = null;

    try {
      this.lastRawResponse = await this.provider(
        this.lastContext,
        this.lastContext.availableActions
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastDecision = null;
      this.lastPerformance = null;
      this.lastProviderError = message;
      this.lastRawResponse = {
        provider: this.providerId,
        error: message,
        actionSelected: false
      };
      throw new DecisionProviderError(this.providerId, message);
    }

    const decision = validateDecision(
      this.lastRawResponse,
      this.lastContext.availableActions
    );
    const tone = determineTone(this.npc.state);
    const dialogue = selectDialogue(this.dialogueData, decision.action, tone, this.turn, {
      playerInput: input,
      dialogueContext: {
        memories: this.memories,
        history: this.history,
        state: this.npc.state,
        action: decision.action,
        turn: this.turn + 1
      }
    });

    this.turn += 1;
    if (decision.action === "ASK_FOR_REASON") this.reasonPrompted = true;
    if (decision.action === "REPAIR_CONVERSATION") this.reasonPrompted = false;
    this.history.push({ speaker: "player", text: input });
    this.history.push({ speaker: "arthur", text: dialogue, action: decision.action });
    this.history = this.history.slice(-MAX_HISTORY_ENTRIES);

    applyStateChanges(this.npc, decision.stateChanges);
    applyStateChanges(this.npc, this.lastContext.messageEffort?.stateChanges);
    this.addMemory(decision.memory);

    if (decision.action === "ALLOW_ENTRY") this.status = "success";
    if (decision.action === "END_CONVERSATION") this.status = "failure";

    this.lastDecision = { ...decision, tone };
    this.lastPerformance = createNpcPerformance({
      action: decision.action,
      tone,
      line: dialogue,
      status: this.status
    });

    return {
      playerInput: input,
      dialogue,
      decision: this.lastDecision,
      npcPerformance: structuredClone(this.lastPerformance),
      status: this.status
    };
  }

  getSnapshot() {
    return {
      npc: structuredClone(this.npc),
      memories: structuredClone(this.memories),
      history: structuredClone(this.history),
      turn: this.turn,
      status: this.status,
      reasonPrompted: this.reasonPrompted,
      lastDecision: this.lastDecision ? structuredClone(this.lastDecision) : null,
      lastContext: this.lastContext ? structuredClone(this.lastContext) : null,
      lastRawResponse: this.lastRawResponse ? structuredClone(this.lastRawResponse) : null,
      providerId: this.providerId,
      lastProviderId: this.lastProviderId,
      lastProviderError: this.lastProviderError,
      lastPerformance: this.lastPerformance ? structuredClone(this.lastPerformance) : null,
      primaryGoal: getPrimaryGoal(this.npc)
    };
  }
}
