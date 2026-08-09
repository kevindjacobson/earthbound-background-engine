import assert from "node:assert/strict";
import test from "node:test";
import { frameNumberAt } from "../src/core/timing.mjs";

test("frameNumberAt advances at 30 fps adjusted by speed", () => {
  assert.equal(frameNumberAt({ baseFrame: 12, elapsedMs: 1_000, speed: 100, playing: true }), 42);
  assert.equal(frameNumberAt({ baseFrame: 12, elapsedMs: 1_000, speed: 250, playing: true }), 87);
});

test("frameNumberAt holds while paused or at zero speed", () => {
  assert.equal(frameNumberAt({ baseFrame: 42, elapsedMs: 5_000, speed: 100, playing: false }), 42);
  assert.equal(frameNumberAt({ baseFrame: 42, elapsedMs: 5_000, speed: 0, playing: true }), 42);
});
