const WARNING_ACTIONS = new Set([
  "BECOME_SUSPICIOUS",
  "THREATEN_PLAYER",
  "END_CONVERSATION"
]);

export function getPeriodSoundCue(action) {
  if (action === "ALLOW_ENTRY") return "unlock";
  if (WARNING_ACTIONS.has(action)) return "warning";
  return "relay";
}

export class PeriodAudio {
  constructor({
    contextFactory = () => {
      const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      return AudioContext ? new AudioContext() : null;
    }
  } = {}) {
    this.contextFactory = contextFactory;
    this.context = null;
    this.master = null;
    this.ambience = [];
    this.muted = false;
    this.volume = 0.72;
  }

  ensureContext() {
    if (this.context) return true;

    try {
      this.context = this.contextFactory();
      if (!this.context) return false;

      const highpass = this.context.createBiquadFilter();
      const lowpass = this.context.createBiquadFilter();
      const compressor = this.context.createDynamicsCompressor();
      this.master = this.context.createGain();

      highpass.type = "highpass";
      highpass.frequency.value = 180;
      lowpass.type = "lowpass";
      lowpass.frequency.value = 5200;
      compressor.threshold.value = -24;
      compressor.knee.value = 12;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.008;
      compressor.release.value = 0.18;

      highpass.connect(lowpass);
      lowpass.connect(compressor);
      compressor.connect(this.master);
      this.master.connect(this.context.destination);
      this.input = highpass;
      this.applyGain();
      return true;
    } catch {
      this.context = null;
      this.master = null;
      return false;
    }
  }

  applyGain() {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.015);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.applyGain();
  }

  setVolume(volume) {
    const number = Number(volume);
    if (Number.isFinite(number)) this.volume = Math.min(1, Math.max(0, number));
    this.applyGain();
  }

  async resume() {
    if (!this.ensureContext()) return false;
    try {
      if (this.context.state === "suspended") await this.context.resume();
      return this.context.state !== "closed";
    } catch {
      return false;
    }
  }

  tone({ frequency, duration, gain = 0.035, type = "square", delay = 0 }) {
    if (this.muted || !this.ensureContext()) return false;

    try {
      const start = this.context.currentTime + delay;
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(gain, start + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(envelope);
      envelope.connect(this.input);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
      return true;
    } catch {
      return false;
    }
  }

  playInterfaceClick() {
    return this.tone({ frequency: 880, duration: 0.035, gain: 0.018 });
  }

  playRelay() {
    const first = this.tone({ frequency: 210, duration: 0.055, gain: 0.024 });
    this.tone({ frequency: 154, duration: 0.07, gain: 0.02, delay: 0.065 });
    return first;
  }

  playWarning() {
    const first = this.tone({ frequency: 330, duration: 0.12, gain: 0.035 });
    this.tone({ frequency: 247, duration: 0.15, gain: 0.035, delay: 0.13 });
    return first;
  }

  playUnlock() {
    const first = this.tone({ frequency: 98, duration: 0.09, gain: 0.038 });
    this.tone({ frequency: 196, duration: 0.1, gain: 0.03, delay: 0.11 });
    this.tone({ frequency: 392, duration: 0.14, gain: 0.022, delay: 0.23 });
    return first;
  }

  startAmbience() {
    if (this.muted || this.ambience.length || !this.ensureContext()) return false;

    try {
      for (const [frequency, gainValue] of [[49, 0.007], [98, 0.003]]) {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.value = gainValue;
        oscillator.connect(gain);
        gain.connect(this.input);
        oscillator.start();
        this.ambience.push(oscillator);
      }
      return true;
    } catch {
      this.stopAmbience();
      return false;
    }
  }

  stopAmbience() {
    for (const oscillator of this.ambience) {
      try {
        oscillator.stop();
      } catch {
        // Audio shutdown is best-effort and cannot affect the encounter.
      }
    }
    this.ambience = [];
  }

  playPerformanceCue(performance) {
    const cue = getPeriodSoundCue(performance?.action);
    if (cue === "warning") return this.playWarning();
    if (cue === "unlock") return this.playUnlock();
    return this.playRelay();
  }
}
