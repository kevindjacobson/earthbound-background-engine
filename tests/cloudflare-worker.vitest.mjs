import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/cloudflare/worker.mjs";

async function fetchWorker(path, init) {
  const context = createExecutionContext();
  const response = await worker.fetch(
    new Request(`https://earf.justalilguy.com${path}`, init),
    env,
    context,
  );
  await waitOnExecutionContext(context);
  return response;
}

function roomPath(path, code = "test-room-alpha") {
  return `${path}?code=${encodeURIComponent(code)}`;
}

describe("Cloudflare player worker", () => {
  it("serves the player with an explicit noindex policy", async () => {
    const response = await fetchWorker("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(await response.text()).toContain(
      '<meta name="robots" content="noindex, nofollow, noarchive">',
    );
  });

  it("serves the bundled pixel title font", async () => {
    const response = await fetchWorker("/fonts/silkscreen-bold.ttf");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("font/ttf");
    expect([...new Uint8Array(await response.arrayBuffer()).slice(0, 4)]).toEqual([0, 1, 0, 0]);
  });

  it("does not resolve a Durable Object when the code URL parameter is absent", async () => {
    const noDurableObjectEnv = {
      ASSETS: env.ASSETS,
      PLAYER_ROOMS: new Proxy({}, {
        get() {
          throw new Error("Durable Object binding must not be accessed");
        },
      }),
    };

    const response = await worker.fetch(
      new Request("https://earf.justalilguy.com/api/state"),
      noDurableObjectEnv,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "a non-empty code URL parameter is required",
    });
  });

  it("reports worker health without resolving a Durable Object", async () => {
    const response = await worker.fetch(
      new Request("https://earf.justalilguy.com/healthz"),
      {
        ASSETS: env.ASSETS,
        PLAYER_ROOMS: new Proxy({}, {
          get() {
            throw new Error("Durable Object binding must not be accessed");
          },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("persists and broadcasts one validated shared player state", async () => {
    const initialResponse = await fetchWorker(roomPath("/api/state"));
    expect(initialResponse.status).toBe(200);
    expect(initialResponse.headers.get("cache-control")).toBe("no-store");
    expect(await initialResponse.json()).toEqual({
      layer1: 50,
      layer2: 300,
      brightness: 50,
      speed: 100,
      playing: true,
      revision: 0,
    });

    const updatedResponse = await fetchWorker(roomPath("/api/state"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layer1: 12, speed: 175, playing: false }),
    });
    expect(updatedResponse.status).toBe(200);
    expect(await updatedResponse.json()).toMatchObject({
      layer1: 12,
      speed: 175,
      playing: false,
      revision: 1,
    });

    const invalidResponse = await fetchWorker(roomPath("/api/state"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brightness: 101 }),
    });
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toEqual({
      error: "brightness must be an integer between 0 and 100",
    });

    const persistedResponse = await fetchWorker(roomPath("/api/state"));
    expect(await persistedResponse.json()).toMatchObject({
      layer1: 12,
      speed: 175,
      playing: false,
      revision: 1,
    });

    const randomResponse = await fetchWorker(roomPath("/api/randomize"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(randomResponse.status).toBe(200);
    const randomized = await randomResponse.json();
    expect(randomized.layer1).toBeGreaterThanOrEqual(0);
    expect(randomized.layer1).toBeLessThanOrEqual(326);
    expect(randomized.layer2).toBeGreaterThanOrEqual(0);
    expect(randomized.layer2).toBeLessThanOrEqual(326);
    expect(randomized.layer2).not.toBe(randomized.layer1);
    expect(randomized.revision).toBe(2);

    const eventResponse = await fetchWorker(roomPath("/api/events"));
    expect(eventResponse.status).toBe(200);
    expect(eventResponse.headers.get("content-type")).toBe("text/event-stream");
    const reader = eventResponse.body.getReader();
    const firstEvent = await reader.read();
    expect(new TextDecoder().decode(firstEvent.value)).toContain(
      `event: state\ndata: ${JSON.stringify(randomized)}\n\n`,
    );
    await reader.cancel();
  });

  it("rejects unsafe or malformed writes", async () => {
    const missingType = await fetchWorker(roomPath("/api/randomize", "test-room-beta"), { method: "POST" });
    expect(missingType.status).toBe(415);

    const unknownControl = await fetchWorker(roomPath("/api/state", "test-room-beta"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ admin: true }),
    });
    expect(unknownControl.status).toBe(400);
    expect(await unknownControl.json()).toEqual({ error: "unknown player control: admin" });
  });

  it("keeps different room codes in different Durable Objects", async () => {
    const updatedResponse = await fetchWorker(roomPath("/api/state", "test-room-gamma"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layer1: 99 }),
    });
    expect(updatedResponse.status).toBe(200);

    const otherRoomResponse = await fetchWorker(roomPath("/api/state", "test-room-delta"));
    expect(await otherRoomResponse.json()).toMatchObject({ layer1: 50, revision: 0 });
  });
});
