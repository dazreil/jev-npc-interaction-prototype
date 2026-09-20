import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserSpeechAdapter,
  ESpeakWasmAdapter,
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

test("eSpeak WASM adapter synthesizes PCM and resolves from real buffer playback", async () => {
  const calls = {};
  const parameter = () => ({ value: 0, setValueAtTime(value) { this.value = value; } });
  const audioNode = () => ({ connect: () => {} });
  let source;
  let copiedSamples;
  const context = {
    state: "running",
    currentTime: 0,
    destination: {},
    createBiquadFilter: () => ({ ...audioNode(), frequency: parameter(), type: "" }),
    createDynamicsCompressor: () => ({
      ...audioNode(),
      threshold: parameter(),
      knee: parameter(),
      ratio: parameter(),
      attack: parameter(),
      release: parameter()
    }),
    createGain: () => ({ ...audioNode(), gain: parameter() }),
    createBuffer: (_channels, length, sampleRate) => ({
      length,
      sampleRate,
      copyToChannel: (samples) => {
        copiedSamples = samples;
      }
    }),
    createBufferSource: () => {
      source = {
        connect: () => {},
        start: () => queueMicrotask(() => source.onended()),
        stop: () => source.onended?.()
      };
      return source;
    }
  };
  class FakeWorker {
    constructor() {
      this.samplerate = 22050;
    }
    set_voice(value) { calls.voice = value; }
    set_rate(value) { calls.rate = value; }
    set_pitch(value) { calls.pitch = value; }
    synthesize(text, callback) {
      calls.text = text;
      callback(new Int16Array([0, 16384, -16384]), []);
    }
  }
  const adapter = new ESpeakWasmAdapter({
    wasmSupported: true,
    contextFactory: () => context,
    importModule: async () => ({
      default: async () => ({ eSpeakNGWorker: FakeWorker })
    }),
    fallback: { supported: false, cancel: () => false }
  });
  const starts = [];

  const result = await adapter.speak({
    text: "Arthur speaking.",
    rate: 0.8,
    pitch: 0.7,
    volume: 0.6,
    voice: "en-gb+m3",
    audioPreset: "warning-intercom",
    onStart: ({ engine }) => starts.push(engine)
  });

  assert.deepEqual(result, { status: "ended", started: true });
  assert.deepEqual(calls, {
    voice: "en-gb+m3",
    rate: 140,
    pitch: 35,
    text: "Arthur speaking."
  });
  assert.deepEqual([...copiedSamples], [0, 0.5, -0.5]);
  assert.deepEqual(starts, ["espeak-wasm"]);
});

test("eSpeak load failure falls back to browser speech without blocking the turn", async () => {
  const engines = [];
  const fallback = {
    supported: true,
    cancel: () => false,
    speak: async ({ onStart }) => {
      onStart({ engine: "web-speech" });
      return { status: "ended", started: true };
    }
  };
  const adapter = new ESpeakWasmAdapter({
    wasmSupported: true,
    contextFactory: () => null,
    importModule: async () => {
      throw new Error("missing WASM assets");
    },
    fallback
  });

  const result = await adapter.speak({
    text: "Fallback line.",
    rate: 1,
    pitch: 1,
    volume: 0.7,
    onStart: ({ engine }) => engines.push(engine)
  });

  assert.deepEqual(result, { status: "ended", started: true });
  assert.deepEqual(engines, ["web-speech"]);
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
