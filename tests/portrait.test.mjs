import assert from "node:assert/strict";
import test from "node:test";

import { AVAILABLE_ACTIONS } from "../js/game.js";
import { PERFORMANCE_PHASES, createNpcPerformance } from "../js/performance.js";
import {
  BLINK_DURATION_MS,
  IDLE_BLINK_DELAY_MS,
  PORTRAIT_ASSETS,
  TALK_FRAME_MS,
  PortraitAnimator,
  resolvePortraitAsset,
  shouldGlitchPortrait
} from "../js/portrait.js";

test("all twelve actions map to a shipped portrait cue", () => {
  for (const action of AVAILABLE_ACTIONS) {
    const performance = createNpcPerformance({
      action,
      tone: "neutral",
      line: `${action} authored line`
    });
    const frame = resolvePortraitAsset(performance.portraitCue);

    assert.equal(frame.cue, performance.portraitCue, action);
    assert.equal(typeof PORTRAIT_ASSETS[frame.cue], "string", action);
  }
});

test("unknown portrait cues use the neutral fallback", () => {
  assert.deepEqual(resolvePortraitAsset("missing-emotion"), {
    cue: "neutral",
    src: "assets/arthur-portrait.jpg"
  });
});

test("portrait animator plays idle, listening, reaction, talk, and reaction-out frames", () => {
  const frames = [];
  const timers = [];
  const animator = new PortraitAnimator({
    onFrame: (frame) => frames.push(frame),
    schedule: (callback, delay) => {
      timers.push({ callback, delay, cancelled: false });
      return timers.length - 1;
    },
    cancel: (timer) => {
      if (timers[timer]) timers[timer].cancelled = true;
    }
  });

  animator.handlePhase({ phase: PERFORMANCE_PHASES.IDLE, performance: null });
  assert.equal(frames.at(-1).cue, "neutral");
  assert.equal(timers[0].delay, IDLE_BLINK_DELAY_MS);

  timers[0].callback();
  assert.equal(frames.at(-1).cue, "blink");
  assert.equal(timers[1].delay, BLINK_DURATION_MS);
  timers[1].callback();
  assert.equal(frames.at(-1).cue, "neutral");

  animator.handlePhase({ phase: PERFORMANCE_PHASES.PLAYER_TYPING, performance: null });
  assert.equal(frames.at(-1).cue, "listening");

  const performance = createNpcPerformance({
    action: "BECOME_SUSPICIOUS",
    tone: "irritated",
    line: "That story changed."
  });
  animator.handlePhase({ phase: PERFORMANCE_PHASES.REACTION_IN, performance });
  assert.equal(frames.at(-1).cue, "suspicious");
  assert.equal(frames.at(-1).glitch, true);

  animator.handlePhase({ phase: PERFORMANCE_PHASES.SPEAKING, performance });
  assert.equal(frames.at(-1).cue, "talk-a");
  assert.equal(timers.at(-1).delay, TALK_FRAME_MS);
  timers.at(-1).callback();
  assert.equal(frames.at(-1).cue, "talk-b");

  animator.handlePhase({ phase: PERFORMANCE_PHASES.REACTION_OUT, performance });
  assert.equal(frames.at(-1).cue, "suspicious");
});

test("glitches are authored only for severe reaction actions", () => {
  assert.equal(shouldGlitchPortrait("BECOME_SUSPICIOUS"), true);
  assert.equal(shouldGlitchPortrait("THREATEN_PLAYER"), true);
  assert.equal(shouldGlitchPortrait("END_CONVERSATION"), true);
  assert.equal(shouldGlitchPortrait("ANSWER_QUESTION"), false);
});
