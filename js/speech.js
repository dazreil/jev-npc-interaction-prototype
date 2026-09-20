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

const SENTENCE_ABBREVIATIONS = new Set(["mr.", "mrs.", "dr.", "st.", "no."]);

function hardSplitSentence(sentence, maximumLength = 220) {
  const chunks = [];
  let remainder = sentence.trim();

  while (remainder.length > maximumLength) {
    const window = remainder.slice(0, maximumLength + 1);
    let splitAt = window.lastIndexOf(",");
    if (splitAt < Math.floor(maximumLength * 0.45)) splitAt = window.lastIndexOf(" ");
    if (splitAt <= 0) splitAt = maximumLength;
    else if (window[splitAt] === ",") splitAt += 1;

    chunks.push(remainder.slice(0, splitAt).trim());
    remainder = remainder.slice(splitAt).trim();
  }
  if (remainder) chunks.push(remainder);
  return chunks;
}

export function splitIntoSentences(text) {
  const input = String(text ?? "").trim();
  if (!input) return [];

  const sentences = [];
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (![".", "!", "?"].includes(character)) continue;

    const next = input[index + 1];
    if (next && !/\s/.test(next)) continue;
    if (
      character === "." &&
      /\d/.test(input[index - 1] ?? "") &&
      /\d/.test(input[index + 1] ?? "")
    ) {
      continue;
    }

    const fragment = input.slice(start, index + 1).trim();
    const finalWord = fragment.match(/(?:^|\s)([^\s]+)$/)?.[1]?.toLowerCase();
    if (character === "." && SENTENCE_ABBREVIATIONS.has(finalWord)) continue;

    if (fragment) sentences.push(fragment);
    start = index + 1;
  }
  const remainder = input.slice(start).trim();
  if (remainder) sentences.push(remainder);

  const merged = [];
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    if (sentence.length < 12 && index + 1 < sentences.length) {
      sentences[index + 1] = `${sentence} ${sentences[index + 1]}`;
    } else {
      merged.push(sentence);
    }
  }

  return merged.flatMap((sentence) => hardSplitSentence(sentence));
}

function createIntercomAudioGraph(context) {
  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const master = context.createGain();

  highpass.type = "highpass";
  highpass.frequency.value = 170;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3900;
  compressor.threshold.value = -26;
  compressor.knee.value = 8;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.16;

  highpass.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(master);
  master.connect(context.destination);
  return { input: highpass, lowpass, master };
}

function applyIntercomPreset({ context, lowpass }, audioPreset) {
  if (!lowpass) return;
  const frequency = {
    "warm-intercom": 4300,
    "clipped-intercom": 3300,
    "warning-intercom": 2900
  }[audioPreset] ?? 3900;
  lowpass.frequency.setValueAtTime(frequency, context.currentTime);
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

export class PiperSpeechAdapter {
  constructor({
    voiceId = "en_GB-northern_english_male-medium",
    workerUrl = "/js/piper-worker.js",
    workerFactory = typeof globalThis.Worker === "function"
      ? (url) => new Worker(url, { type: "module" })
      : null,
    contextFactory = () => {
      const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      return AudioContext ? new AudioContext() : null;
    },
    fallback = new ESpeakWasmAdapter(),
    runtimeTimeoutMs = 120000,
    // The first run downloads roughly 60 MB. This watchdog measures silence,
    // not total duration, so a slow but advancing download is never killed.
    loadStallTimeoutMs = 90000,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancelSchedule = (timer) => clearTimeout(timer),
    onProgress = () => {},
    wasmSupported = Boolean(globalThis.WebAssembly)
  } = {}) {
    this.voiceId = voiceId;
    this.workerUrl = workerUrl;
    this.workerFactory = workerFactory;
    this.contextFactory = contextFactory;
    this.fallback = fallback;
    this.runtimeTimeoutMs = runtimeTimeoutMs;
    this.loadStallTimeoutMs = loadStallTimeoutMs;
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.onProgress = onProgress;
    this.wasmSupported = wasmSupported;
    this.context = null;
    this.input = null;
    this.lowpass = null;
    this.master = null;
    this.worker = null;
    this.workerRequests = new Map();
    this.workerRequestId = 0;
    this.preparationState = "idle";
    this.preparationPromise = null;
    this.runtimeFailed = false;
    this.active = null;
    this.runId = 0;
  }

  get supported() {
    const piperSupported = this.wasmSupported && Boolean(this.workerFactory) && !this.runtimeFailed;
    return piperSupported || Boolean(this.fallback?.supported);
  }

  ensureAudioGraph() {
    if (this.context) return true;
    try {
      this.context = this.contextFactory();
      if (!this.context) return false;
      const graph = createIntercomAudioGraph(this.context);
      this.input = graph.input;
      this.lowpass = graph.lowpass;
      this.master = graph.master;
      return true;
    } catch {
      this.context = null;
      return false;
    }
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    if (!this.workerFactory) return null;

    const worker = this.workerFactory(this.workerUrl);
    worker.addEventListener("message", ({ data }) => {
      if (data?.type === "progress") {
        this.refreshPreloadWatchdog();
        this.onProgress({ loaded: data.loaded, total: data.total });
        return;
      }
      const request = this.workerRequests.get(data?.id);
      if (!request) return;
      this.workerRequests.delete(data.id);
      this.cancelSchedule(request.timer);
      if (data.type === "error") request.reject(new Error(data.message || "Piper worker failed."));
      else request.resolve(data);
    });
    worker.addEventListener("error", () => this.failWorker(new Error("Piper worker failed.")));
    this.worker = worker;
    return worker;
  }

  failWorker(error) {
    const worker = this.worker;
    this.worker = null;
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
      const timeoutMs = type === "preload" ? this.loadStallTimeoutMs : this.runtimeTimeoutMs;
      const expire = () => {
        this.workerRequests.delete(id);
        const error = new Error(`Piper worker ${type} timed out.`);
        error.code = type === "synthesize" ? "PIPER_SYNTHESIS_TIMEOUT" : "PIPER_LOAD_TIMEOUT";
        reject(error);
      };
      const timer = this.schedule(expire, timeoutMs);
      this.workerRequests.set(id, { resolve, reject, timer, type, expire, timeoutMs });
      try {
        worker.postMessage({ id, type, voiceId: this.voiceId, ...payload });
      } catch (error) {
        this.workerRequests.delete(id);
        this.cancelSchedule(timer);
        reject(error);
      }
    });
  }

  /** Restarts the pending preload watchdog because the download advanced. */
  refreshPreloadWatchdog() {
    for (const request of this.workerRequests.values()) {
      if (request.type !== "preload") continue;
      this.cancelSchedule(request.timer);
      request.timer = this.schedule(request.expire, request.timeoutMs);
    }
  }

  prepare() {
    if (!this.wasmSupported || !this.workerFactory || this.runtimeFailed) {
      return Promise.resolve(this.fallback?.prepare?.() ?? false);
    }
    if (this.preparationState === "ready") return Promise.resolve(true);
    if (this.preparationPromise) return this.preparationPromise;

    this.preparationState = "loading";
    this.preparationPromise = this.requestWorker("preload")
      .then(() => {
        this.preparationState = "ready";
        return true;
      })
      .catch(async (error) => {
        // A stalled download can be retried later. The game keeps playing on the
        // fallback voice meanwhile and upgrades once Piper becomes available.
        if (error?.code === "PIPER_LOAD_TIMEOUT") {
          this.preparationState = "idle";
        } else {
          this.runtimeFailed = true;
          this.preparationState = "failed";
        }
        this.preparationPromise = null;
        await this.fallback?.prepare?.();
        return false;
      });
    return this.preparationPromise;
  }

  stopActive(status = "cancelled") {
    if (!this.active) return false;
    const active = this.active;
    this.active = null;
    for (const timer of active.startTimers) this.cancelSchedule(timer);
    for (const item of active.sources) {
      item.source.onended = null;
      try {
        item.source.stop();
      } catch {
        // A source that has ended or has not started needs no further cleanup.
      }
      item.finish(status);
    }
    return true;
  }

  async speak({
    text,
    rate,
    pitch,
    volume,
    audioPreset = "intercom",
    onStart = () => {}
  }) {
    this.cancel();
    const runId = this.runId;
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) return { status: "ended", started: false };

    if (this.preparationState !== "ready") {
      if (this.preparationState === "idle") this.prepare();
      return this.fallback.speak({ text, rate, pitch, volume, audioPreset, onStart });
    }

    if (!this.ensureAudioGraph()) {
      return this.fallback.speak({ text, rate, pitch, volume, audioPreset, onStart });
    }
    try {
      if (this.context.state !== "running") await this.context.resume();
      if (this.context.state !== "running") {
        return this.fallback.speak({ text, rate, pitch, volume, audioPreset, onStart });
      }
    } catch {
      return this.fallback.speak({ text, rate, pitch, volume, audioPreset, onStart });
    }
    if (runId !== this.runId) return { status: "cancelled", started: false };

    applyIntercomPreset(this, audioPreset);
    this.master.gain.setValueAtTime(
      finiteInRange(volume, 0.72, 0, 1),
      this.context.currentTime
    );

    const playbackRate = finiteInRange(rate, 1, 0.5, 1.5) * finiteInRange(pitch, 1, 0.4, 1.4);
    const active = { sources: [], startTimers: [] };
    this.active = active;
    const completions = [];
    let cursor = null;
    let started = false;

    try {
      for (const sentence of sentences) {
        const result = await this.requestWorker("synthesize", { text: sentence });
        if (runId !== this.runId) return { status: "cancelled", started };

        const pcm = new Float32Array(result.samples);
        if (pcm.length === 0) throw new Error("Piper returned no audio samples.");
        const sampleRate = result.sampleRate || 22050;
        const buffer = this.context.createBuffer(1, pcm.length, sampleRate);
        buffer.copyToChannel(pcm, 0);
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;
        source.connect(this.input);

        let finishPlayback;
        const completion = new Promise((resolve) => {
          let settled = false;
          finishPlayback = (status) => {
            if (settled) return;
            settled = true;
            resolve(status);
          };
        });
        const item = { source, finish: finishPlayback };
        active.sources.push(item);
        completions.push(completion);
        source.onended = () => finishPlayback("ended");

        const now = this.context.currentTime;
        const startTime = cursor === null ? now + 0.05 : Math.max(now, cursor);
        source.start(startTime);
        if (!started) {
          const startTimer = this.schedule(() => {
            if (runId !== this.runId || started) return;
            started = true;
            onStart({ engine: "piper" });
          }, Math.max(0, (startTime - now) * 1000));
          active.startTimers.push(startTimer);
        }
        const duration = Number.isFinite(buffer.duration)
          ? buffer.duration
          : pcm.length / sampleRate;
        cursor = startTime + duration / playbackRate;
      }

      const statuses = await Promise.all(completions);
      if (this.active === active) this.active = null;
      if (runId !== this.runId || statuses.some((status) => status === "cancelled")) {
        return { status: "cancelled", started };
      }
      return { status: "ended", started };
    } catch (error) {
      if (runId !== this.runId) return { status: "cancelled", started };
      this.stopActive("cancelled");
      if (started) return { status: error?.code === "PIPER_SYNTHESIS_TIMEOUT" ? "timeout" : "error", started };
      return this.fallback.speak({ text, rate, pitch, volume, audioPreset, onStart });
    }
  }

  cancel() {
    this.runId += 1;
    let cancelled = this.stopActive("cancelled");
    for (const [id, request] of this.workerRequests) {
      if (request.type !== "synthesize") continue;
      this.workerRequests.delete(id);
      this.cancelSchedule(request.timer);
      const error = new Error("Piper request cancelled.");
      error.code = "PIPER_CANCELLED";
      request.reject(error);
      cancelled = true;
    }
    return this.fallback?.cancel?.() || cancelled;
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

      const graph = createIntercomAudioGraph(this.context);
      this.input = graph.input;
      this.lowpass = graph.lowpass;
      this.master = graph.master;
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
    applyIntercomPreset(this, audioPreset);
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
