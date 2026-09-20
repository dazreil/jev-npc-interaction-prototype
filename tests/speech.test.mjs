import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserSpeechAdapter,
  SpeechDirector,
  resolveSpeechProfile
} from "../js/speech.js";

test("speech profiles provide deterministic tone and action delivery metadata", () => {
  assert.deepEqual(resolveSpeechProfile("irritated", "BECOME_SUSPICIOUS"), {
    rate: 1.03,
    pitch: 0.7,
    preDelayMs: 35,
    audioPreset: "clipped-intercom"
  });
  assert.deepEqual(resolveSpeechProfile("neutral", "DEESCALATE_THREAT"), {
    rate: 0.78,
    pitch: 0.7,
    preDelayMs: 110,
    audioPreset: "intercom"
  });
  assert.deepEqual(resolveSpeechProfile("unknown", "", { rate: 9, preDelayMs: -4 }), {
    rate: 1.5,
    pitch: 0.78,
    preDelayMs: 0,
    audioPreset: "intercom"
  });
});

test("browser speech adapter resolves from actual speech events and applies its profile", async () => {
  const spoken = [];
  class FakeUtterance {
    constructor(text) {
      this.text = text;
    }
  }
  const synthesis = {
    getVoices: () => [{ name: "Daniel Compact", lang: "en-GB" }],
    speak: (utterance) => {
      spoken.push(utterance);
      queueMicrotask(() => {
        utterance.onstart();
        utterance.onend();
      });
    },
    cancel: () => {}
  };
  const adapter = new BrowserSpeechAdapter({
    synthesis,
    Utterance: FakeUtterance,
    schedule: () => 1,
    cancelSchedule: () => {}
  });
  let started = false;
  const result = await adapter.speak({
    text: "Stay where I can see you.",
    rate: 0.82,
    pitch: 0.6,
    volume: 0.55,
    onStart: () => {
      started = true;
    }
  });

  assert.deepEqual(result, { status: "ended", started: true });
  assert.equal(started, true);
  assert.equal(spoken[0].voice.name, "Daniel Compact");
  assert.equal(spoken[0].rate, 0.82);
  assert.equal(spoken[0].pitch, 0.6);
  assert.equal(spoken[0].volume, 0.55);
});

test("unavailable or muted speech uses cancellable deterministic timing", async () => {
  const waits = [];
  const events = [];
  const director = new SpeechDirector({
    adapter: { supported: false, cancel: () => {} },
    wait: async (durationMs) => {
      waits.push(durationMs);
    }
  });
  const performance = {
    action: "ANSWER_QUESTION",
    tone: "neutral",
    line: "Arthur. Night security.",
    speech: resolveSpeechProfile("neutral"),
    timing: { speakingMs: 740 }
  };
  const result = await director.deliver(performance, {
    onStart: ({ mode }) => events.push(`start:${mode}`),
    onEnd: ({ mode }) => events.push(`end:${mode}`)
  });

  assert.deepEqual(waits, [70, 740]);
  assert.deepEqual(events, ["start:fallback", "end:fallback"]);
  assert.deepEqual(result, { status: "ended", mode: "fallback" });
});

test("cancelling fallback speech immediately releases the active delivery", async () => {
  const director = new SpeechDirector({
    adapter: { supported: false, cancel: () => {} },
    wait: (durationMs) =>
      durationMs === 0 ? Promise.resolve() : new Promise(() => {})
  });
  const playback = director.deliver({
    action: "ANSWER_QUESTION",
    tone: "neutral",
    line: "Arthur.",
    speech: { ...resolveSpeechProfile("neutral"), preDelayMs: 0 },
    timing: { speakingMs: 920 }
  });

  await new Promise((resolve) => setImmediate(resolve));
  director.cancel();

  assert.deepEqual(await playback, { status: "cancelled", mode: "fallback" });
});
