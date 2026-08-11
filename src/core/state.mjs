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

export function playerRoomCode(search) {
  const code = new URLSearchParams(search).get("code")?.trim();
  return code || null;
}

function playerApiUrl(path, code) {
  return `${path}?code=${encodeURIComponent(code)}`;
}

async function readStateResponse(response, message) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `${message} (${response.status})`);
  return result;
}

export function createPlayerSession({
  search = globalThis.location?.search ?? "",
  request = globalThis.fetch,
  createEventSource = (url) => new EventSource(url),
  randomLayer = () => Math.floor(Math.random() * 327),
} = {}) {
  const code = playerRoomCode(search);
  let localState = createPlayerState();

  if (!code) {
    return {
      code: null,
      synchronized: false,
      async load() {
        return localState;
      },
      async update(update) {
        localState = updatePlayerState(localState, update);
        return localState;
      },
      async randomize() {
        const layer1 = randomLayer();
        let layer2 = randomLayer();
        while (layer2 === layer1) layer2 = randomLayer();
        localState = updatePlayerState(localState, { layer1, layer2 });
        return localState;
      },
      subscribe() {},
    };
  }

  return {
    code,
    synchronized: true,
    async load() {
      return readStateResponse(await request(playerApiUrl("/api/state", code)), "state load failed");
    },
    async update(update) {
      const response = await request(playerApiUrl("/api/state", code), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      });
      return readStateResponse(response, "state update failed");
    },
    async randomize() {
      const response = await request(playerApiUrl("/api/randomize", code), {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      return readStateResponse(response, "randomize failed");
    },
    subscribe(onState, onError) {
      const events = createEventSource(playerApiUrl("/api/events", code));
      events.addEventListener("state", (event) => onState(JSON.parse(event.data)));
      if (onError) events.addEventListener("error", onError);
      return events;
    },
  };
}
