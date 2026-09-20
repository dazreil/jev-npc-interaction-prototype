const DEFAULT_WAIT = (durationMs) =>
  durationMs > 0
    ? new Promise((resolve) => setTimeout(resolve, durationMs))
    : Promise.resolve();

export const SPEECH_PROFILES = Object.freeze({
  neutral: Object.freeze({
    rate: 0.88,
    pitch: 0.78,
    preDelayMs: 70,
    audioPreset: "intercom"
  }),
  friendly: Object.freeze({
    rate: 0.93,
    pitch: 0.86,
    preDelayMs: 55,
    audioPreset: "warm-intercom"
  }),
  irritated: Object.freeze({
    rate: 1.03,
    pitch: 0.7,
    preDelayMs: 35,
    audioPreset: "clipped-intercom"
  }),
  hostile: Object.freeze({
    rate: 0.82,
    pitch: 0.6,
    preDelayMs: 105,
    audioPreset: "warning-intercom"
  })
});

const ACTION_SPEECH_OVERRIDES = Object.freeze({
  ALLOW_ENTRY: Object.freeze({ rate: 0.92, pitch: 0.82, preDelayMs: 65 }),
  DEESCALATE_THREAT: Object.freeze({ rate: 0.78, pitch: 0.7, preDelayMs: 110 }),
  END_CONVERSATION: Object.freeze({ rate: 0.76, pitch: 0.6, preDelayMs: 130 })
});

function finiteInRange(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, number))
    : fallback;
}

export function resolveSpeechProfile(tone = "neutral", action = "", overrides = {}) {
  const base = SPEECH_PROFILES[tone] ?? SPEECH_PROFILES.neutral;
  const actionOverrides = ACTION_SPEECH_OVERRIDES[action] ?? {};
  const combined = { ...base, ...actionOverrides, ...overrides };

  return {
    rate: finiteInRange(combined.rate, base.rate, 0.5, 1.5),
    pitch: finiteInRange(combined.pitch, base.pitch, 0.4, 1.4),
    preDelayMs: finiteInRange(combined.preDelayMs, base.preDelayMs, 0, 1000),
    audioPreset:
      typeof combined.audioPreset === "string" && combined.audioPreset
        ? combined.audioPreset
        : base.audioPreset,
    ...(typeof combined.voice === "string" && combined.voice
      ? { voice: combined.voice }
      : {})
  };
}

export class BrowserSpeechAdapter {
  constructor({
    synthesis = globalThis.speechSynthesis,
    Utterance = globalThis.SpeechSynthesisUtterance,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancelSchedule = (timer) => clearTimeout(timer)
  } = {}) {
    this.synthesis = synthesis;
    this.Utterance = Utterance;
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.active = null;
  }

  get supported() {
    return Boolean(this.synthesis && this.Utterance);
  }

  selectVoice() {
    const voices = this.synthesis?.getVoices?.() ?? [];
    const preferredNames = ["Daniel", "George", "Arthur", "English United Kingdom"];

    return (
      preferredNames
        .map((name) => voices.find((voice) => voice.name.includes(name)))
        .find(Boolean) ??
      voices.find((voice) => /^en-GB/i.test(voice.lang)) ??
      voices.find((voice) => /^en/i.test(voice.lang)) ??
      null
    );
  }

  speak({ text, rate, pitch, volume, onStart = () => {} }) {
    if (!this.supported) {
      return Promise.resolve({ status: "unsupported", started: false });
    }

    this.cancel();

    return new Promise((resolve) => {
      const utterance = new this.Utterance(text);
      const voice = this.selectVoice();
      let started = false;
      let settled = false;
      const estimatedMs = Math.ceil((String(text).length / (11 * Math.max(rate, 0.5))) * 1000);
      const safetyMs = Math.min(20000, Math.max(5000, estimatedMs + 3500));

      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;
      if (voice) utterance.voice = voice;

      let safetyTimer = null;
      const finish = (status) => {
        if (settled) return;
        settled = true;
        this.cancelSchedule(safetyTimer);
        if (this.active?.utterance === utterance) this.active = null;
        resolve({ status, started });
      };

      utterance.onstart = () => {
        started = true;
        onStart({ engine: "web-speech" });
      };
      utterance.onend = () => finish("ended");
      utterance.onerror = (event) =>
        finish(["canceled", "interrupted"].includes(event.error) ? "cancelled" : "error");

      safetyTimer = this.schedule(() => {
        this.synthesis.cancel();
        finish("timeout");
      }, safetyMs);

      this.active = { utterance, finish };

      try {
        this.synthesis.speak(utterance);
      } catch {
        finish("error");
      }
    });
  }

  cancel() {
    if (!this.active) return false;
    const { finish } = this.active;
    this.synthesis?.cancel?.();
    finish("cancelled");
    return true;
  }
}

function concatenatePcmChunks(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      samples[offset + index] = chunk[index] / 32768;
    }
    offset += chunk.length;
  }

  return samples;
}

function pcm16ToFloat(samples) {
  const result = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    result[index] = samples[index] / 32768;
  }
  return result;
}

export class ESpeakWasmAdapter {
  constructor({
    moduleUrl = "/assets/vendor/espeak-ng/espeak-ng.js",
    workerUrl = "/js/espeak-worker.js",
    importModule = (url) => import(url),
    workerFactory = typeof globalThis.Worker === "function"
      ? (url) => new Worker(url, { type: "module" })
      : null,
    contextFactory = () => {
      const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      return AudioContext ? new AudioContext() : null;
    },
    wasmSupported = Boolean(globalThis.WebAssembly),
    fallback = new BrowserSpeechAdapter(),
    runtimeTimeoutMs = 12000,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancelSchedule = (timer) => clearTimeout(timer)
  } = {}) {
    this.moduleUrl = moduleUrl;
    this.workerUrl = workerUrl;
    this.importModule = importModule;
    this.workerFactory = workerFactory;
    this.contextFactory = contextFactory;
    this.wasmSupported = wasmSupported;
    this.fallback = fallback;
    this.runtimeTimeoutMs = runtimeTimeoutMs;
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.context = null;
    this.input = null;
    this.lowpass = null;
    this.master = null;
    this.runtimePromise = null;
    this.worker = null;
    this.workerRequests = new Map();
    this.workerRequestId = 0;
    this.workerReadyPromise = null;
    this.runtimeFailed = false;
    this.active = null;
    this.runId = 0;
  }

  get supported() {
    return (this.wasmSupported && !this.runtimeFailed) || Boolean(this.fallback?.supported);
  }

  ensureAudioGraph() {
    if (this.context) return true;

    try {
      this.context = this.contextFactory();
      if (!this.context) return false;

      const highpass = this.context.createBiquadFilter();
      this.lowpass = this.context.createBiquadFilter();
      const compressor = this.context.createDynamicsCompressor();
      this.master = this.context.createGain();

      highpass.type = "highpass";
      highpass.frequency.value = 170;
      this.lowpass.type = "lowpass";
      this.lowpass.frequency.value = 3900;
      compressor.threshold.value = -26;
      compressor.knee.value = 8;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.006;
      compressor.release.value = 0.16;

      highpass.connect(this.lowpass);
      this.lowpass.connect(compressor);
      compressor.connect(this.master);
      this.master.connect(this.context.destination);
      this.input = highpass;
      return true;
    } catch {
      this.context = null;
      return false;
    }
  }

  loadRuntime() {
    if (!this.runtimePromise) {
      this.runtimePromise = this.importModule(this.moduleUrl).then(async ({ default: initialise }) => {
        const module = await initialise();
        return { module, instance: new module.eSpeakNGWorker() };
      });
    }
    return this.runtimePromise;
  }

  loadRuntimeWithTimeout() {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        this.cancelSchedule(timer);
        callback(value);
      };
      timer = this.schedule(() => {
        const error = new Error("eSpeak runtime initialization timed out.");
        error.code = "ESPEAK_RUNTIME_TIMEOUT";
        finish(reject, error);
      }, this.runtimeTimeoutMs);

      this.loadRuntime().then(
        (runtime) => finish(resolve, runtime),
        (error) => finish(reject, error)
      );
    });
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    if (!this.workerFactory) return null;

    const worker = this.workerFactory(this.workerUrl);
    worker.addEventListener("message", ({ data }) => {
      const request = this.workerRequests.get(data?.id);
      if (!request) return;
      this.workerRequests.delete(data.id);
      this.cancelSchedule(request.timer);
      if (data.type === "error") request.reject(new Error(data.message || "eSpeak worker failed."));
      else request.resolve(data);
    });
    worker.addEventListener("error", () => this.failWorker(new Error("eSpeak worker failed.")));
    this.worker = worker;
    return worker;
  }

  failWorker(error) {
    const worker = this.worker;
    this.worker = null;
    this.workerReadyPromise = null;
    worker?.terminate?.();
    for (const request of this.workerRequests.values()) {
      this.cancelSchedule(request.timer);
      request.reject(error);
    }
    this.workerRequests.clear();
  }

  requestWorker(type, payload = {}) {
    const worker = this.ensureWorker();
    if (!worker) return Promise.reject(new Error("Web Workers are unavailable."));

    return new Promise((resolve, reject) => {
      const id = ++this.workerRequestId;
      const timer = this.schedule(() => {
        const error = new Error(`eSpeak worker ${type} timed out.`);
        error.code = "ESPEAK_RUNTIME_TIMEOUT";
        this.failWorker(error);
      }, this.runtimeTimeoutMs);
      this.workerRequests.set(id, { resolve, reject, timer, type });
      try {
        worker.postMessage({ id, type, ...payload });
      } catch (error) {
        this.workerRequests.delete(id);
        this.cancelSchedule(timer);
        reject(error);
      }
    });
  }

  prepareWorker() {
    if (!this.workerReadyPromise) {
      this.workerReadyPromise = this.requestWorker("preload").catch((error) => {
        this.workerReadyPromise = null;
        throw error;
      });
    }
    return this.workerReadyPromise;
  }

  async prepare() {
    if (!this.wasmSupported || this.runtimeFailed || !this.ensureAudioGraph()) {
      return this.fallback?.prepare?.() ?? false;
    }

    try {
      if (this.context.state !== "running") await this.context.resume();
      if (this.context.state !== "running") return this.fallback?.prepare?.() ?? false;
      if (this.workerFactory) await this.prepareWorker();
      else await this.loadRuntimeWithTimeout();
      return true;
    } catch (error) {
      if (error?.code !== "ESPEAK_RUNTIME_TIMEOUT") this.runtimeFailed = true;
      return this.fallback?.prepare?.() ?? false;
    }
  }

  applyPreset(audioPreset) {
    if (!this.lowpass) return;
    const frequency = {
      "warm-intercom": 4300,
      "clipped-intercom": 3300,
      "warning-intercom": 2900
    }[audioPreset] ?? 3900;
    this.lowpass.frequency.setValueAtTime(frequency, this.context.currentTime);
  }

  async speak({
    text,
    rate,
    pitch,
    volume,
    voice = "en-gb+m3",
    audioPreset = "intercom",
    onStart = () => {}
  }) {
    this.cancel();
    const runId = this.runId;

    if (!(await this.prepare()) || this.runtimeFailed) {
      return this.fallback.speak({ text, rate, pitch, volume, onStart });
    }
    if (runId !== this.runId) return { status: "cancelled", started: false };

    try {
      const resolvedRate = Math.round(175 * finiteInRange(rate, 1, 0.5, 1.5));
      const resolvedPitch = Math.round(50 * finiteInRange(pitch, 1, 0.4, 1.4));
      let pcm;
      let sampleRate;
      if (this.workerFactory) {
        const result = await this.requestWorker("synthesize", {
          text: String(text),
          voice,
          rate: resolvedRate,
          pitch: resolvedPitch
        });
        pcm = pcm16ToFloat(new Int16Array(result.samples));
        sampleRate = result.sampleRate || 22050;
      } else {
        const { instance } = await this.loadRuntimeWithTimeout();
        const chunks = [];
        instance.set_voice(voice);
        instance.set_rate(resolvedRate);
        instance.set_pitch(resolvedPitch);
        instance.synthesize(String(text), (samples) => {
          if (samples?.length) chunks.push(samples);
        });
        pcm = concatenatePcmChunks(chunks);
        sampleRate = instance.samplerate || 22050;
      }

      if (pcm.length === 0) throw new Error("eSpeak returned no audio samples.");
      if (runId !== this.runId) return { status: "cancelled", started: false };

      const buffer = this.context.createBuffer(1, pcm.length, sampleRate);
      buffer.copyToChannel(pcm, 0);
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.input);
      this.applyPreset(audioPreset);
      this.master.gain.setValueAtTime(
        finiteInRange(volume, 0.72, 0, 1),
        this.context.currentTime
      );

      const playback = await new Promise((resolve) => {
        let settled = false;
        const durationMs = (pcm.length / buffer.sampleRate) * 1000;
        const safetyMs = Math.min(30000, Math.max(2500, Math.ceil(durationMs + 2000)));
        let safetyTimer = null;
        const finish = (status) => {
          if (settled) return;
          settled = true;
          this.cancelSchedule(safetyTimer);
          if (this.active?.source === source) this.active = null;
          resolve({ status, started: true });
        };

        source.onended = () => finish("ended");
        this.active = { source, finish };
        source.start();
        onStart({ engine: "espeak-wasm" });
        safetyTimer = this.schedule(() => {
          source.onended = null;
          try {
            source.stop();
          } catch {
            // A stalled source may already have stopped without firing onended.
          }
          finish("timeout");
        }, safetyMs);
      });

      if (playback.status === "timeout") {
        this.runtimeFailed = true;
        return this.fallback.speak({ text, rate, pitch, volume, onStart });
      }
      return playback;
    } catch {
      if (runId !== this.runId) return { status: "cancelled", started: false };
      this.runtimeFailed = true;
      return this.fallback.speak({ text, rate, pitch, volume, onStart });
    }
  }

  cancel() {
    this.runId += 1;
    let cancelled = false;

    if ([...this.workerRequests.values()].some((request) => request.type === "synthesize")) {
      const error = new Error("eSpeak request cancelled.");
      error.code = "ESPEAK_CANCELLED";
      this.failWorker(error);
      cancelled = true;
    }

    if (this.active) {
      const { source, finish } = this.active;
      this.active = null;
      source.onended = null;
      try {
        source.stop();
      } catch {
        // A source that already ended needs no further cleanup.
      }
      finish("cancelled");
      cancelled = true;
    }

    return this.fallback?.cancel?.() || cancelled;
  }
}

export class SpeechDirector {
  constructor({ adapter = new BrowserSpeechAdapter(), wait = DEFAULT_WAIT } = {}) {
    this.adapter = adapter;
    this.wait = wait;
    this.muted = false;
    this.volume = 0.72;
    this.runId = 0;
    this.resolveFallback = null;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) this.cancel();
  }

  setVolume(volume) {
    this.volume = finiteInRange(volume, this.volume, 0, 1);
  }

  prepare() {
    if (this.muted) return Promise.resolve(false);
    return Promise.resolve(this.adapter.prepare?.()).catch(() => false);
  }

  cancel() {
    this.runId += 1;
    this.adapter.cancel?.();
    this.resolveFallback?.();
    this.resolveFallback = null;
  }

  async waitFallback(durationMs) {
    if (durationMs <= 0) return;
    await new Promise((resolve) => {
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        if (this.resolveFallback === finish) this.resolveFallback = null;
        resolve();
      };
      this.resolveFallback = finish;
      Promise.resolve(this.wait(durationMs)).then(finish, finish);
    });
  }

  async deliver(performance, { onStart = () => {}, onEnd = () => {} } = {}) {
    this.cancel();
    const runId = this.runId;
    const speech = performance.speech ?? resolveSpeechProfile(performance.tone, performance.action);
    const fallbackMs = performance.timing?.speakingMs ?? 920;

    await this.wait(speech.preDelayMs);
    if (runId !== this.runId) return { status: "cancelled", mode: "none" };

    if (this.muted || !this.adapter.supported) {
      onStart({ mode: "fallback", engine: "timed" });
      await this.waitFallback(fallbackMs);
      if (runId === this.runId) onEnd({ mode: "fallback" });
      return {
        status: runId === this.runId ? "ended" : "cancelled",
        mode: "fallback"
      };
    }

    let started = false;
    let activeEngine = "unknown";
    const result = await this.adapter.speak({
      text: performance.line,
      rate: speech.rate,
      pitch: speech.pitch,
      volume: this.volume,
      voice: speech.voice,
      audioPreset: speech.audioPreset,
      onStart: ({ engine } = {}) => {
        started = true;
        activeEngine = engine ?? "unknown";
        onStart({ mode: "speech", engine: activeEngine });
      }
    });

    if (runId !== this.runId) return { status: "cancelled", mode: "speech" };

    if (!started && result.status !== "cancelled") {
      onStart({ mode: "fallback", engine: "timed" });
      await this.waitFallback(fallbackMs);
    }

    if (runId === this.runId) onEnd({ mode: started ? "speech" : "fallback" });
    return { status: result.status, mode: started ? "speech" : "fallback" };
  }
}
