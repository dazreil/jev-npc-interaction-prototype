import assert from "node:assert/strict";
import test from "node:test";

import { PeriodAudio, getPeriodSoundCue } from "../js/audio.js";

test("period sound cues reserve warning and unlock sounds for authored actions", () => {
  assert.equal(getPeriodSoundCue("ASK_FOR_PROOF"), "relay");
  assert.equal(getPeriodSoundCue("BECOME_SUSPICIOUS"), "warning");
  assert.equal(getPeriodSoundCue("THREATEN_PLAYER"), "warning");
  assert.equal(getPeriodSoundCue("ALLOW_ENTRY"), "unlock");
});

test("unavailable Web Audio remains a silent non-blocking presentation adapter", async () => {
  const audio = new PeriodAudio({
    contextFactory: () => {
      throw new Error("Audio unavailable");
    }
  });

  assert.equal(await audio.resume(), false);
  assert.equal(audio.startAmbience(), false);
  assert.equal(audio.playInterfaceClick(), false);
  assert.equal(audio.playPerformanceCue({ action: "ALLOW_ENTRY" }), false);
});
