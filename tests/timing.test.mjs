import assert from "node:assert/strict";
import test from "node:test";
import { frameNumberAt, recordTempoTap } from "../src/core/timing.mjs";

test("frameNumberAt advances at 30 fps adjusted by speed", () => {
  assert.equal(frameNumberAt({ baseFrame: 12, elapsedMs: 1_000, speed: 100, playing: true }), 42);
  assert.equal(frameNumberAt({ baseFrame: 12, elapsedMs: 1_000, speed: 250, playing: true }), 87);
});

test("frameNumberAt holds while paused or at zero speed", () => {
  assert.equal(frameNumberAt({ baseFrame: 42, elapsedMs: 5_000, speed: 100, playing: false }), 42);
  assert.equal(frameNumberAt({ baseFrame: 42, elapsedMs: 5_000, speed: 0, playing: true }), 42);
});

test("recordTempoTap derives animation speed from the average tap interval", () => {
  let reading = recordTempoTap([], 1_000);
  assert.deepEqual(reading, { taps: [1_000], bpm: null, speed: null });

  reading = recordTempoTap(reading.taps, 1_500);
  assert.deepEqual(reading, { taps: [1_000, 1_500], bpm: 120, speed: 100 });

  reading = recordTempoTap(reading.taps, 2_100);
  assert.deepEqual(reading, { taps: [1_000, 1_500, 2_100], bpm: 109, speed: 91 });
});

test("recordTempoTap starts over after a long pause", () => {
  const reading = recordTempoTap([1_000, 1_500, 2_000], 4_001);
  assert.deepEqual(reading, { taps: [4_001], bpm: null, speed: null });
});
