import { PERFORMANCE_PHASES } from "./performance.js";

export const PORTRAIT_ASSETS = Object.freeze({
  neutral: "assets/encounter/arthur-intercom.webp",
  blink: "assets/encounter/arthur-intercom.webp",
  listening: "assets/encounter/arthur-intercom.webp",
  suspicious: "assets/encounter/arthur-intercom.webp",
  irritated: "assets/encounter/arthur-intercom.webp",
  hostile: "assets/encounter/arthur-intercom.webp",
  friendly: "assets/encounter/arthur-intercom.webp",
  afraid: "assets/encounter/arthur-intercom.webp",
  dismissive: "assets/encounter/arthur-intercom.webp",
  "entry-granted": "assets/encounter/arthur-intercom.webp",
  "talk-a": "assets/encounter/arthur-intercom.webp",
  "talk-b": "assets/encounter/arthur-talk-2.webp",
  "talk-c": "assets/encounter/arthur-talk-3.webp",
  "talk-d": "assets/encounter/arthur-talk-4.webp"
});

export const TALK_SEQUENCE = Object.freeze([
  "talk-a",
  "talk-b",
  "talk-c",
  "talk-b",
  "talk-d",
  "talk-b"
]);

export const TALK_FRAME_MS = 125;
export const IDLE_BLINK_DELAY_MS = 3600;
export const BLINK_DURATION_MS = 120;

const GLITCH_ACTIONS = new Set([
  "BECOME_SUSPICIOUS",
  "THREATEN_PLAYER",
  "END_CONVERSATION"
]);

export function resolvePortraitAsset(cue) {
  const resolvedCue = PORTRAIT_ASSETS[cue] ? cue : "neutral";
  return { cue: resolvedCue, src: PORTRAIT_ASSETS[resolvedCue] };
}

export function shouldGlitchPortrait(action) {
  return GLITCH_ACTIONS.has(action);
}

export class PortraitAnimator {
  constructor({
    onFrame,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = (timer) => clearTimeout(timer),
    reducedMotion = () => false,
    autoTalk = true
  }) {
    if (typeof onFrame !== "function") throw new TypeError("onFrame must be a function.");

    this.onFrame = onFrame;
    this.schedule = schedule;
    this.cancel = cancel;
    this.reducedMotion = reducedMotion;
    this.autoTalk = autoTalk;
    this.timer = null;
    this.currentPerformance = null;
    this.talkIndex = 0;
  }

  stopTimer() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }

  show(cue, { glitch = false } = {}) {
    const frame = resolvePortraitAsset(cue);
    this.onFrame({ ...frame, glitch });
    return frame;
  }

  scheduleIdleBlink() {
    if (this.reducedMotion()) return;

    this.timer = this.schedule(() => {
      this.show("blink");
      this.timer = this.schedule(() => {
        this.show("neutral");
        this.scheduleIdleBlink();
      }, BLINK_DURATION_MS);
    }, IDLE_BLINK_DELAY_MS);
  }

  startIdle() {
    this.stopTimer();
    this.show("neutral");
    this.scheduleIdleBlink();
  }

  startTalking() {
    this.stopTimer();

    if (this.reducedMotion()) {
      this.show(this.currentPerformance?.portraitCue ?? "neutral");
      return;
    }

    const advance = () => {
      const cue = TALK_SEQUENCE[this.talkIndex % TALK_SEQUENCE.length];
      this.talkIndex += 1;
      this.show(cue);
      this.timer = this.schedule(advance, TALK_FRAME_MS);
    };

    this.talkIndex = 0;
    advance();
  }

  handlePhase({ phase, performance }) {
    this.stopTimer();
    if (performance) this.currentPerformance = performance;

    const reactionCue = this.currentPerformance?.portraitCue ?? "neutral";

    if ([PERFORMANCE_PHASES.IDLE, PERFORMANCE_PHASES.AWAITING_PLAYER].includes(phase)) {
      this.startIdle();
      return;
    }

    if ([PERFORMANCE_PHASES.PLAYER_TYPING, PERFORMANCE_PHASES.DECIDING].includes(phase)) {
      this.show("listening");
      return;
    }

    if (phase === PERFORMANCE_PHASES.REACTION_IN) {
      this.show(reactionCue, {
        glitch: shouldGlitchPortrait(this.currentPerformance?.action)
      });
      return;
    }

    if (phase === PERFORMANCE_PHASES.SPEAKING) {
      if (this.autoTalk) this.startTalking();
      else this.show(reactionCue);
      return;
    }

    if ([PERFORMANCE_PHASES.REACTION_OUT, PERFORMANCE_PHASES.ENDING].includes(phase)) {
      this.show(reactionCue);
    }
  }

  reset() {
    this.stopTimer();
    this.currentPerformance = null;
    this.talkIndex = 0;
    this.startIdle();
  }
}
