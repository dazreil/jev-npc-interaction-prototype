import { Game, MAX_MEMORIES } from "./game.js";
import { PeriodAudio } from "./audio.js";
import { determineTone } from "./npc.js";
import { PERFORMANCE_PHASES, PerformanceController } from "./performance.js";
import { PortraitAnimator, PORTRAIT_ASSETS } from "./portrait.js";
import {
  BrowserSpeechAdapter,
  ESpeakWasmAdapter,
  PiperSpeechAdapter,
  SpeechDirector
} from "./speech.js";
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
  bootChecks: document.querySelector("#boot-checks"),
  audioToggleLabel: document.querySelector("#audio-toggle-label"),
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
  stage: document.querySelector("#terminal-stage"),
  intercomView: document.querySelector("#intercom-view"),
  intercomBack: document.querySelector("#intercom-back"),
  intercomHotspot: document.querySelector("#intercom-hotspot"),
  gateHotspot: document.querySelector("#gate-hotspot"),
  walkHotspot: document.querySelector("#walk-hotspot"),
  idCardButton: document.querySelector("#id-card-button"),
  idCardView: document.querySelector("#id-card-view"),
  idCardClose: document.querySelector("#id-card-close"),
  idCardPutAway: document.querySelector("#id-card-put-away"),
  idCardShow: document.querySelector("#id-card-show"),
  pauseDialog: document.querySelector("#pause-dialog"),
  pauseOpen: document.querySelector("#pause-open"),
  pauseResume: document.querySelector("#pause-resume"),
  objectMenu: document.querySelector("#object-menu"),
  objectiveStatus: document.querySelector("#objective-status"),
  towerArrival: document.querySelector("#tower-arrival"),
  towerBack: document.querySelector("#tower-back"),
  arthurPortrait: document.querySelector("#arthur-portrait"),
  arthurFrame: document.querySelector("#arthur-frame"),
  phaseLabel: document.querySelector("#phase-label"),
  linkStatus: document.querySelector("#link-status"),
  doorStatus: document.querySelector("#gate-animation-status"),
  gateFeed: document.querySelector("#gate-feed"),
  gateOpenFeed: document.querySelector("#gate-open-feed"),
  gateFrame: document.querySelector("#gate-frame"),
  gateAnimationStatus: document.querySelector("#gate-animation-status"),
  gateBarrierState: document.querySelector("#gate-barrier-state"),
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
let playtestSessionId = createPlaytestSessionId();
let playtestLogQueue = Promise.resolve();
const periodAudio = new PeriodAudio();
const browserSpeech = new BrowserSpeechAdapter();
const espeakSpeech = new ESpeakWasmAdapter({
  fallback: browserSpeech,
  contextFactory: () => {
    periodAudio.ensureContext();
    return periodAudio.context;
  }
});
const speechDirector = new SpeechDirector({
  adapter: new PiperSpeechAdapter({
    fallback: espeakSpeech,
    contextFactory: () => {
      periodAudio.ensureContext();
      return periodAudio.context;
    },
    onProgress: ({ loaded, total }) => {
      if (!(total > 0) || elements.bootSequence.hidden) return;
      const percent = Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
      elements.linkStatus.textContent = `Voice ${percent}%`;
      elements.linkStatus.title = `Gatehouse link: calibrating neural voice ${percent}%`;
      setBootCheckStatus("voice", `${percent}%`, "busy");
      elements.bootProgressFill.style.width = `${40 + Math.round(percent * 0.58)}%`;
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

    periodAudio.playIntercomKeyUp();
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
    activeArthurPortrait.alt = PORTRAIT_ALT[cue] ?? PORTRAIT_ALT.neutral;
    // Four fixed-camera mouth plates provide the speech motion; the intercom
    // filter and stepped signal jitter remain presentation-only effects.
    if (activeArthurPortrait.getAttribute("src") !== src) activeArthurPortrait.src = src;
    activeArthurFrame.dataset.portraitCue = cue;
    activeArthurFrame.classList.toggle("is-glitching", glitch);
  },
  reducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  autoTalk: false
});

function renderVoiceEngine(engine) {
  const labels = {
    piper: "NEURAL",
    "espeak-wasm": "WASM",
    "web-speech": "Browser",
    timed: "Silent",
    muted: "Muted"
  };
  elements.voiceEngine.textContent = labels[engine] ?? "NEURAL";
  elements.voiceEngine.title =
    engine === "piper"
      ? "Piper neural voice running locally through WebAssembly"
      : engine === "espeak-wasm"
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
  const stickToLatest = elements.conversation.scrollHeight - elements.conversation.scrollTop - elements.conversation.clientHeight < 48;
  const article = document.createElement("article");
  article.className = `message message--${speaker}`;
  if (action) article.dataset.action = action;

  const label = document.createElement("span");
  label.className = "message-speaker";
  label.textContent = speaker === "arthur" ? "Arthur" : speaker === "player" ? "You" : "System";

  const copy = document.createElement("p");
  copy.className = "message-text";
  copy.textContent = text;

  article.append(label, copy);
  elements.conversation.append(article);
  if (stickToLatest) elements.conversation.scrollTop = elements.conversation.scrollHeight;
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

/** What Arthur's face is doing, so the performance reaches a screen reader too. */
const PORTRAIT_ALT = Object.freeze({
  neutral: "Arthur watching the gate camera, unreadable",
  blink: "Arthur watching the gate camera, unreadable",
  listening: "Arthur leaning toward the intercom, listening",
  suspicious: "Arthur narrowing his eyes, unconvinced",
  irritated: "Arthur jaw set, patience thinning",
  hostile: "Arthur squared up to the camera, hostile",
  friendly: "Arthur's face easing, warmer",
  afraid: "Arthur drawing back from the camera, alarmed",
  dismissive: "Arthur turning away, done with the exchange",
  "entry-granted": "Arthur reaching for the gate release",
  "talk-a": "Arthur speaking",
  "talk-b": "Arthur speaking",
  "talk-c": "Arthur speaking",
  "talk-d": "Arthur speaking"
});

const OUTCOME_PRESENTATIONS = Object.freeze({
  entry_granted: {
    title: "Car park access granted",
    code: "South gate open",
    copy: "Arthur opens the car-park gate. Report directly to Guard Tower 04.",
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
  },
  exposed: {
    title: "Cover exposed",
    code: "Company check failed",
    copy: "The company has no record of sending you. Arthur keeps the gate shut.",
    door: "Denied"
  }
});

let menuReturnFocus = null;
let returnToPause = false;

function setSceneView(view) {
  closeObjectMenu(false);
  closeIdCard(false);
  elements.stage.dataset.view = view;
  elements.intercomView.hidden = view !== "intercom";
  elements.towerArrival.hidden = view !== "approach";
  if (view === "intercom" && !elements.input.disabled) elements.input.focus();
}

function openIdCard() {
  closeObjectMenu(false);
  elements.idCardShow.disabled = elements.stage.dataset.view !== "intercom" || !game || game.status !== "active" || game.fakeIdShown;
  elements.idCardShow.textContent = game?.fakeIdShown ? "Already shown" : "Show Arthur";
  elements.idCardView.hidden = false;
  elements.idCardClose.focus();
}

function closeIdCard(restoreFocus = true) {
  if (elements.idCardView.hidden) return;
  elements.idCardView.hidden = true;
  if (restoreFocus) elements.idCardButton.focus();
}

function closeObjectMenu(restoreFocus = true) {
  if (elements.objectMenu.hidden) return;
  elements.objectMenu.hidden = true;
  elements.objectMenu.replaceChildren();
  if (restoreFocus && menuReturnFocus instanceof HTMLElement) menuReturnFocus.focus();
  menuReturnFocus = null;
}

function showObjectMenu(title, actions, trigger) {
  closeObjectMenu(false);
  menuReturnFocus = trigger;
  const heading = document.createElement("strong");
  heading.textContent = title;
  elements.objectMenu.append(heading);
  for (const [label, action] of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = `> ${label}`;
    button.addEventListener("click", () => {
      closeObjectMenu(false);
      action();
    });
    elements.objectMenu.append(button);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("role", "menuitem");
  close.textContent = "> Back";
  close.addEventListener("click", () => closeObjectMenu());
  elements.objectMenu.append(close);
  elements.objectMenu.hidden = false;
  elements.objectMenu.querySelector("button").focus();
}

function showFakeId() {
  if (!game || game.status !== "active") return;
  const event = game.presentFakeId();
  if (!event) return;
  appendMessage("player", event.playerInput);
  appendMessage("arthur", event.dialogue, "ASK_FOR_PROOF");
  elements.objectiveStatus.textContent = "Arthur may phone the company";
  elements.idCardButton.setAttribute("aria-label", "ID card already shown to Arthur");
  renderDebug(game.getSnapshot());
  savePlaytestLog();
  if (!elements.input.disabled) elements.input.focus();
}

function resetGateFeed() {
  gateRunId += 1;
  if (gateAnimationTimer !== null) clearTimeout(gateAnimationTimer);
  gateAnimationTimer = null;
  elements.gateFeed.src = "assets/encounter/gate-closed.webp";
  elements.gateFeed.alt = "Closed warehouse car-park gate at night";
  elements.gateAnimationStatus.textContent = "Locked";
  elements.gateBarrierState.textContent = "Secured";
  elements.gateFrame.classList.remove("is-opening", "is-open");
  elements.walkHotspot.hidden = true;
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
    elements.gateFrame.classList.add("is-open");
    elements.doorStatus.textContent = "Open";
    elements.walkHotspot.hidden = false;
    elements.objectiveStatus.textContent = "Proceed to Guard Tower 04";
    return;
  }

  elements.outcome.hidden = true;
  elements.gateFrame.classList.add("is-opening");
  elements.doorStatus.textContent = "Opening";
  gateAnimationTimer = setTimeout(() => {
    if (runId !== gateRunId) return;
    elements.gateFeed.alt = "Open warehouse car-park gate at night";
    elements.gateAnimationStatus.textContent = "Open";
    elements.gateBarrierState.textContent = "Open";
    elements.gateFrame.classList.remove("is-opening");
    elements.gateFrame.classList.add("is-open");
    elements.walkHotspot.hidden = false;
    elements.doorStatus.textContent = "Open";
    elements.objectiveStatus.textContent = "Proceed to Guard Tower 04";
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
    setSceneView("gate");
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
  if (ended) setInputHint("ENCOUNTER CLOSED — RESET LINK TO PLAY AGAIN", "warn");
  else setInputHint();
}

const DEFAULT_INPUT_HINT = "Enter to send";

/** Single owner of the hint line so its tone resets when the next turn starts. */
function setInputHint(message = DEFAULT_INPUT_HINT, tone = "default") {
  elements.inputHint.textContent = message;
  elements.inputHint.dataset.tone = tone;
}

const BOOT_CHECKS = Object.freeze([
  { id: "carrier", label: "Hardline carrier", progress: 12 },
  { id: "cameras", label: "Camera 04-A / 04-B", progress: 24 },
  { id: "audio", label: "Guard tower audio channel", progress: 36 }
]);

const TALK_ART = Object.freeze([
  PORTRAIT_ASSETS["talk-b"],
  PORTRAIT_ASSETS["talk-c"],
  PORTRAIT_ASSETS["talk-d"]
]);

async function bufferTalkingFrames() {
  const frames = TALK_ART.map(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
  });
  await Promise.all(frames);
}

/** Adds a self-test row that stays on screen once it has reported. */
function addBootCheck({ id, label }) {
  const row = document.createElement("li");
  row.dataset.check = id;
  row.dataset.state = "busy";

  const name = document.createElement("span");
  name.className = "boot-check-label";
  name.textContent = label;

  const leader = document.createElement("i");
  leader.className = "boot-check-leader";
  leader.setAttribute("aria-hidden", "true");

  const status = document.createElement("b");
  status.className = "boot-check-status";
  status.textContent = "····";

  row.append(name, leader, status);
  elements.bootChecks.append(row);
  return row;
}

function setBootCheckStatus(id, text, state) {
  const row = elements.bootChecks.querySelector(`[data-check="${id}"]`);
  if (!row) return;
  row.dataset.state = state;
  row.querySelector(".boot-check-status").textContent = text;
}

async function playBootSequence() {
  const runId = ++bootRunId;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stepDelay = reducedMotion ? 20 : 260;

  elements.bootSequence.hidden = false;
  elements.bootChecks.replaceChildren();
  elements.input.disabled = true;
  elements.sendButton.disabled = true;
  elements.linkStatus.textContent = "Booting";
  elements.bootMessage.textContent = "Running perimeter self-test";
  elements.bootProgressFill.style.width = "0%";

  for (const check of BOOT_CHECKS) {
    if (runId !== bootRunId) return;
    addBootCheck(check);
    elements.bootProgressFill.style.width = `${check.progress}%`;
    await delay(stepDelay);
    if (runId !== bootRunId) return;
    setBootCheckStatus(check.id, "OK", "ok");
    periodAudio.playInterfaceClick();
  }

  if (runId !== bootRunId) return;
  addBootCheck({ id: "portrait", label: "Intercom video frames" });
  elements.bootMessage.textContent = "Buffering Arthur's video feed";
  const portraitReady = await bufferTalkingFrames().then(() => true, () => false);
  if (runId !== bootRunId) return;
  setBootCheckStatus("portrait", portraitReady ? "OK" : "FALLBACK", portraitReady ? "ok" : "warn");

  if (runId !== bootRunId) return;
  addBootCheck({ id: "voice", label: "Arthur voice model" });
  elements.bootMessage.textContent = "Loading local neural voice";
  elements.linkStatus.textContent = "Voice init";
  elements.bootProgressFill.style.width = "40%";
  const piperReady = await speechDirector.prepare();

  if (runId !== bootRunId) return;
  setBootCheckStatus("voice", piperReady ? "OK" : "FALLBACK", piperReady ? "ok" : "warn");
  elements.bootMessage.textContent = piperReady
    ? "Arthur voice model ready"
    : "Neural voice offline — fallback ready";
  elements.bootProgressFill.style.width = "98%";
  await delay(stepDelay);

  if (runId !== bootRunId) return;
  addBootCheck({ id: "link", label: "Security link" });
  setBootCheckStatus("link", "OK", "ok");
  elements.bootMessage.textContent = "Security link established";
  elements.bootProgressFill.style.width = "100%";
  periodAudio.playRelay();
  await delay(stepDelay);

  if (runId !== bootRunId) return;
  elements.bootSequence.hidden = true;
  elements.linkStatus.textContent = "Ready";
  elements.input.disabled = false;
  elements.sendButton.disabled = false;
  elements.stage.focus({ preventScroll: true });
}

function updateStageScale() {
  const width = Math.min(1280, Math.max(304, window.innerWidth - 16));
  const height = Math.min(720, Math.max(300, window.innerHeight - 16));
  elements.stageMount.style.width = `${width}px`;
  elements.stageMount.style.height = `${height}px`;
}

function openDebug() {
  if (elements.debugDialog.open) return;
  returnToPause = elements.pauseDialog.open;
  if (elements.pauseDialog.open) elements.pauseDialog.close();
  if (elements.creditsDialog.open) elements.creditsDialog.close();
  focusBeforeDebug = document.activeElement;
  elements.debugDialog.showModal();
  elements.debugClose.focus();
}

function closeDebug() {
  if (elements.debugDialog.open) elements.debugDialog.close();
}

function buildConversationLogPayload(exportedAt = new Date()) {
  return {
    sessionId: playtestSessionId,
    ...game.getConversationLog(),
    exportedAt: exportedAt.toISOString(),
    runtime: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches
    }
  };
}

function createPlaytestSessionId() {
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-");
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, "0");
  return `${stamp}-${random}`;
}

/**
 * Saves the whole conversation after every turn, so a playtester never has to
 * export anything. Saves run in order, so the stored copy is always the latest.
 * A missing or failing log store never interrupts the game.
 */
function savePlaytestLog() {
  if (!game) return;
  const body = JSON.stringify(buildConversationLogPayload());
  playtestLogQueue = playtestLogQueue.then(() =>
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // keepalive lets the last save finish if the tab closes, but browsers cap
      // keepalive bodies at 64 KiB.
      keepalive: body.length < 60000
    }).catch(() => {})
  );
}

function exportConversationLog() {
  if (!game) return;

  const exportedAt = new Date();
  const payload = buildConversationLogPayload(exportedAt);
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
  returnToPause = elements.pauseDialog.open;
  if (elements.pauseDialog.open) elements.pauseDialog.close();
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
  elements.objectiveStatus.textContent = "Find a way past Arthur";
  elements.idCardButton.removeAttribute("aria-label");
  setSceneView("gate");
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
  periodAudio.playIntercomKeyUp();
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
  if (!game || game.status !== "active") return;
  if (!input) {
    // The gate answers an empty transmission itself rather than handing the
    // player a browser validation bubble inside the terminal.
    setInputHint("NO CARRIER — TYPE A MESSAGE", "warn");
    periodAudio.playDenied();
    elements.input.focus();
    return;
  }
  setInputHint();

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
    if (game.companyCallPending && game.companyCallTurns > 0) {
      elements.objectiveStatus.textContent = game.companyCallTurns >= 2
        ? "Arthur is reaching for the company line"
        : "Arthur may phone the company";
    }
    lastPerformance = turn.npcPerformance;
    clearProviderStatus();
    renderDebug(game.getSnapshot());
    savePlaytestLog();
    const presentation = await performanceController.play(turn.npcPerformance);
    if (!presentation.cancelled) renderOutcome(turn.outcome);
  } catch (error) {
    performanceController.failDecision();
    const snapshot = game.getSnapshot();
    renderDebug(snapshot);
    savePlaytestLog();

    if (snapshot.lastProviderError) {
      const failedProvider = providers[snapshot.lastProviderId]?.label ?? snapshot.lastProviderId;
      elements.providerStatus.textContent =
        `${failedProvider} failed: ${snapshot.lastProviderError} No turn was consumed.`;
      elements.providerStatus.hidden = false;
      setInputHint("LINK FAULT — YOUR MESSAGE IS INTACT. TRY AGAIN.", "warn");
    } else {
      // A raw exception string is not game copy; the fault strip owns it.
      elements.providerStatus.textContent = `Terminal fault: ${error.message}`;
      elements.providerStatus.hidden = false;
      setInputHint("TERMINAL FAULT — SEE STATUS STRIP", "warn");
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
    elements.conversation.replaceChildren();
    appendMessage("system", error.message);
    elements.input.disabled = true;
    elements.sendButton.disabled = true;
    elements.providerStatus.textContent = "The encounter data could not be loaded. Restart the local server, then reload this page.";
    elements.providerStatus.hidden = false;
  }
}

elements.form.addEventListener("submit", handleSubmit);
elements.gateHotspot.addEventListener("click", () => showObjectMenu("GATE", [
  ["Inspect", () => { elements.objectiveStatus.textContent = "Heavy locked leaves. Arthur controls the release from Tower 04."; }],
  ["Try gate", () => { elements.objectiveStatus.textContent = "Locked. You need Arthur to release it."; periodAudio.playDenied(); }]
], elements.gateHotspot));
elements.intercomHotspot.addEventListener("click", () => showObjectMenu("VIDEO INTERCOM", [
  ["Inspect", () => { elements.objectiveStatus.textContent = "An old two-way video link to Guard Tower 04."; }],
  ["Call Arthur", () => setSceneView("intercom")]
], elements.intercomHotspot));
elements.intercomBack.addEventListener("click", () => setSceneView("gate"));
elements.idCardButton.addEventListener("click", openIdCard);
elements.idCardClose.addEventListener("click", () => closeIdCard());
elements.idCardPutAway.addEventListener("click", () => closeIdCard());
elements.idCardShow.addEventListener("click", () => { closeIdCard(false); showFakeId(); });
elements.walkHotspot.addEventListener("click", () => {
  if (!elements.gateFrame.classList.contains("is-open")) return;
  setSceneView("approach");
  elements.objectiveStatus.textContent = "Proceed to Guard Tower 04";
});
elements.towerBack.addEventListener("click", () => setSceneView("gate"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Tab" && !elements.idCardView.hidden) {
    const buttons = [elements.idCardClose, elements.idCardShow, elements.idCardPutAway].filter((button) => !button.disabled);
    if (event.shiftKey && document.activeElement === buttons[0]) {
      event.preventDefault();
      buttons.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
      event.preventDefault();
      buttons[0].focus();
    }
  }
  if (event.key.toLowerCase() === "i" && elements.bootSequence.hidden && !elements.pauseDialog.open && !elements.debugDialog.open && !elements.creditsDialog.open && document.activeElement !== elements.input) {
    event.preventDefault();
    if (elements.idCardView.hidden) openIdCard();
    else closeIdCard();
  }
  if (event.key === "Escape" && !elements.idCardView.hidden) {
    event.preventDefault();
    closeIdCard();
    return;
  }
  if (event.key === "Escape" && !elements.objectMenu.hidden) {
    event.preventDefault();
    closeObjectMenu();
  }
});
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
  // Writing to the button itself would remove #voice-lamp and #voice-engine,
  // leaving every later render writing to a detached node.
  elements.audioToggleLabel.textContent = muted ? "Audio off" : "Audio";
  elements.voiceLamp.classList.remove("lamp--on");

  if (!muted) {
    speechDirector.prepare();
    await periodAudio.resume();
    periodAudio.startAmbience();
    periodAudio.playInterfaceClick();
    renderVoiceEngine("piper");
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
  if (returnToPause) {
    returnToPause = false;
    elements.pauseDialog.showModal();
    elements.debugOpen.focus();
  } else if (focusBeforeDebug instanceof HTMLElement) focusBeforeDebug.focus();
});
elements.creditsOpen.addEventListener("click", openCredits);
elements.creditsClose.addEventListener("click", closeCredits);
elements.creditsDialog.addEventListener("close", () => {
  if (returnToPause) {
    returnToPause = false;
    elements.pauseDialog.showModal();
    elements.creditsOpen.focus();
  } else if (focusBeforeCredits instanceof HTMLElement) focusBeforeCredits.focus();
});
elements.pauseOpen.addEventListener("click", () => { elements.pauseDialog.showModal(); elements.pauseResume.focus(); });
elements.pauseResume.addEventListener("click", () => elements.pauseDialog.close());
elements.pauseDialog.addEventListener("close", () => {
  if (!elements.debugDialog.open && !elements.creditsDialog.open) elements.pauseOpen.focus();
});
window.addEventListener("resize", updateStageScale);
elements.providerSelect.addEventListener("change", () => {
  selectProvider(elements.providerSelect.value);
  clearProviderStatus();
});
elements.resetButton.addEventListener("click", () => {
  elements.pauseDialog.close();
  replayRunId += 1;
  speechDirector.cancel();
  performanceController.reset();
  game.reset();
  playtestSessionId = createPlaytestSessionId();
  clearProviderStatus();
  renderInitialScene();
});

updateStageScale();
initialise();
