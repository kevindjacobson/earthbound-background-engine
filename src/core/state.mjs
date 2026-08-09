const UPDATE_KEYS = new Set(["layer1", "layer2", "brightness", "speed", "playing"]);

export const DEFAULT_PLAYER_STATE = Object.freeze({
  layer1: 50,
  layer2: 300,
  brightness: 50,
  speed: 100,
  playing: true,
  revision: 0,
});

function assertInteger(name, value, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

export function createPlayerState(overrides = {}) {
  return updatePlayerState({ ...DEFAULT_PLAYER_STATE, revision: -1 }, overrides);
}

export function updatePlayerState(current, update) {
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    throw new TypeError("player update must be an object");
  }
  for (const key of Object.keys(update)) {
    if (!UPDATE_KEYS.has(key)) throw new TypeError(`unknown player control: ${key}`);
  }

  const next = { ...current, ...update, revision: current.revision + 1 };
  assertInteger("layer1", next.layer1, 0, 326);
  assertInteger("layer2", next.layer2, 0, 326);
  assertInteger("brightness", next.brightness, 0, 100);
  assertInteger("speed", next.speed, 0, 400);
  if (typeof next.playing !== "boolean") throw new TypeError("playing must be a boolean");
  return next;
}
