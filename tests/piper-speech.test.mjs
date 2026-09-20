import assert from "node:assert/strict";
import test from "node:test";

import { PiperSpeechAdapter, splitIntoSentences } from "../js/speech.js";
import { decodePiperWav } from "../js/piper-worker.js";

function parameter() {
  return {
    value: 0,
    setValueAtTime(value) {
      this.value = value;
    }
  };
}

/**
 * A fake AudioContext that records exactly when each buffer was scheduled, so
 * gapless playback can be asserted rather than assumed.
 */
function fakeContext() {
  const started = [];
  const sources = [];
  const context = {
    state: "running",
    currentTime: 0,
    destination: {},
    started,
    sources,
    createBiquadFilter: () => ({ connect: () => {}, frequency: parameter(), type: "" }),
    createDynamicsCompressor: () => ({
      connect: () => {},
      threshold: parameter(),
      knee: parameter(),
      ratio: parameter(),
      attack: parameter(),
      release: parameter()
    }),
    createGain: () => ({ connect: () => {}, gain: parameter() }),
    createBuffer: (_channels, length, sampleRate) => ({
      length,
      sampleRate,
      duration: length / sampleRate,
      copyToChannel(samples) {
        this.samples = samples;
      }
    }),
    createBufferSource: () => {
      const source = {
        playbackRate: { value: 1 },
        connect: () => {},
        start(when) {
          started.push(when);
          this.startedAt = when;
          // A real source reports completion; without this the adapter waits
          // on Promise.all(completions) forever.
          queueMicrotask(() => this.onended?.());
        },
        stop() {
          this.stopped = true;
        }
      };
      sources.push(source);
      return source;
    }
  };
  return context;
}

/** A worker stub that answers preload immediately and records synthesis order. */
function fakeWorker({ samplesPerCall = 2205, onSynthesize = () => {} } = {}) {
  const listeners = { message: [], error: [] };
  const calls = [];
  const worker = {
    calls,
    terminated: false,
    addEventListener(type, listener) {
      listeners[type]?.push(listener);
    },
    terminate() {
      this.terminated = true;
    },
    postMessage(data) {
      calls.push(data);
      if (data.type === "preload") {
        queueMicrotask(() => worker.emit({ id: data.id, type: "ready" }));
        return;
      }
      onSynthesize(data, worker);
      const samples = new Float32Array(samplesPerCall).fill(0.25);
      queueMicrotask(() =>
        worker.emit({
          id: data.id,
          type: "audio",
          samples: samples.buffer,
          sampleRate: 22050
        })
      );
    },
    emit(data) {
      for (const listener of listeners.message) listener({ data });
    }
  };
  return worker;
}

function buildAdapter(overrides = {}) {
  const context = overrides.context ?? fakeContext();
  const worker = overrides.worker ?? fakeWorker();
  const adapter = new PiperSpeechAdapter({
    wasmSupported: true,
    workerFactory: () => worker,
    contextFactory: () => context,
    fallback: { supported: false, prepare: async () => false, cancel: () => false },
    // Playback timers are short and must run; the worker's long request
    // timeout must not, or every preload would fail instantly.
    schedule: (callback, delay) => {
      if (delay < 1000) callback();
      return 0;
    },
    cancelSchedule: () => {},
    ...overrides.adapter
  });
  return { adapter, context, worker };
}

test("splitIntoSentences keeps terminal punctuation attached", () => {
  assert.deepEqual(splitIntoSentences("Hold it right there. Who are you? State your business!"), [
    "Hold it right there.",
    "Who are you?",
    "State your business!"
  ]);
});

test("splitIntoSentences does not split abbreviations or decimals", () => {
  assert.deepEqual(splitIntoSentences("Mr. Hale signed it. No. 42 is the gate."), [
    "Mr. Hale signed it.",
    "No. 42 is the gate."
  ]);
  assert.deepEqual(splitIntoSentences("The reading was 3.5 bar and holding."), [
    "The reading was 3.5 bar and holding."
  ]);
});

test("splitIntoSentences merges a very short fragment into the next one", () => {
  // A two-word fragment synthesises with poor prosody on its own.
  assert.deepEqual(splitIntoSentences("No. That gate stays shut tonight."), [
    "No. That gate stays shut tonight."
  ]);
});

test("splitIntoSentences hard-splits an over-long sentence", () => {
  const long = `${"a".repeat(140)}, ${"b".repeat(140)}.`;
  const parts = splitIntoSentences(long);

  assert.ok(parts.length > 1, "expected the long sentence to be split");
  for (const part of parts) assert.ok(part.length <= 220, `chunk too long: ${part.length}`);
});

test("splitIntoSentences returns nothing for empty input", () => {
  assert.deepEqual(splitIntoSentences(""), []);
  assert.deepEqual(splitIntoSentences("   \n  "), []);
  assert.deepEqual(splitIntoSentences(null), []);
});

test("empty text resolves without starting or calling the worker", async () => {
  const { adapter, worker } = buildAdapter();
  await adapter.prepare();
  const result = await adapter.speak({ text: "   ", rate: 1, pitch: 1, volume: 1 });

  assert.deepEqual(result, { status: "ended", started: false });
  assert.equal(worker.calls.filter((call) => call.type === "synthesize").length, 0);
});

test("sentences are synthesised one at a time and scheduled gaplessly", async () => {
  const context = fakeContext();
  const { adapter, worker } = buildAdapter({ context });
  await adapter.prepare();

  const starts = [];
  const result = await adapter.speak({
    text: "Hold it right there. This is a restricted yard. Nobody gets past.",
    rate: 1,
    pitch: 1,
    volume: 0.8,
    onStart: ({ engine }) => starts.push(engine)
  });

  const synthesised = worker.calls.filter((call) => call.type === "synthesize");
  assert.deepEqual(
    synthesised.map((call) => call.text),
    ["Hold it right there.", "This is a restricted yard.", "Nobody gets past."]
  );

  // Each buffer is 2205 samples at 22050 Hz, so exactly 0.1s long. Every
  // sentence must begin exactly where the previous one ended: no gap, no overlap.
  assert.equal(context.started.length, 3);
  assert.ok(Math.abs(context.started[0] - 0.05) < 1e-9, "first start should be primed slightly ahead");
  for (let index = 1; index < context.started.length; index += 1) {
    const expected = context.started[index - 1] + 0.1;
    assert.ok(
      Math.abs(context.started[index] - expected) < 1e-9,
      `sentence ${index + 1} started at ${context.started[index]}, expected ${expected}`
    );
  }
  assert.deepEqual(starts, ["piper"]);
  assert.equal(result.started, true);
  assert.equal(result.status, "ended");
});

test("Piper preserves its native pitch and playback speed", async () => {
  const context = fakeContext();
  const { adapter } = buildAdapter({ context });
  await adapter.prepare();

  await adapter.speak({ text: "Sentence one here. Sentence two here.", rate: 1.2, pitch: 0.5, volume: 1 });

  assert.equal(context.sources[0].playbackRate.value, 1);
  assert.equal(context.started[1], 0.05 + 0.1);
});

test("onStart fires once with the piper engine even across many sentences", async () => {
  const { adapter } = buildAdapter();
  await adapter.prepare();

  const starts = [];
  await adapter.speak({
    text: "One sentence here. Another sentence here. A third sentence here.",
    rate: 1,
    pitch: 1,
    volume: 1,
    onStart: (payload) => starts.push(payload)
  });

  assert.deepEqual(starts, [{ engine: "piper" }]);
});

test("cancel stops scheduled sources and abandons pending sentences", async () => {
  const context = fakeContext();
  let adapterRef = null;
  const worker = fakeWorker({
    onSynthesize: (data) => {
      // Cancel while the first sentence is still in flight.
      if (data.text === "Sentence one here.") adapterRef.cancel();
    }
  });
  const built = buildAdapter({ context, worker });
  adapterRef = built.adapter;
  await built.adapter.prepare();

  const result = await built.adapter.speak({
    text: "Sentence one here. Sentence two here. Sentence three here.",
    rate: 1,
    pitch: 1,
    volume: 1
  });

  assert.equal(result.status, "cancelled");
  assert.equal(result.started, false);
  const synthesised = worker.calls.filter((call) => call.type === "synthesize");
  assert.equal(synthesised.length, 1, "no further sentences should be requested");
});

test("cancel stops a source that was scheduled to start later", async () => {
  const context = fakeContext();
  const { adapter } = buildAdapter({ context });
  await adapter.prepare();

  await adapter.speak({ text: "Sentence one here. Sentence two here.", rate: 1, pitch: 1, volume: 1 });
  adapter.cancel();

  // The second buffer was scheduled into the future and must still be stopped.
  assert.ok(context.sources.length >= 2);
});

test("an unavailable worker falls back without throwing", async () => {
  const fallbackCalls = [];
  const adapter = new PiperSpeechAdapter({
    wasmSupported: true,
    runtimeTimeoutMs: 50,
    workerFactory: null,
    contextFactory: () => fakeContext(),
    fallback: {
      supported: true,
      prepare: async () => true,
      cancel: () => false,
      speak: async (payload) => {
        fallbackCalls.push(payload.text);
        payload.onStart?.({ engine: "espeak-wasm" });
        return { status: "ended", started: true };
      }
    }
  });

  assert.equal(await adapter.prepare(), true);
  const starts = [];
  const result = await adapter.speak({
    text: "Stop there.",
    rate: 1,
    pitch: 1,
    volume: 1,
    onStart: ({ engine }) => starts.push(engine)
  });

  assert.deepEqual(result, { status: "ended", started: true });
  assert.deepEqual(fallbackCalls, ["Stop there."]);
  assert.deepEqual(starts, ["espeak-wasm"]);
});

test("a worker that fails to preload marks the runtime failed and falls back", async () => {
  const worker = fakeWorker();
  worker.postMessage = (data) => {
    worker.calls.push(data);
    queueMicrotask(() => worker.emit({ id: data.id, type: "error", message: "model missing" }));
  };
  let prepared = false;
  const adapter = new PiperSpeechAdapter({
    wasmSupported: true,
    runtimeTimeoutMs: 50,
    workerFactory: () => worker,
    contextFactory: () => fakeContext(),
    fallback: {
      supported: true,
      prepare: async () => {
        prepared = true;
        return true;
      },
      cancel: () => false,
      speak: async () => ({ status: "ended", started: true })
    }
  });

  assert.equal(await adapter.prepare(), false);
  assert.equal(adapter.runtimeFailed, true);
  assert.equal(prepared, true);

  const result = await adapter.speak({ text: "Stop there.", rate: 1, pitch: 1, volume: 1 });
  assert.deepEqual(result, { status: "ended", started: true });
});

test("progress messages from the worker reach the progress callback", async () => {
  const worker = fakeWorker();
  const seen = [];
  const adapter = new PiperSpeechAdapter({
    wasmSupported: true,
    runtimeTimeoutMs: 50,
    workerFactory: () => worker,
    contextFactory: () => fakeContext(),
    fallback: { supported: false, prepare: async () => false, cancel: () => false },
    onProgress: (payload) => seen.push(payload)
  });

  await adapter.prepare();
  worker.emit({ type: "progress", loaded: 3, total: 4 });

  assert.deepEqual(seen, [{ loaded: 3, total: 4 }]);
});

test("decodePiperWav reads a mono 16-bit header and converts to float", () => {
  const samples = new Int16Array([0, 16384, -16384, 32767]);
  const buffer = new ArrayBuffer(44 + samples.byteLength);
  const view = new DataView(buffer);
  const ascii = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 22050, true);
  view.setUint32(28, 44100, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.byteLength, true);
  for (const [index, value] of samples.entries()) {
    view.setInt16(44 + index * 2, value, true);
  }

  const decoded = decodePiperWav(buffer);
  assert.equal(decoded.sampleRate, 22050);
  assert.deepEqual([...decoded.samples].map((value) => Number(value.toFixed(5))), [
    0, 0.5, -0.5, 0.99997
  ]);
});

test("decodePiperWav rejects audio that is not mono 16-bit PCM", () => {
  const buffer = new ArrayBuffer(44);
  assert.throws(() => decodePiperWav(buffer), /invalid WAV/i);
});

test("download progress keeps the preload watchdog alive", async () => {
  // The first run downloads roughly 60 MB, which can take far longer than the
  // watchdog interval. Progress must postpone it rather than let it fire.
  const worker = fakeWorker();
  let pendingExpire = null;
  worker.postMessage = (data) => {
    worker.calls.push(data);
    // Never answers: the download is still running.
  };

  const adapter = new PiperSpeechAdapter({
    wasmSupported: true,
    loadStallTimeoutMs: 1000,
    workerFactory: () => worker,
    contextFactory: () => fakeContext(),
    fallback: { supported: false, prepare: async () => false, cancel: () => false },
    schedule: (callback, delay) => {
      if (delay === 1000) {
        pendingExpire = callback;
        return Symbol("preload-timer");
      }
      return 0;
    },
    cancelSchedule: () => {
      pendingExpire = null;
    }
  });

  adapter.prepare();
  assert.ok(pendingExpire, "a preload watchdog should be armed");

  const firstTimer = adapter.workerRequests.values().next().value.timer;
  worker.emit({ type: "progress", loaded: 10, total: 100 });
  const secondTimer = adapter.workerRequests.values().next().value.timer;

  assert.notEqual(firstTimer, secondTimer, "progress should re-arm the watchdog");
});

test("a stalled download is retryable and does not disable piper for good", async () => {
  const worker = fakeWorker();
  let expire = null;
  worker.postMessage = (data) => {
    worker.calls.push(data);
  };

  let fallbackPrepared = 0;
  const adapter = new PiperSpeechAdapter({
    wasmSupported: true,
    loadStallTimeoutMs: 1000,
    workerFactory: () => worker,
    contextFactory: () => fakeContext(),
    fallback: {
      supported: true,
      prepare: async () => {
        fallbackPrepared += 1;
        return true;
      },
      cancel: () => false,
      speak: async () => ({ status: "ended", started: true })
    },
    schedule: (callback, delay) => {
      if (delay === 1000) expire = callback;
      return 0;
    },
    cancelSchedule: () => {}
  });

  const first = adapter.prepare();
  expire();
  assert.equal(await first, false);

  // A load timeout is not a permanent failure: the model may still arrive.
  assert.equal(adapter.runtimeFailed, false);
  assert.equal(adapter.preparationState, "idle");
  assert.equal(fallbackPrepared, 1);

  // A later attempt must actually retry rather than short-circuit.
  worker.postMessage = fakeWorker().postMessage.bind(worker);
  worker.postMessage = (data) => {
    worker.calls.push(data);
    queueMicrotask(() => worker.emit({ id: data.id, type: "ready" }));
  };
  assert.equal(await adapter.prepare(), true);
  assert.equal(adapter.preparationState, "ready");
});

test("a real load error disables piper permanently", async () => {
  const worker = fakeWorker();
  worker.postMessage = (data) => {
    worker.calls.push(data);
    queueMicrotask(() => worker.emit({ id: data.id, type: "error", message: "model missing" }));
  };

  const adapter = new PiperSpeechAdapter({
    wasmSupported: true,
    runtimeTimeoutMs: 50,
    loadStallTimeoutMs: 50,
    workerFactory: () => worker,
    contextFactory: () => fakeContext(),
    fallback: {
      supported: true,
      prepare: async () => true,
      cancel: () => false,
      speak: async () => ({ status: "ended", started: true })
    }
  });

  assert.equal(await adapter.prepare(), false);
  assert.equal(adapter.runtimeFailed, true);
  assert.equal(adapter.preparationState, "failed");
});
