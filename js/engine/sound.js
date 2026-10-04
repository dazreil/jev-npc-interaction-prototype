// Sound for a play session: Arthur's voice (Piper neural voice through the
// intercom filter, with eSpeak and browser speech as fallbacks) and the
// period sound effects. The same parts the browser game uses (js/speech.js,
// js/audio.js), wired the same way; the session decides when to play them.

import { PeriodAudio } from "../audio.js";
import { BrowserSpeechAdapter, ESpeakWasmAdapter, PiperSpeechAdapter, SpeechDirector } from "../speech.js";

/**
 * @param options.onProgress called with { loaded, total } while the voice
 *   model downloads (about 60 MB, first time only; then it is cached)
 */
export function createSound({ onProgress = () => {} } = {}) {
  // Download progress, shared with anyone who subscribes (the session shows
  // it on the intercom while connecting).
  const listeners = new Set();
  let progress = { loaded: 0, total: 0 };
  const reportProgress = (update) => {
    progress = update;
    onProgress(update);
    for (const listener of listeners) listener(update);
  };
  const sfx = new PeriodAudio();
  const sharedContext = () => {
    sfx.ensureContext();
    return sfx.context;
  };
  const espeak = new ESpeakWasmAdapter({ fallback: new BrowserSpeechAdapter(), contextFactory: sharedContext });
  const voice = new SpeechDirector({
    adapter: new PiperSpeechAdapter({ fallback: espeak, contextFactory: sharedContext, onProgress: reportProgress })
  });

  // Start loading the neural voice straight away (no sound plays yet), so it
  // is ready by the time the player calls. Cached after the first run.
  let ready = false;
  const whenReady = voice.prepare().then((ok) => {
    ready = true;
    return ok;
  });

  // Music: each screen's loop (rendered from a Strudel pattern by
  // scripts/music.mjs), straight to the speakers, not through the intercom
  // filter. A new track fades in as the old one fades out.
  const MUSIC_VOLUME = 0.5;
  const FADE = 1.5;
  const buffers = new Map();
  let music = null; // { url, source, gain }
  const loadBuffer = (context, url) => {
    if (!buffers.has(url)) buffers.set(url, fetch(url).then((response) => response.arrayBuffer()).then((data) => context.decodeAudioData(data)));
    return buffers.get(url);
  };
  const fadeOut = (track, context) => {
    if (!track?.gain) return;
    const now = context.currentTime;
    track.gain.gain.cancelScheduledValues(now);
    track.gain.gain.setValueAtTime(track.gain.gain.value, now);
    track.gain.gain.linearRampToValueAtTime(0, now + FADE);
    track.source.stop(now + FADE + 0.05);
  };

  // A line recorded ahead of time (a character's own voice, made by
  // scripts/voices.mjs) plays as an audio file instead of the live voice.
  let clip = null;
  const stopClip = () => {
    if (!clip) return;
    const playing = clip;
    clip = null;
    playing.pause();
    playing.onended?.();
  };

  return {
    sfx,
    voice,
    muted: false,
    /**
     * Plays a recorded line. Returns false (play nothing) when muted or when
     * audio files cannot play here, so the caller falls back to the live voice.
     */
    playRecorded(url, { onStart = () => {}, onEnd = () => {} } = {}) {
      if (this.muted || typeof Audio === "undefined") return false;
      stopClip();
      voice.cancel();
      const audio = new Audio(url);
      clip = audio;
      let ended = false;
      const finish = () => {
        if (ended) return;
        ended = true;
        if (clip === audio) clip = null;
        onEnd();
      };
      audio.onplaying = () => onStart();
      audio.onended = finish;
      audio.onerror = finish;
      audio.play().catch(finish);
      return true;
    },
    stopRecorded: stopClip,
    /** Plays a looping track (a URL), fading from the one playing; null fades to silence. */
    playMusic(url) {
      if ((music?.url ?? null) === (url ?? null)) return;
      const context = sharedContext();
      if (!context) return;
      fadeOut(music, context);
      if (!url) {
        music = null;
        return;
      }
      const track = { url };
      music = track;
      loadBuffer(context, url).then((buffer) => {
        if (music !== track) return;
        track.source = context.createBufferSource();
        track.source.buffer = buffer;
        track.source.loop = true;
        track.gain = context.createGain();
        track.gain.gain.value = 0;
        track.source.connect(track.gain).connect(context.destination);
        track.source.start();
        track.gain.gain.linearRampToValueAtTime(this.muted ? 0 : MUSIC_VOLUME, context.currentTime + FADE);
      }).catch(() => {
        if (music === track) music = null;
      });
    },
    /** Resolves when the voice is ready (true: neural voice; false: fallback). */
    whenReady,
    get ready() {
      return ready;
    },
    get progress() {
      return progress;
    },
    /** Calls `listener({ loaded, total })` while the voice downloads. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Browsers only start audio after a click or key press: call it then. */
    async unlock() {
      await sfx.resume();
    },
    setMuted(muted) {
      this.muted = Boolean(muted);
      sfx.setMuted(this.muted);
      voice.setMuted(this.muted);
      if (this.muted) stopClip();
      if (music?.gain) music.gain.gain.setTargetAtTime(this.muted ? 0 : MUSIC_VOLUME, music.gain.context.currentTime, 0.2);
      if (this.muted) sfx.stopAmbience();
      else sfx.startAmbience();
    }
  };
}
