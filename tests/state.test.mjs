import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerState, updatePlayerState } from "../src/core/state.mjs";

test("updatePlayerState applies a partial update without losing other controls", () => {
  const initial = createPlayerState();

  assert.deepEqual(updatePlayerState(initial, { layer1: 260, speed: 0 }), {
    layer1: 260,
    layer2: 300,
    brightness: 50,
    speed: 0,
    playing: true,
    revision: 1,
  });
});

test("updatePlayerState rejects out-of-range controls", () => {
  assert.throws(
    () => updatePlayerState(createPlayerState(), { brightness: 101 }),
    /brightness must be an integer between 0 and 100/,
  );
});

test("updatePlayerState rejects unknown controls", () => {
  assert.throws(
    () => updatePlayerState(createPlayerState(), { exposed: true }),
    /unknown player control: exposed/,
  );
});
