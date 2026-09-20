import assert from "node:assert/strict";
import test from "node:test";

import {
  LOGICAL_STAGE_HEIGHT,
  LOGICAL_STAGE_WIDTH,
  calculateStageScale
} from "../js/layout.js";

test("the 640 by 480 terminal fills the viewport and caps at a crisp 2x scale", () => {
  assert.equal(LOGICAL_STAGE_WIDTH, 640);
  assert.equal(LOGICAL_STAGE_HEIGHT, 480);
  assert.equal(calculateStageScale(664, 504), 1);
  assert.ok(Math.abs(calculateStageScale(1100, 820) - 1.6583333333333334) < 0.000001);
  assert.equal(calculateStageScale(1304, 984), 2);
  assert.equal(calculateStageScale(3840, 2160), 2);
});

test("the terminal scales down proportionally when the viewport is smaller", () => {
  const scale = calculateStageScale(504, 744);

  assert.equal(scale, 0.75);
  assert.equal(LOGICAL_STAGE_WIDTH * scale, 480);
  assert.equal(LOGICAL_STAGE_HEIGHT * scale, 360);
});
