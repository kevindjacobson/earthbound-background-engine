import { DurableObject } from "cloudflare:workers";
import { createPlayerState, playerRoomCode, updatePlayerState } from "../core/state.mjs";

const JSON_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

function jsonResponse(value, status = 200) {
  return new Response(`${JSON.stringify(value)}\n`, { status, headers: JSON_HEADERS });
}

async function readJson(request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new TypeError("content-type must be application/json");
  }

  const reader = request.body?.getReader();
  if (!reader) return JSON.parse("");

  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      throw new RangeError("request body exceeds 16384 bytes");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function randomLayer() {
  const values = new Uint16Array(1);
  const ceiling = Math.floor(65_536 / 327) * 327;
  do crypto.getRandomValues(values); while (values[0] >= ceiling);
  return values[0] % 327;
}

function serializeState(state) {
  return [
    state.layer1,
    state.layer2,
    state.brightness,
    state.speed,
    state.playing ? 1 : 0,
    state.revision,
  ];
}

function deserializeState(row) {
  return {
    layer1: row.layer1,
    layer2: row.layer2,
    brightness: row.brightness,
    speed: row.speed,
    playing: row.playing === 1,
    revision: row.revision,
  };
}

export class PlayerRoom extends DurableObject {
  constructor(context, env) {
    super(context, env);
    this.playerState = undefined;
    this.eventControllers = new Set();

    context.blockConcurrencyWhile(async () => {
      context.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS player_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          layer1 INTEGER NOT NULL,
          layer2 INTEGER NOT NULL,
          brightness INTEGER NOT NULL,
          speed INTEGER NOT NULL,
          playing INTEGER NOT NULL,
          revision INTEGER NOT NULL
        )
      `);
      const rows = context.storage.sql.exec(
        "SELECT layer1, layer2, brightness, speed, playing, revision FROM player_state WHERE id = 1",
      ).toArray();
      if (rows.length === 1) {
        this.playerState = deserializeState(rows[0]);
        return;
      }
      this.playerState = createPlayerState();
      this.persist();
    });
  }

  persist() {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO player_state
        (id, layer1, layer2, brightness, speed, playing, revision)
        VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)`,
      ...serializeState(this.playerState),
    );
  }

  broadcast() {
    const event = `event: state\ndata: ${JSON.stringify(this.playerState)}\n\n`;
    for (const controller of this.eventControllers) {
      try {
        controller.enqueue(event);
      } catch {
        this.eventControllers.delete(controller);
      }
    }
  }

  update(update) {
    const next = updatePlayerState(this.playerState, update);
    const previous = this.playerState;
    this.playerState = next;
    try {
      this.persist();
    } catch (error) {
      this.playerState = previous;
      throw error;
    }
    this.broadcast();
    return next;
  }

  eventStream() {
    let streamController;
    const stream = new ReadableStream({
      start: (controller) => {
        streamController = controller;
        this.eventControllers.add(controller);
        controller.enqueue(`event: state\ndata: ${JSON.stringify(this.playerState)}\n\n`);
      },
      cancel: () => {
        this.eventControllers.delete(streamController);
      },
    });
    return new Response(stream, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/event-stream",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return jsonResponse({ ok: true, revision: this.playerState.revision });
    }
    if (request.method === "GET" && url.pathname === "/api/state") {
      return jsonResponse(this.playerState);
    }
    if (request.method === "PUT" && url.pathname === "/api/state") {
      try {
        return jsonResponse(this.update(await readJson(request)));
      } catch (error) {
        return jsonResponse({ error: error.message }, 400);
      }
    }
    if (request.method === "POST" && url.pathname === "/api/randomize") {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return jsonResponse({ error: "content-type must be application/json" }, 415);
      }
      const layer1 = randomLayer();
      let layer2 = randomLayer();
      while (layer2 === layer1) layer2 = randomLayer();
      return jsonResponse(this.update({ layer1, layer2 }));
    }
    if (request.method === "GET" && url.pathname === "/api/events") {
      return this.eventStream();
    }
    return jsonResponse({ error: "not found" }, 404);
  }
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") return jsonResponse({ ok: true });
    if (url.pathname.startsWith("/api/")) {
      const code = playerRoomCode(url.search);
      if (!code) return jsonResponse({ error: "a non-empty code URL parameter is required" }, 400);
      const roomId = env.PLAYER_ROOMS.idFromName(code);
      return env.PLAYER_ROOMS.get(roomId).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
