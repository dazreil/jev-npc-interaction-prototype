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
        : base.audioPreset
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
        onStart();
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
      onStart({ mode: "fallback" });
      await this.waitFallback(fallbackMs);
      if (runId === this.runId) onEnd({ mode: "fallback" });
      return {
        status: runId === this.runId ? "ended" : "cancelled",
        mode: "fallback"
      };
    }

    let started = false;
    const result = await this.adapter.speak({
      text: performance.line,
      rate: speech.rate,
      pitch: speech.pitch,
      volume: this.volume,
      onStart: () => {
        started = true;
        onStart({ mode: "speech" });
      }
    });

    if (runId !== this.runId) return { status: "cancelled", mode: "speech" };

    if (!started && result.status !== "cancelled") {
      onStart({ mode: "fallback" });
      await this.waitFallback(fallbackMs);
    }

    if (runId === this.runId) onEnd({ mode: started ? "speech" : "fallback" });
    return { status: result.status, mode: started ? "speech" : "fallback" };
  }
}
