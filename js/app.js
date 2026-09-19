import { Game, MAX_MEMORIES } from "./game.js";
import { determineTone } from "./npc.js";
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

const STATIC_PORTRAIT = "assets/arthur-portrait.jpg";
const SPEAKING_PORTRAIT = "assets/arthur-speaking.gif";
const PLAYER_PORTRAIT = "assets/player-shadow.jpg";
const SPEAKING_DURATION_MS = 920;

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
  resetButton: document.querySelector("#reset-button")
};

let game;
let dialogueData;
let portraitAnimationTimer;
let portraitAnimationSequence = 0;
let activeArthurPortrait;
let activeArthurFrame;

function animateArthurPortrait(portrait, frame) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  window.clearTimeout(portraitAnimationTimer);

  if (activeArthurPortrait && activeArthurPortrait !== portrait) {
    activeArthurPortrait.src = STATIC_PORTRAIT;
    activeArthurFrame.classList.remove("is-speaking");
  }

  activeArthurPortrait = portrait;
  activeArthurFrame = frame;
  portraitAnimationSequence += 1;
  frame.classList.add("is-speaking");
  portrait.src = `${SPEAKING_PORTRAIT}?reply=${portraitAnimationSequence}`;

  portraitAnimationTimer = window.setTimeout(() => {
    portrait.src = STATIC_PORTRAIT;
    frame.classList.remove("is-speaking");
  }, SPEAKING_DURATION_MS);
}

function appendMessage(speaker, text, action = null) {
  const article = document.createElement("article");
  article.className = `message message--${speaker}`;
  if (action) article.dataset.action = action;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";

  const avatarImage = document.createElement("img");
  avatarImage.width = 360;
  avatarImage.height = speaker === "arthur" ? 480 : 360;
  avatarImage.src = speaker === "arthur" ? STATIC_PORTRAIT : PLAYER_PORTRAIT;
  avatarImage.alt =
    speaker === "arthur"
      ? "Arthur, the warehouse security guard"
      : "Anonymous player silhouette";
  avatar.append(avatarImage);

  const body = document.createElement("div");
  body.className = "message-body";

  const label = document.createElement("span");
  label.className = "message-speaker";
  label.textContent = speaker === "arthur" ? "Arthur" : "You";

  const copy = document.createElement("p");
  copy.className = "message-text";
  copy.textContent = text;

  body.append(label, copy);
  article.append(avatar, body);
  elements.conversation.append(article);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;

  if (speaker === "arthur") animateArthurPortrait(avatarImage, avatar);
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

function renderOutcome(status) {
  elements.outcome.classList.remove("outcome--failure");

  if (status === "success") {
    elements.outcome.textContent = "Arthur unlocks the warehouse door.\n\nYou are inside.";
    elements.outcome.hidden = false;
  } else if (status === "failure") {
    elements.outcome.textContent =
      "Arthur turns away and refuses to continue the conversation.\n\nReset to try again.";
    elements.outcome.classList.add("outcome--failure");
    elements.outcome.hidden = false;
  } else {
    elements.outcome.hidden = true;
    elements.outcome.textContent = "";
  }

  const ended = status !== "active";
  elements.input.disabled = ended;
  elements.sendButton.disabled = ended;
  elements.inputHint.textContent = ended
    ? "The conversation has ended. Reset the scenario to play again."
    : "Enter to send · 280 characters maximum";
}

function renderInitialScene() {
  elements.conversation.replaceChildren();
  appendMessage("arthur", dialogueData.opening);
  renderDebug(game.getSnapshot());
  renderOutcome("active");
  elements.input.value = "";
  elements.input.focus();
}

function setBusy(isBusy) {
  const ended = game.status !== "active";
  elements.input.disabled = ended || isBusy;
  elements.sendButton.disabled = ended || isBusy;
  elements.sendButton.querySelector("span").textContent =
    isBusy && !ended ? "Thinking" : "Speak";
}

async function handleSubmit(event) {
  event.preventDefault();
  const input = elements.input.value.trim();
  if (!input || !game || game.status !== "active") return;

  setBusy(true);
  elements.input.value = "";

  try {
    const turn = await game.takeTurn(input);
    appendMessage("player", turn.playerInput);
    appendMessage("arthur", turn.dialogue, turn.decision.action);
    clearProviderStatus();
    renderDebug(game.getSnapshot());
    renderOutcome(turn.status);
  } catch (error) {
    const snapshot = game.getSnapshot();
    renderDebug(snapshot);

    if (snapshot.lastProviderError) {
      const failedProvider = providers[snapshot.lastProviderId]?.label ?? snapshot.lastProviderId;
      selectProvider("mock");
      elements.providerStatus.textContent =
        `${failedProvider} failed: ${snapshot.lastProviderError} Switched back to Mock; no turn was consumed.`;
      elements.providerStatus.hidden = false;
      elements.inputHint.textContent =
        "The provider failed. Your message is still here and can be sent with Mock.";
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
      provider: chooseMockAction,
      providerId: "mock"
    });

    renderInitialScene();
  } catch (error) {
    elements.form.hidden = true;
    elements.conversation.textContent = error.message;
  }
}

elements.form.addEventListener("submit", handleSubmit);
elements.providerSelect.addEventListener("change", () => {
  selectProvider(elements.providerSelect.value);
  clearProviderStatus();
});
elements.resetButton.addEventListener("click", () => {
  game.reset();
  clearProviderStatus();
  renderInitialScene();
});

initialise();
