import assert from "node:assert/strict";
import test from "node:test";
import { closePlayerServer, createPlayerServer } from "../src/server.mjs";

async function withServer(run) {
  const server = createPlayerServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await closePlayerServer(server);
  }
}

test("PUT /api/state updates shared state", async () => {
  await withServer(async (origin) => {
    const initialResponse = await fetch(`${origin}/api/state`);
    assert.equal(initialResponse.status, 200);
    assert.deepEqual(await initialResponse.json(), {
      layer1: 50,
      layer2: 300,
      brightness: 50,
      speed: 100,
      playing: true,
      revision: 0,
    });

    const updateResponse = await fetch(`${origin}/api/state`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layer1: 260, layer2: 0, brightness: 80 }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.deepEqual(updated, {
      layer1: 260,
      layer2: 0,
      brightness: 80,
      speed: 100,
      playing: true,
      revision: 1,
    });

    const laterResponse = await fetch(`${origin}/api/state`);
    assert.deepEqual(await laterResponse.json(), updated);
  });
});

test("invalid state updates leave state unchanged", async () => {
  await withServer(async (origin) => {
    const updateResponse = await fetch(`${origin}/api/state`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layer1: 900 }),
    });
    assert.equal(updateResponse.status, 400);
    assert.match((await updateResponse.json()).error, /layer1 must be an integer between 0 and 326/);

    const stateResponse = await fetch(`${origin}/api/state`);
    assert.equal((await stateResponse.json()).revision, 0);
  });
});

test("GET / serves the player", async () => {
  await withServer(async (origin) => {
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.match(await response.text(), /EarthBound Background Engine/);
  });
});

test("POST /api/randomize requires JSON and picks two layers", async () => {
  await withServer(async (origin) => {
    const simpleResponse = await fetch(`${origin}/api/randomize`, { method: "POST" });
    assert.equal(simpleResponse.status, 415);

    const allowedResponse = await fetch(`${origin}/api/randomize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    assert.equal(allowedResponse.status, 200);
    const state = await allowedResponse.json();
    assert.ok(state.layer1 >= 0 && state.layer1 <= 326);
    assert.ok(state.layer2 >= 0 && state.layer2 <= 326);
    assert.notEqual(state.layer1, state.layer2);
  });
});

test("closePlayerServer closes an open event stream", async () => {
  const server = createPlayerServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  const eventsResponse = await fetch(`http://127.0.0.1:${port}/api/events`);
  assert.equal(eventsResponse.status, 200);

  await closePlayerServer(server);

  assert.equal(server.listening, false);
});
