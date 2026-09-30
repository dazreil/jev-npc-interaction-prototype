import { PlaySession, bindUiKeys } from "/js/engine/session.js";
import { createSound } from "/js/engine/sound.js";
import { chooseNpcAction as chooseJevAction } from "/js/providers/jev.js";
import { chooseNpcAction as chooseMockAction } from "/js/providers/mock.js";

const $ = (selector) => document.querySelector(selector);
const STATE_KEYS = ["trust", "suspicion", "irritation", "fear"];

let previewUi = new URLSearchParams(location.search).get("ui");
const playing = () => $("#play-mode").checked;

function log(text) {
  const item = document.createElement("li");
  item.textContent = text;
  $("#log").prepend(item);
}

const [vault, npcTemplate, dialogueData] = await Promise.all(
  ["/vault.json", "/data/arthur.json", "/data/dialogue.json"].map((url) =>
    fetch(url, { cache: "no-store" }).then((response) => response.json())
  )
);
const sound = createSound({
  onProgress: ({ loaded, total }) => {
    if (total > 0) $("#play-status").textContent = loaded < total ? `Loading Arthur's voice… ${Math.round((loaded / total) * 100)}%` : "";
  }
});
const session = new PlaySession({
  sound,
  vault,
  npcTemplate,
  dialogueData,
  providers: { mock: chooseMockAction, jev: chooseJevAction },
  providerId: $("#provider-select").value,
  onChange: (options) => {
    buildControls();
    render(options);
  },
  onLog: log
});

function buildControls() {
  const world = session.world;
  $("#state-controls").replaceChildren(
    ...STATE_KEYS.map((key) => {
      const row = document.createElement("label");
      row.className = "slider";
      row.innerHTML = `<span>${key}</span><input type="range" min="0" max="100" /><span></span>`;
      const input = row.querySelector("input");
      input.value = world.state[key];
      row.lastElementChild.textContent = world.state[key];
      input.addEventListener("input", () => {
        world.state[key] = Number(input.value);
        if (session.game) session.game.npc.state[key] = Number(input.value);
        row.lastElementChild.textContent = input.value;
        render();
      });
      return row;
    })
  );

  const toggle = (label, checked, onChange) => {
    const row = document.createElement("label");
    row.className = "check";
    row.innerHTML = `<input type="checkbox" /> ${label}`;
    const box = row.querySelector("input");
    box.checked = checked;
    box.addEventListener("change", () => {
      onChange(box.checked);
      render();
    });
    return row;
  };
  const objects = session.notesOfType("object").map((object) => object.id);
  $("#flag-controls").replaceChildren(
    ...objects.map((id) => toggle(`open.${id}`, Boolean(world.open?.[id]), (on) => (world.open = { ...world.open, [id]: on }))),
    ...Object.keys(world.flag).map((flag) => toggle(`flag.${flag}`, world.flag[flag], (on) => (world.flag[flag] = on))),
    ...Object.keys(world.item).map((item) =>
      toggle(`item.${item} = shown`, world.item[item] === "shown", (on) => (world.item[item] = on ? "shown" : "held"))
    )
  );
}

function fillSelects() {
  const uiSelect = $("#ui-select");
  const uis = session.notesOfType("ui");
  if (!uis.some((ui) => ui.id === previewUi)) previewUi = uis[0]?.id ?? null;
  uiSelect.replaceChildren(...uis.map((ui) => new Option(ui.props.title ?? ui.id, ui.id)));
  uiSelect.value = previewUi ?? "";

  const profileSelect = $("#profile-select");
  const chosen = profileSelect.value;
  const profiles = session.notesOfType("profile");
  profileSelect.replaceChildren(...profiles.map((profile) => new Option(`${profile.id} — ${profile.props.label}`, profile.id)));
  profileSelect.value = profiles.some((profile) => profile.id === chosen) ? chosen : profiles[0]?.id ?? "";
}

function showProblems(problems) {
  $("#problems-section").hidden = problems.length === 0;
  $("#problems").replaceChildren(
    ...problems.map((problem) => {
      const item = document.createElement("li");
      item.textContent = problem;
      return item;
    })
  );
}

function render({ focusInput = false } = {}) {
  const wrap = $(".stage-wrap");
  const { note, problems } = session.render($("#stage"), {
    uiId: playing() ? null : previewUi,
    previewSlots: $("#show-slots").checked,
    focusInput,
    maxWidth: wrap.clientWidth - 48,
    maxHeight: wrap.clientHeight - 48
  });
  $("#ui-select").disabled = playing();
  $("#ui-label").textContent = playing() ? `Playing screen: ${session.world.screen}` : "UI note";
  if (note) $("#open-note").href = `obsidian://open?vault=game&file=${encodeURIComponent(note.path.replace(/\.md$/, ""))}`;
  $("#play-status").textContent = session.status;
  $("#play-status").classList.toggle("error", Boolean(session.status));
  showProblems(problems);
}

function restart() {
  $("#log").replaceChildren();
  session.status = "";
  session.start({ profileId: $("#profile-select").value, play: playing() });
  if (playing()) log(`Arthur is the "${session.game.characterProfile.id}" profile. Click the intercom (or press C).`);
  buildControls();
  render();
}

fillSelects();
const jevReady = await fetch("/api/jev/status").then((response) => response.json()).catch(() => ({}));
if (!jevReady.configured) $("#provider-select option[value=jev]").textContent = "Jev (no key in .env)";
restart();
bindUiKeys($("#stage"));

$("#ui-select").addEventListener("change", (event) => {
  previewUi = event.target.value;
  history.replaceState(null, "", `?ui=${encodeURIComponent(previewUi)}`);
  render();
});
$("#profile-select").addEventListener("change", restart);
$("#play-mode").addEventListener("change", restart);
$("#provider-select").addEventListener("change", () => {
  session.setProvider($("#provider-select").value);
  log(`Arthur now decides with ${$("#provider-select").value}.`);
});
$("#show-slots").addEventListener("change", () => render());
$("#sound-on").addEventListener("change", (event) => sound.setMuted(!event.target.checked));
$("#reset").addEventListener("click", restart);
window.addEventListener("resize", () => render());

new EventSource("/events").onmessage = async () => {
  session.setVault(await (await fetch("/vault.json", { cache: "no-store" })).json());
  fillSelects();
  render();
  const live = $("#live");
  live.classList.add("flash");
  live.textContent = "● updated";
  setTimeout(() => {
    live.classList.remove("flash");
    live.textContent = "● live";
  }, 1200);
};
