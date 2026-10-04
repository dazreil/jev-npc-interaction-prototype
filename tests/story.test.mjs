import assert from "node:assert/strict";
import test from "node:test";
import { SceneRunner, checkScene } from "../js/engine/story.js";

const sketch = {
  id: "chloe-sketch",
  with: "Chloe",
  events: [
    { id: "a", type: "line", mood: "uneasy", text: "Can I show you something weird?" },
    { id: "b", type: "narrate", text: "She turns the notebook round." },
    {
      id: "c",
      type: "choice",
      options: [
        { id: "c1", text: "Where did you see him?", events: [{ id: "c1a", type: "line", text: "I didn't." }, { id: "c1b", type: "set", effect: "state trust +10" }] },
        { id: "c2", text: "It's just a drawing.", if: "state.trust < 30", events: [{ id: "c2a", type: "jump", to: "goodbye" }] },
        { id: "c3", text: "Burn it.", if: "state.trust > 90", events: [] }
      ]
    },
    { id: "d", type: "if", if: "state.trust >= 30", then: [{ id: "d1", type: "line", text: "You believe me." }], else: [{ id: "d2", type: "line", text: "Never mind." }] },
    { id: "e", type: "talk", until: "flag.chloe-asked" },
    { id: "f", type: "label", name: "goodbye" },
    { id: "g", type: "line", text: "Lunch tomorrow?" },
    { id: "h", type: "end", then: "close" }
  ]
};

function play(trust = 25) {
  const world = { state: { trust }, flag: {} };
  const applied = [];
  const runner = new SceneRunner(sketch, {
    view: () => world,
    apply: (effect, who) => {
      applied.push([effect, who]);
      const match = effect.match(/^state (\w+) \+(\d+)$/);
      if (match) world.state[match[1]] += Number(match[2]);
    }
  });
  return { runner, world, applied };
}

test("a scene plays line by line, and a choice shows only the options whose condition holds", () => {
  const { runner, applied } = play();
  assert.deepEqual(runner.start(), { type: "line", who: "Chloe", mood: "uneasy", text: "Can I show you something weird?", id: "a" });
  assert.equal(runner.step().type, "narrate");
  const choice = runner.step();
  assert.deepEqual(choice.options.map((option) => option.text), ["Where did you see him?", "It's just a drawing."], "Burn it. is hidden: trust is not above 90");
  const picked = runner.choose(0);
  assert.equal(picked.text, "Where did you see him?");
  assert.equal(picked.next.text, "I didn't.");
  assert.deepEqual(runner.step(), { type: "line", who: "Chloe", mood: "neutral", text: "You believe me.", id: "d1" }, "the set ran, so trust is now 35 and the if takes its then");
  assert.deepEqual(applied, [["state trust +10", "Chloe"]]);
});

test("free talk waits until its condition holds, a jump skips ahead, and the end says what to do next", () => {
  const { runner, world } = play();
  runner.start("e");
  assert.equal(runner.waiting.type, "talk");
  assert.equal(runner.talkDone(), false);
  world.flag["chloe-asked"] = true;
  assert.equal(runner.talkDone(), true);
  assert.equal(runner.step().text, "Lunch tomorrow?");
  assert.deepEqual(runner.step(), { type: "end", outcome: null, then: "close", id: "h" });
  assert.equal(runner.done, true);

  const second = play();
  second.runner.start("c");
  const next = second.runner.choose(1).next;
  assert.equal(next.text, "Lunch tomorrow?", "the jump to goodbye skips the if and the talk");
});

test("Play from here starts inside a branch and carries on after it", () => {
  const { runner } = play(50);
  assert.equal(runner.start("d2").text, "Never mind.");
  assert.equal(runner.step().type, "talk", "after the branch, the scene goes on with the next block");

  const done = play(50);
  done.world.flag["chloe-asked"] = true;
  assert.equal(done.runner.start("e").text, "Lunch tomorrow?", "a free talk whose condition already holds is skipped");
});

test("the scene check finds broken jumps, unknown people and moods, and bad conditions", () => {
  const broken = {
    id: "broken",
    with: "Chloe",
    events: [
      { id: "x", type: "line", who: "Zed", text: "Hi" },
      { id: "y", type: "line", mood: "furious", text: "Hmm" },
      { id: "z", type: "jump", to: "nowhere" },
      { id: "w", type: "if", if: "state.trust >>> 3", then: [], else: [] },
      { id: "v", type: "set", effect: "wiggle the cat" },
      { id: "v", type: "end", outcome: "no-such-ending" }
    ]
  };
  const problems = checkScene(broken, { characters: ["Chloe"], moods: { Chloe: ["uneasy", "excited"] }, outcomes: ["dream-resisted"] });
  for (const expected of [/no character "Zed"/, /Chloe has no mood "furious"/, /no label "nowhere"/, /bad condition/, /bad effect "wiggle the cat"/, /two blocks with id "v"/, /no outcome "no-such-ending"/]) {
    assert.ok(problems.some((problem) => expected.test(problem)), `${expected} in ${JSON.stringify(problems)}`);
  }
  assert.deepEqual(checkScene(sketch, { characters: ["Chloe"], moods: { Chloe: ["uneasy"] } }), [], "a good scene has no problems");
});
