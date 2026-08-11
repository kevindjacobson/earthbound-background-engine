import assert from "node:assert/strict";
import test from "node:test";

test("a player session without a code keeps state local and never opens synchronization", async () => {
  const stateModule = await import("../src/core/state.mjs");
  assert.equal(typeof stateModule.createPlayerSession, "function", "createPlayerSession must exist");

  const failNetwork = () => assert.fail("a local player session must not access the network");
  const session = stateModule.createPlayerSession({
    search: "",
    request: failNetwork,
    createEventSource: failNetwork,
    randomLayer: () => 17,
  });

  assert.equal(session.synchronized, false);
  assert.equal(session.code, null);
  assert.deepEqual(await session.load(), stateModule.DEFAULT_PLAYER_STATE);
  assert.deepEqual(await session.update({ layer1: 12 }), {
    ...stateModule.DEFAULT_PLAYER_STATE,
    layer1: 12,
    revision: 1,
  });
  assert.equal(session.subscribe(() => assert.fail("local sessions do not receive events")), undefined);
});

test("a coded player session carries its code on every synchronization request", async () => {
  const stateModule = await import("../src/core/state.mjs");
  assert.equal(typeof stateModule.createPlayerSession, "function", "createPlayerSession must exist");

  const requests = [];
  const eventUrls = [];
  const session = stateModule.createPlayerSession({
    search: "?display&code=jam%20room",
    request: async (url, init) => {
      requests.push([url, init]);
      return new Response(JSON.stringify({ ...stateModule.DEFAULT_PLAYER_STATE, revision: requests.length - 1 }), {
        headers: { "content-type": "application/json" },
      });
    },
    createEventSource: (url) => {
      eventUrls.push(url);
      return { addEventListener() {} };
    },
    randomLayer: () => 17,
  });

  assert.equal(session.synchronized, true);
  assert.equal(session.code, "jam room");
  await session.load();
  await session.update({ speed: 125 });
  await session.randomize();
  session.subscribe(() => {});

  assert.deepEqual(requests.map(([url]) => url), [
    "/api/state?code=jam%20room",
    "/api/state?code=jam%20room",
    "/api/randomize?code=jam%20room",
  ]);
  assert.equal(requests[1][1].method, "PUT");
  assert.equal(requests[2][1].method, "POST");
  assert.deepEqual(eventUrls, ["/api/events?code=jam%20room"]);
});

test("the controls panel toggle preserves an accessible way to restore the panel", async () => {
  const controlsModule = await import("../src/player/controls-panel.mjs").catch(() => ({}));
  assert.equal(typeof controlsModule.setControlsCollapsed, "function", "setControlsCollapsed must exist");

  const classes = new Set();
  const panel = {
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
  };
  const attributes = new Map();
  const button = {
    textContent: "",
    setAttribute(name, value) {
      attributes.set(name, value);
    },
  };

  controlsModule.setControlsCollapsed(panel, button, true);
  assert.equal(classes.has("collapsed"), true);
  assert.equal(attributes.get("aria-expanded"), "false");
  assert.equal(button.textContent, "Show controls");

  controlsModule.setControlsCollapsed(panel, button, false);
  assert.equal(classes.has("collapsed"), false);
  assert.equal(attributes.get("aria-expanded"), "true");
  assert.equal(button.textContent, "Hide controls");
});

test("the opening state randomizes local players without changing synchronized rooms", async () => {
  const controlsModule = await import("../src/player/controls-panel.mjs");
  assert.equal(typeof controlsModule.loadOpeningState, "function", "loadOpeningState must exist");

  const localCalls = [];
  const localState = await controlsModule.loadOpeningState({
    synchronized: false,
    load: async () => localCalls.push("load"),
    randomize: async () => {
      localCalls.push("randomize");
      return { layer1: 17, layer2: 42 };
    },
  });
  assert.deepEqual(localCalls, ["randomize"]);
  assert.deepEqual(localState, { layer1: 17, layer2: 42 });

  const synchronizedCalls = [];
  const synchronizedState = await controlsModule.loadOpeningState({
    synchronized: true,
    load: async () => {
      synchronizedCalls.push("load");
      return { layer1: 50, layer2: 300 };
    },
    randomize: async () => synchronizedCalls.push("randomize"),
  });
  assert.deepEqual(synchronizedCalls, ["load"]);
  assert.deepEqual(synchronizedState, { layer1: 50, layer2: 300 });
});

test("the Konami code matcher reveals controls only after the full sequence", async () => {
  const controlsModule = await import("../src/player/controls-panel.mjs");
  assert.equal(typeof controlsModule.createKonamiCodeMatcher, "function", "createKonamiCodeMatcher must exist");

  const matchesKonamiCode = controlsModule.createKonamiCodeMatcher();
  const keys = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "A",
  ];

  for (const key of keys.slice(0, -1)) assert.equal(matchesKonamiCode(key), false, key);
  assert.equal(matchesKonamiCode(keys.at(-1)), true);
  assert.equal(matchesKonamiCode("a"), false, "a completed sequence resets the matcher");
});

test("only the branded root hosts conceal controls on startup", async () => {
  const controlsModule = await import("../src/player/controls-panel.mjs");
  assert.equal(typeof controlsModule.shouldConcealControls, "function", "shouldConcealControls must exist");

  assert.equal(controlsModule.shouldConcealControls("justalilguy.com"), true);
  assert.equal(controlsModule.shouldConcealControls("www.justalilguy.com"), true);
  assert.equal(controlsModule.shouldConcealControls("127.0.0.1"), true);
  assert.equal(controlsModule.shouldConcealControls("earf.justalilguy.com"), false);
});
