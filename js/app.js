import { Game, MAX_MEMORIES } from "./game.js";
import { PeriodAudio } from "./audio.js";
import {
  LOGICAL_STAGE_HEIGHT,
  LOGICAL_STAGE_WIDTH,
  calculateStageScale
} from "./layout.js";
import { determineTone } from "./npc.js";
import { PERFORMANCE_PHASES, PerformanceController } from "./performance.js";
import { PortraitAnimator } from "./portrait.js";
import { BrowserSpeechAdapter, ESpeakWasmAdapter, SpeechDirector } from "./speech.js";
import { chooseNpcAction as chooseJevAction } from "./providers/jev.js?phase=4";
import { chooseNpcAction as chooseMockAction } from "./providers/mock.js";

const providers = {
  mock: {
    label: "Mock",
    description: "Offline deterministic decision model",
    chooseAction: chooseMockAction
  },
  jev: {
    label: "Jev",
    description: "TypeSafe Jev structured action selection",
    chooseAction: chooseJevAction
  }
};

const PHASE_LABELS = Object.freeze({
  [PERFORMANCE_PHASES.IDLE]: "Idle",
  [PERFORMANCE_PHASES.PLAYER_TYPING]: "Input open",
  [PERFORMANCE_PHASES.DECIDING]: "Processing",
  [PERFORMANCE_PHASES.REACTION_IN]: "Receiving",
  [PERFORMANCE_PHASES.SPEAKING]: "Arthur speaking",
  [PERFORMANCE_PHASES.REACTION_OUT]: "Closing signal",
  [PERFORMANCE_PHASES.AWAITING_PLAYER]: "Awaiting input",
  [PERFORMANCE_PHASES.ENDING]: "Link closed"
});

const elements = {
  conversation: document.querySelector("#conversation"),
  form: document.querySelector("#player-form"),
  input: document.querySelector("#player-input"),
  sendButton: document.querySelector("#send-button"),
  inputHint: document.querySelector("#input-hint"),
  outcome: document.querySelector("#outcome"),
  stateValues: document.querySelector("#state-values"),
  turnCount: document.querySelector("#turn-count"),
  currentGoal: document.querySelector("#current-goal"),
  lastAction: document.querySelector("#last-action"),
  confidence: document.querySelector("#confidence"),
  tone: document.querySelector("#tone"),
  decisionProvider: document.querySelector("#decision-provider"),
  validationStatus: document.querySelector("#validation-status"),
  reason: document.querySelector("#decision-reason"),
  fallbackNotice: document.querySelector("#fallback-notice"),
  memoryCount: document.querySelector("#memory-count"),
  memoryList: document.querySelector("#memory-list"),
  contextJson: document.querySelector("#context-json"),
  responseJson: document.querySelector("#response-json"),
  providerSelect: document.querySelector("#provider-select"),
  providerNote: document.querySelector("#provider-note"),
  providerStatus: document.querySelector("#provider-status"),
  resetButton: document.querySelector("#reset-button"),
  stageMount: document.querySelector("#terminal-mount"),
  arthurPortrait: document.querySelector("#arthur-portrait"),
  arthurFrame: document.querySelector("#arthur-frame"),
  subtitleText: document.querySelector("#subtitle-text"),
  subtitleSpeaker: document.querySelector("#subtitle-speaker"),
  playerMessage: document.querySelector("#player-message"),
  phaseLabel: document.querySelector("#phase-label"),
  linkStatus: document.querySelector("#link-status"),
  doorStatus: document.querySelector("#door-status"),
  gateFeed: document.querySelector("#gate-feed"),
  gateFrame: document.querySelector("#gate-frame"),
  gateAnimationStatus: document.querySelector("#gate-animation-status"),
  gateBarrierState: document.querySelector("#gate-barrier-state"),
  turnCountCompact: document.querySelector("#turn-count-compact"),
  effectsToggle: document.querySelector("#effects-toggle"),
  audioToggle: document.querySelector("#audio-toggle"),
  replayButton: document.querySelector("#replay-button"),
  skipButton: document.querySelector("#skip-button"),
  volumeControl: document.querySelector("#volume-control"),
  voiceLamp: document.querySelector("#voice-lamp"),
  voiceEngine: document.querySelector("#voice-engine"),
  debugDialog: document.querySelector("#debug-dialog"),
  debugOpen: document.querySelector("#debug-open"),
  debugClose: document.querySelector("#debug-close"),
  debugExport: document.querySelector("#debug-export"),
  debugLogStatus: document.querySelector("#debug-log-status"),
  creditsDialog: document.querySelector("#credits-dialog"),
  creditsOpen: document.querySelector("#credits-open"),
  creditsClose: document.querySelector("#credits-close"),
  bootSequence: document.querySelector("#boot-sequence"),
  bootMessage: document.querySelector("#boot-message"),
  bootProgressFill: document.querySelector("#boot-progress-fill")
};

let game;
let dialogueData;
let activeArthurPortrait = elements.arthurPortrait;
let activeArthurFrame = elements.arthurFrame;
let focusBeforeDebug = null;
let focusBeforeCredits = null;
let lastPerformance = null;
let replayRunId = 0;
let bootRunId = 0;
let gateRunId = 0;
let gateAnimationTimer = null;
const periodAudio = new PeriodAudio();
const speechDirector = new SpeechDirector({
  adapter: new ESpeakWasmAdapter({
    fallback: new BrowserSpeechAdapter(),
    contextFactory: () => {
      periodAudio.ensureContext();
      return periodAudio.context;
    }
  })
});
const delay = (durationMs) =>
  durationMs > 0
    ? new Promise((resolve) => setTimeout(resolve, durationMs))
    : Promise.resolve();
const performanceController = new PerformanceController({
  wait: (durationMs, phase, performance) => {
    if (phase !== PERFORMANCE_PHASES.SPEAKING) return delay(durationMs);

    return speechDirector.deliver(performance, {
      onStart: ({ mode, engine }) => {
        portraitAnimator.startTalking();
        elements.voiceLamp.classList.toggle("lamp--on", mode === "speech");
        renderVoiceEngine(engine);
      },
      onEnd: () => {
        elements.voiceLamp.classList.remove("lamp--on");
        portraitAnimator.show(performance.portraitCue);
      }
    });
  }
});
const portraitAnimator = new PortraitAnimator({
  onFrame: ({ cue, src, glitch }) => {
    activeArthurPortrait.src = src;
    activeArthurFrame.dataset.portraitCue = cue;
    activeArthurFrame.classList.toggle("is-glitching", glitch);
  },
  reducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  autoTalk: false
});

function renderVoiceEngine(engine) {
  const labels = {
    "espeak-wasm": "WASM",
    "web-speech": "Browser",
    timed: "Silent",
    muted: "Muted"
  };
  elements.voiceEngine.textContent = labels[engine] ?? "WASM";
  elements.voiceEngine.title =
    engine === "espeak-wasm"
      ? "eSpeak NG running locally through WebAssembly"
      : engine === "web-speech"
        ? "Browser speech fallback"
        : "Timed caption fallback";
}

function renderPerformancePhase({ phase, performance }) {
  document.body.dataset.performancePhase = phase;
  elements.phaseLabel.textContent = PHASE_LABELS[phase] ?? phase;
  elements.linkStatus.textContent = [
    PERFORMANCE_PHASES.DECIDING,
    PERFORMANCE_PHASES.REACTION_IN
  ].includes(phase)
    ? "Processing"
    : phase === PERFORMANCE_PHASES.SPEAKING
      ? "Receiving"
      : phase === PERFORMANCE_PHASES.ENDING
        ? "Closed"
        : "Ready";

  activeArthurFrame.classList.toggle(
    "is-speaking",
    phase === PERFORMANCE_PHASES.SPEAKING
  );
  const canSkip = [
    PERFORMANCE_PHASES.REACTION_IN,
    PERFORMANCE_PHASES.SPEAKING,
    PERFORMANCE_PHASES.REACTION_OUT
  ].includes(phase);
  elements.skipButton.disabled = !canSkip;
  if (phase !== PERFORMANCE_PHASES.SPEAKING) {
    elements.voiceLamp.classList.remove("lamp--on");
  }
  portraitAnimator.handlePhase({ phase, performance });

  if (phase === PERFORMANCE_PHASES.REACTION_IN && performance) {
    periodAudio.playPerformanceCue(performance);
  }
}

performanceController.subscribe(renderPerformancePhase);

function appendMessage(speaker, text, action = null) {
  const article = document.createElement("article");
  article.className = `message message--${speaker}`;
  if (action) article.dataset.action = action;

  const label = document.createElement("span");
  label.className = "message-speaker";
  label.textContent = speaker === "arthur" ? "Arthur" : "You";

  const copy = document.createElement("p");
  copy.className = "message-text";
  copy.textContent = text;

  article.append(label, copy);
  elements.conversation.append(article);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;

  if (speaker === "arthur") {
    elements.subtitleSpeaker.textContent = "Arthur / Guard Tower 04";
    elements.subtitleText.textContent = text;
  } else {
    elements.playerMessage.textContent = text;
  }
}

function renderState(snapshot) {
  elements.stateValues.replaceChildren();

  for (const [key, value] of Object.entries(snapshot.npc.state)) {
    const row = document.createElement("div");
    row.className = "state-row";
    row.dataset.state = key;

    const label = document.createElement("span");
    label.className = "state-label";
    label.textContent = key;

    const track = document.createElement("div");
    track.className = "state-track";
    const fill = document.createElement("div");
    fill.className = "state-fill";
    fill.style.width = `${value}%`;
    track.append(fill);

    const number = document.createElement("span");
    number.className = "state-number";
    number.textContent = String(value);

    row.append(label, track, number);
    elements.stateValues.append(row);
  }
}

function renderMemories(memories) {
  elements.memoryCount.textContent = `${memories.length} / ${MAX_MEMORIES}`;
  elements.memoryList.replaceChildren();

  if (memories.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-memory";
    empty.textContent = "Nothing important recorded yet.";
    elements.memoryList.append(empty);
    return;
  }

  for (const memory of memories) {
    const item = document.createElement("li");
    const fact = document.createElement("span");
    fact.textContent = memory.fact;

    const meta = document.createElement("small");
    meta.textContent = `importance ${memory.importance} · turn ${memory.createdTurn}`;

    item.append(fact, meta);
    elements.memoryList.append(item);
  }
}

function renderDebug(snapshot) {
  const decision = snapshot.lastDecision;
  const providerId = snapshot.lastProviderId ?? snapshot.providerId;
  const providerLabel = providers[providerId]?.label ?? providerId;

  renderState(snapshot);
  renderMemories(snapshot.memories);
  elements.turnCount.textContent = `Turn ${snapshot.turn}`;
  elements.turnCountCompact.textContent = String(snapshot.turn).padStart(2, "0");
  elements.currentGoal.textContent = snapshot.primaryGoal.label;
  elements.lastAction.textContent = decision?.action ?? "WAITING";
  elements.confidence.textContent = decision
    ? decision.confidence.toFixed(2)
    : "—";
  elements.tone.textContent = decision?.tone ?? determineTone(snapshot.npc.state);
  elements.decisionProvider.textContent = providerLabel;
  elements.validationStatus.textContent = snapshot.lastProviderError
    ? "Provider error"
    : decision?.fallbackUsed
      ? "Safe fallback"
      : decision
        ? "Accepted"
        : "Waiting";
  elements.reason.textContent = snapshot.lastProviderError
    ? "No NPC action was selected; the provider failed before any game state changed."
    : decision?.reason ?? "Waiting for the player to speak.";
  elements.contextJson.textContent = snapshot.lastContext
    ? JSON.stringify(snapshot.lastContext, null, 2)
    : "No request sent yet.";
  elements.responseJson.textContent = snapshot.lastRawResponse
    ? JSON.stringify(snapshot.lastRawResponse, null, 2)
    : "No response received yet.";

  elements.fallbackNotice.hidden = !decision?.fallbackUsed;
  elements.fallbackNotice.textContent = decision?.fallbackUsed
    ? `Rejected provider action: ${decision.invalidAction}. Used ${decision.action}.`
    : "";
  const logEntries = game?.getConversationLog().entries.length ?? 0;
  elements.debugLogStatus.textContent = `${logEntries} ${logEntries === 1 ? "record" : "records"}`;
}

function clearProviderStatus() {
  elements.providerStatus.hidden = true;
  elements.providerStatus.textContent = "";
}

function selectProvider(providerId) {
  const selectedProvider = providers[providerId];
  if (!selectedProvider) return;

  game.setProvider(selectedProvider.chooseAction, providerId);
  elements.providerSelect.value = providerId;
  elements.providerNote.textContent = selectedProvider.description;
}

async function refreshJevStatus() {
  const option = elements.providerSelect.querySelector('option[value="jev"]');

  try {
    const response = await fetch("/api/jev/status", { cache: "no-store" });
    if (!response.ok) throw new Error("Status endpoint unavailable");
    const status = await response.json();

    option.textContent = status.configured ? "Jev" : "Jev — server key missing";
    providers.jev.description = status.configured
      ? `TypeSafe ${status.model} structured action selection`
      : "TypeSafe server is running, but TYPESAFE_API_KEY is missing";
  } catch {
    option.textContent = "Jev — requires npm start";
    providers.jev.description = "Run npm start to use the server-side Jev integration";
  }
}

const OUTCOME_PRESENTATIONS = Object.freeze({
  entry_granted: {
    title: "Car park access granted",
    code: "South gate open",
    copy: "Arthur opens the car-park gate. Report to Guard Tower 04 with the original documents.",
    door: "Open"
  },
  refused: {
    title: "Access refused",
    code: "Visitor departed",
    copy: "Arthur keeps the car-park gate closed as you leave.",
    door: "Denied"
  },
  expelled: {
    title: "Link terminated",
    code: "Leave property",
    copy: "Arthur cuts the intercom and orders you away from the entrance.",
    door: "Secured"
  },
  locked_out: {
    title: "Security lockdown",
    code: "Perimeter sealed",
    copy: "Arthur seals the entrance and records you as an active threat.",
    door: "Sealed"
  }
});

function resetGateFeed() {
  gateRunId += 1;
  if (gateAnimationTimer !== null) clearTimeout(gateAnimationTimer);
  gateAnimationTimer = null;
  elements.gateFeed.src = "assets/gates/gate-closed.webp";
  elements.gateFeed.alt = "Closed warehouse car-park gate at night";
  elements.gateAnimationStatus.textContent = "Locked";
  elements.gateBarrierState.textContent = "Secured";
  elements.gateFrame.classList.remove("is-opening", "is-open");
}

function playGateOpening() {
  const runId = ++gateRunId;
  if (gateAnimationTimer !== null) clearTimeout(gateAnimationTimer);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  elements.gateFrame.classList.remove("is-open");
  elements.gateAnimationStatus.textContent = reducedMotion ? "Open" : "Opening";
  elements.gateBarrierState.textContent = reducedMotion ? "Open" : "Moving";
  elements.gateFeed.alt = "Warehouse car-park gate opening at night";

  if (reducedMotion) {
    elements.gateFeed.src = "assets/gates/gate-open.webp";
    elements.gateFrame.classList.add("is-open");
    elements.doorStatus.textContent = "Open";
    return;
  }

  elements.outcome.hidden = true;
  elements.gateFrame.classList.add("is-opening");
  elements.gateFeed.src = `assets/gates/gate-opening.webp?run=${runId}`;
  elements.doorStatus.textContent = "Opening";
  gateAnimationTimer = setTimeout(() => {
    if (runId !== gateRunId) return;
    elements.gateFeed.src = "assets/gates/gate-open.webp";
    elements.gateFeed.alt = "Open warehouse car-park gate at night";
    elements.gateAnimationStatus.textContent = "Open";
    elements.gateBarrierState.textContent = "Open";
    elements.gateFrame.classList.remove("is-opening");
    elements.gateFrame.classList.add("is-open");
    elements.doorStatus.textContent = "Open";
    elements.outcome.hidden = false;
    gateAnimationTimer = null;
  }, 1750);
}

function renderOutcome(outcome = "active") {
  elements.outcome.className = "outcome";
  const presentation = OUTCOME_PRESENTATIONS[outcome];

  if (presentation) {
    const title = document.createElement("strong");
    title.className = "outcome-title";
    title.textContent = presentation.title;
    const code = document.createElement("span");
    code.className = "outcome-code";
    code.textContent = presentation.code;
    const copy = document.createElement("p");
    copy.textContent = presentation.copy;
    const reset = document.createElement("small");
    reset.textContent = "Reset link to try another approach";

    elements.outcome.classList.add(`outcome--${outcome.replaceAll("_", "-")}`);
    elements.outcome.replaceChildren(title, code, copy, reset);
    elements.outcome.hidden = false;
    if (outcome === "entry_granted") playGateOpening();
    else {
      resetGateFeed();
      elements.doorStatus.textContent = presentation.door;
    }
  } else {
    resetGateFeed();
    elements.outcome.hidden = true;
    elements.outcome.replaceChildren();
    elements.doorStatus.textContent = "Locked";
  }

  const ended = Boolean(presentation);
  elements.input.disabled = ended;
  elements.sendButton.disabled = ended;
  elements.inputHint.textContent = ended
    ? "The conversation has ended. Reset the scenario to play again."
    : "Enter to transmit · 280 character limit";
}

async function playBootSequence() {
  const runId = ++bootRunId;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stepDelay = reducedMotion ? 20 : 260;
  const steps = [
    ["CHECKING HARDLINE CARRIER...", 18],
    ["AUTHENTICATING CAMERAS 04-A / 04-B...", 43],
    ["OPENING GUARD TOWER AUDIO CHANNEL...", 68],
    ["SYNCING NIGHT WATCH TERMINAL...", 86],
    ["SECURITY LINK ESTABLISHED", 100]
  ];

  elements.bootSequence.hidden = false;
  elements.input.disabled = true;
  elements.sendButton.disabled = true;
  elements.linkStatus.textContent = "Booting";
  elements.bootProgressFill.style.width = "0%";

  for (const [message, progress] of steps) {
    if (runId !== bootRunId) return;
    elements.bootMessage.textContent = message;
    elements.bootProgressFill.style.width = `${progress}%`;
    await delay(stepDelay);
  }

  if (runId !== bootRunId) return;
  elements.bootSequence.hidden = true;
  elements.linkStatus.textContent = "Ready";
  elements.input.disabled = false;
  elements.sendButton.disabled = false;
  elements.input.focus();
}

function updateStageScale() {
  const scale = calculateStageScale(window.innerWidth, window.innerHeight);

  document.documentElement.style.setProperty("--stage-scale", String(scale));
  elements.stageMount.style.width = `${LOGICAL_STAGE_WIDTH * scale}px`;
  elements.stageMount.style.height = `${LOGICAL_STAGE_HEIGHT * scale}px`;
}

function openDebug() {
  if (elements.debugDialog.open) return;
  if (elements.creditsDialog.open) elements.creditsDialog.close();
  focusBeforeDebug = document.activeElement;
  elements.debugDialog.showModal();
  elements.debugClose.focus();
}

function closeDebug() {
  if (elements.debugDialog.open) elements.debugDialog.close();
}

function exportConversationLog() {
  if (!game) return;

  const exportedAt = new Date();
  const payload = {
    ...game.getConversationLog(),
    exportedAt: exportedAt.toISOString(),
    runtime: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
    }
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json"
  });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = exportedAt.toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");

  link.href = downloadUrl;
  link.download = `arthur-conversation-${timestamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);

  const entries = payload.entries.length;
  elements.debugLogStatus.textContent = `Saved ${entries}`;
}

function openCredits() {
  if (elements.creditsDialog.open) return;
  if (elements.debugDialog.open) elements.debugDialog.close();
  focusBeforeCredits = document.activeElement;
  elements.creditsDialog.showModal();
  elements.creditsClose.focus();
}

function closeCredits() {
  if (elements.creditsDialog.open) elements.creditsDialog.close();
}

function renderInitialScene() {
  replayRunId += 1;
  speechDirector.cancel();
  performanceController.reset();
  lastPerformance = null;
  elements.conversation.replaceChildren();
  elements.playerMessage.textContent = "Awaiting transmission.";
  appendMessage("arthur", game.getOpeningDialogue());
  renderDebug(game.getSnapshot());
  renderOutcome(game.outcome);
  elements.input.value = "";
  playBootSequence();
}

function setBusy(isBusy) {
  const ended = game.status !== "active";
  elements.input.disabled = ended || isBusy;
  elements.sendButton.disabled = ended || isBusy;
  elements.sendButton.querySelector("span").textContent =
    isBusy && !ended ? "Wait" : "Send";
  elements.replayButton.disabled = isBusy || !lastPerformance;
}

async function replayLastLine() {
  if (!lastPerformance || elements.replayButton.disabled) return;

  const runId = ++replayRunId;
  elements.replayButton.disabled = true;
  speechDirector.prepare();
  await periodAudio.resume();
  periodAudio.playRelay();
  activeArthurFrame.classList.add("is-speaking");

  await speechDirector.deliver(lastPerformance, {
    onStart: ({ mode, engine }) => {
      portraitAnimator.startTalking();
      elements.voiceLamp.classList.toggle("lamp--on", mode === "speech");
      renderVoiceEngine(engine);
    },
    onEnd: () => {
      elements.voiceLamp.classList.remove("lamp--on");
      portraitAnimator.show(lastPerformance.portraitCue);
    }
  });

  if (runId !== replayRunId) return;
  activeArthurFrame.classList.remove("is-speaking");
  renderPerformancePhase({
    phase: performanceController.phase,
    performance: performanceController.currentPerformance
  });
  elements.replayButton.disabled = false;
}

async function handleSubmit(event) {
  event.preventDefault();
  const input = elements.input.value.trim();
  if (!input || !game || game.status !== "active") return;

  replayRunId += 1;
  speechDirector.cancel();
  speechDirector.prepare();
  await periodAudio.resume();
  periodAudio.startAmbience();
  periodAudio.playInterfaceClick();
  setBusy(true);
  elements.input.value = "";
  performanceController.beginDecision();

  try {
    const turn = await game.takeTurn(input);
    appendMessage("player", turn.playerInput);
    appendMessage("arthur", turn.dialogue, turn.decision.action);
    lastPerformance = turn.npcPerformance;
    clearProviderStatus();
    renderDebug(game.getSnapshot());
    const presentation = await performanceController.play(turn.npcPerformance);
    if (!presentation.cancelled) renderOutcome(turn.outcome);
  } catch (error) {
    performanceController.failDecision();
    const snapshot = game.getSnapshot();
    renderDebug(snapshot);

    if (snapshot.lastProviderError) {
      const failedProvider = providers[snapshot.lastProviderId]?.label ?? snapshot.lastProviderId;
      elements.providerStatus.textContent =
        `${failedProvider} failed: ${snapshot.lastProviderError} No turn was consumed.`;
      elements.providerStatus.hidden = false;
      elements.inputHint.textContent =
        "The provider failed. Your message is still here; check the Jev server and try again.";
    } else {
      elements.inputHint.textContent = error.message;
    }

    elements.input.value = input;
  } finally {
    setBusy(false);
    if (game.status === "active") elements.input.focus();
  }
}

async function initialise() {
  try {
    const [npcResponse, dialogueResponse] = await Promise.all([
      fetch("data/arthur.json"),
      fetch("data/dialogue.json"),
      refreshJevStatus()
    ]);

    if (!npcResponse.ok || !dialogueResponse.ok) {
      throw new Error("Could not load Arthur's data. Run the game through a local server.");
    }

    const [npcTemplate, loadedDialogue] = await Promise.all([
      npcResponse.json(),
      dialogueResponse.json()
    ]);

    dialogueData = loadedDialogue;
    game = new Game({
      npcTemplate,
      dialogueData,
      provider: chooseJevAction,
      providerId: "jev",
      random: Math.random
    });

    renderInitialScene();
  } catch (error) {
    elements.bootSequence.hidden = true;
    elements.linkStatus.textContent = "Offline";
    elements.subtitleSpeaker.textContent = "System / Link failure";
    elements.subtitleText.textContent = error.message;
    elements.playerMessage.textContent = "Connection unavailable.";
    elements.input.disabled = true;
    elements.sendButton.disabled = true;
    elements.providerStatus.textContent = "The encounter data could not be loaded. Restart the local server, then reload this page.";
    elements.providerStatus.hidden = false;
    elements.conversation.textContent = error.message;
  }
}

elements.form.addEventListener("submit", handleSubmit);
elements.input.addEventListener("input", () => {
  performanceController.setPlayerTyping(Boolean(elements.input.value.trim()));
});
elements.effectsToggle.addEventListener("click", () => {
  const enabled = elements.effectsToggle.getAttribute("aria-pressed") === "true";
  document.body.classList.toggle("effects-off", enabled);
  elements.effectsToggle.setAttribute("aria-pressed", String(!enabled));
  elements.effectsToggle.textContent = enabled ? "FX Off" : "FX On";
});
elements.audioToggle.addEventListener("click", async () => {
  const enabled = elements.audioToggle.getAttribute("aria-pressed") === "true";
  const muted = enabled;
  speechDirector.setMuted(muted);
  periodAudio.setMuted(muted);
  elements.audioToggle.setAttribute("aria-pressed", String(!muted));
  elements.audioToggle.textContent = muted ? "Audio off" : "Audio on";
  elements.voiceLamp.classList.remove("lamp--on");

  if (!muted) {
    speechDirector.prepare();
    await periodAudio.resume();
    periodAudio.startAmbience();
    periodAudio.playInterfaceClick();
    renderVoiceEngine("espeak-wasm");
  } else {
    renderVoiceEngine("muted");
  }
});
elements.volumeControl.addEventListener("input", () => {
  const volume = Number(elements.volumeControl.value);
  speechDirector.setVolume(volume);
  periodAudio.setVolume(volume);
  elements.volumeControl.setAttribute("aria-valuetext", `${Math.round(volume * 100)} percent`);
});
elements.replayButton.addEventListener("click", replayLastLine);
elements.skipButton.addEventListener("click", () => {
  speechDirector.cancel();
  performanceController.skip();
});
elements.debugOpen.addEventListener("click", openDebug);
elements.debugClose.addEventListener("click", closeDebug);
elements.debugExport.addEventListener("click", exportConversationLog);
elements.debugDialog.addEventListener("close", () => {
  if (focusBeforeDebug instanceof HTMLElement) focusBeforeDebug.focus();
});
elements.creditsOpen.addEventListener("click", openCredits);
elements.creditsClose.addEventListener("click", closeCredits);
elements.creditsDialog.addEventListener("close", () => {
  if (focusBeforeCredits instanceof HTMLElement) focusBeforeCredits.focus();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "F2") return;
  event.preventDefault();
  if (elements.debugDialog.open) closeDebug();
  else openDebug();
});
window.addEventListener("resize", updateStageScale);
elements.providerSelect.addEventListener("change", () => {
  selectProvider(elements.providerSelect.value);
  clearProviderStatus();
});
elements.resetButton.addEventListener("click", () => {
  replayRunId += 1;
  speechDirector.cancel();
  performanceController.reset();
  game.reset();
  clearProviderStatus();
  renderInitialScene();
});

updateStageScale();
initialise();
