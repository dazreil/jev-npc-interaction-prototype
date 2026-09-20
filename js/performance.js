import { resolveSpeechProfile } from "./speech.js";

export const PERFORMANCE_PHASES = Object.freeze({
  IDLE: "IDLE",
  PLAYER_TYPING: "PLAYER_TYPING",
  DECIDING: "DECIDING",
  REACTION_IN: "REACTION_IN",
  SPEAKING: "SPEAKING",
  REACTION_OUT: "REACTION_OUT",
  AWAITING_PLAYER: "AWAITING_PLAYER",
  ENDING: "ENDING"
});

export const DEFAULT_PERFORMANCE_TIMING = Object.freeze({
  reactionInMs: 180,
  speakingMs: 920,
  reactionOutMs: 220
});

const ACTION_PORTRAIT_CUES = Object.freeze({
  REFUSE_ENTRY: "dismissive",
  ASK_FOR_REASON: "listening",
  ASK_FOR_PROOF: "suspicious",
  ALLOW_ENTRY: "entry-granted",
  WARN_PLAYER: "irritated",
  DEESCALATE_THREAT: "afraid",
  THREATEN_PLAYER: "hostile",
  SHOW_SYMPATHY: "friendly",
  BECOME_SUSPICIOUS: "suspicious",
  REPAIR_CONVERSATION: "friendly",
  END_CONVERSATION: "dismissive"
});

const TONE_PORTRAIT_CUES = Object.freeze({
  friendly: "friendly",
  irritated: "irritated",
  hostile: "hostile",
  neutral: "neutral"
});

const LEGAL_TRANSITIONS = Object.freeze({
  [PERFORMANCE_PHASES.IDLE]: new Set([
    PERFORMANCE_PHASES.PLAYER_TYPING,
    PERFORMANCE_PHASES.DECIDING
  ]),
  [PERFORMANCE_PHASES.PLAYER_TYPING]: new Set([
    PERFORMANCE_PHASES.AWAITING_PLAYER,
    PERFORMANCE_PHASES.DECIDING
  ]),
  [PERFORMANCE_PHASES.DECIDING]: new Set([
    PERFORMANCE_PHASES.REACTION_IN,
    PERFORMANCE_PHASES.AWAITING_PLAYER
  ]),
  [PERFORMANCE_PHASES.REACTION_IN]: new Set([PERFORMANCE_PHASES.SPEAKING]),
  [PERFORMANCE_PHASES.SPEAKING]: new Set([PERFORMANCE_PHASES.REACTION_OUT]),
  [PERFORMANCE_PHASES.REACTION_OUT]: new Set([
    PERFORMANCE_PHASES.AWAITING_PLAYER,
    PERFORMANCE_PHASES.ENDING
  ]),
  [PERFORMANCE_PHASES.AWAITING_PLAYER]: new Set([
    PERFORMANCE_PHASES.PLAYER_TYPING,
    PERFORMANCE_PHASES.DECIDING
  ]),
  [PERFORMANCE_PHASES.ENDING]: new Set()
});

function safeDuration(value, fallback) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 0 ? duration : fallback;
}

function defaultWait(durationMs) {
  if (durationMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export function getPortraitCue(action, tone) {
  return ACTION_PORTRAIT_CUES[action] ?? TONE_PORTRAIT_CUES[tone] ?? "neutral";
}

export function createNpcPerformance({
  action,
  tone,
  line,
  status = "active",
  timing = {},
  speech = {}
}) {
  if (typeof action !== "string" || !action) {
    throw new TypeError("An NPC performance requires an action.");
  }

  if (typeof line !== "string" || !line.trim()) {
    throw new TypeError("An NPC performance requires an authored line.");
  }

  const resolvedTone = typeof tone === "string" && tone ? tone : "neutral";

  return {
    action,
    tone: resolvedTone,
    line,
    portraitCue: getPortraitCue(action, resolvedTone),
    speech: resolveSpeechProfile(resolvedTone, action, speech),
    timing: {
      reactionInMs: safeDuration(timing.reactionInMs, DEFAULT_PERFORMANCE_TIMING.reactionInMs),
      speakingMs: safeDuration(timing.speakingMs, DEFAULT_PERFORMANCE_TIMING.speakingMs),
      reactionOutMs: safeDuration(timing.reactionOutMs, DEFAULT_PERFORMANCE_TIMING.reactionOutMs)
    },
    terminal: status !== "active",
    outcome: status
  };
}

export class PerformanceController {
  constructor({ wait = defaultWait } = {}) {
    if (typeof wait !== "function") throw new TypeError("wait must be a function.");

    this.wait = wait;
    this.phase = PERFORMANCE_PHASES.IDLE;
    this.currentPerformance = null;
    this.listeners = new Set();
    this.runId = 0;
    this.skipRequested = false;
    this.resolveSkip = null;
    this.skipPromise = Promise.resolve();
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function.");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    const event = {
      phase: this.phase,
      performance: this.currentPerformance,
      skipped: this.skipRequested
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Rendering observers cannot interrupt or replay the committed game turn.
      }
    }
  }

  transition(nextPhase) {
    if (!LEGAL_TRANSITIONS[this.phase]?.has(nextPhase)) {
      throw new Error(`Illegal performance transition: ${this.phase} -> ${nextPhase}`);
    }

    this.phase = nextPhase;
    this.emit();
  }

  setPlayerTyping(hasText) {
    if (hasText && [PERFORMANCE_PHASES.IDLE, PERFORMANCE_PHASES.AWAITING_PLAYER].includes(this.phase)) {
      this.transition(PERFORMANCE_PHASES.PLAYER_TYPING);
    } else if (!hasText && this.phase === PERFORMANCE_PHASES.PLAYER_TYPING) {
      this.transition(PERFORMANCE_PHASES.AWAITING_PLAYER);
    }
  }

  beginDecision() {
    if (
      ![
        PERFORMANCE_PHASES.IDLE,
        PERFORMANCE_PHASES.PLAYER_TYPING,
        PERFORMANCE_PHASES.AWAITING_PLAYER
      ].includes(this.phase)
    ) {
      throw new Error(`Cannot begin a decision while presentation is ${this.phase}.`);
    }

    this.runId += 1;
    this.skipRequested = false;
    this.currentPerformance = null;
    this.skipPromise = new Promise((resolve) => {
      this.resolveSkip = resolve;
    });
    this.transition(PERFORMANCE_PHASES.DECIDING);
  }

  failDecision() {
    if (this.phase === PERFORMANCE_PHASES.DECIDING) {
      this.currentPerformance = null;
      this.transition(PERFORMANCE_PHASES.AWAITING_PLAYER);
    }
  }

  skip() {
    if (
      ![
        PERFORMANCE_PHASES.REACTION_IN,
        PERFORMANCE_PHASES.SPEAKING,
        PERFORMANCE_PHASES.REACTION_OUT
      ].includes(this.phase)
    ) {
      return false;
    }

    this.skipRequested = true;
    this.resolveSkip?.();
    this.emit();
    return true;
  }

  async waitForPhase(durationMs, phase, performance) {
    if (this.skipRequested || durationMs <= 0) return;
    await Promise.race([
      Promise.resolve().then(() => this.wait(durationMs, phase, performance)),
      this.skipPromise
    ]);
  }

  async play(performance) {
    if (this.phase !== PERFORMANCE_PHASES.DECIDING) {
      throw new Error(`Cannot play a performance while presentation is ${this.phase}.`);
    }

    const activeRunId = this.runId;
    this.currentPerformance = performance;
    let presentationError = null;

    const stages = [
      [PERFORMANCE_PHASES.REACTION_IN, performance.timing.reactionInMs],
      [PERFORMANCE_PHASES.SPEAKING, performance.timing.speakingMs],
      [PERFORMANCE_PHASES.REACTION_OUT, performance.timing.reactionOutMs]
    ];

    for (const [phase, durationMs] of stages) {
      if (activeRunId !== this.runId) {
        return { completed: false, skipped: this.skipRequested, cancelled: true, error: null };
      }

      this.transition(phase);

      try {
        await this.waitForPhase(durationMs, phase, performance);
      } catch (error) {
        presentationError ??= error instanceof Error ? error : new Error(String(error));
        this.skipRequested = true;
      }
    }

    if (activeRunId !== this.runId) {
      return { completed: false, skipped: this.skipRequested, cancelled: true, error: null };
    }

    this.transition(
      performance.terminal
        ? PERFORMANCE_PHASES.ENDING
        : PERFORMANCE_PHASES.AWAITING_PLAYER
    );

    return {
      completed: presentationError === null,
      skipped: this.skipRequested,
      cancelled: false,
      error: presentationError
    };
  }

  reset() {
    this.runId += 1;
    this.resolveSkip?.();
    this.phase = PERFORMANCE_PHASES.IDLE;
    this.currentPerformance = null;
    this.skipRequested = false;
    this.resolveSkip = null;
    this.skipPromise = Promise.resolve();
    this.emit();
  }
}
