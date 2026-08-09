import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlayerState, updatePlayerState } from "./core/state.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_FILES = new Map([
  ["/", ["src/player/index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["src/player/index.html", "text/html; charset=utf-8"]],
  ["/app.mjs", ["src/player/app.mjs", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["src/player/styles.css", "text/css; charset=utf-8"]],
  ["/core/engine.mjs", ["src/core/engine.mjs", "text/javascript; charset=utf-8"]],
  ["/core/exact-renderer.mjs", ["src/core/exact-renderer.mjs", "text/javascript; charset=utf-8"]],
  ["/core/timing.mjs", ["src/core/timing.mjs", "text/javascript; charset=utf-8"]],
  ["/data/layers.json", ["data/layers.json", "application/json; charset=utf-8"]],
  ["/data/native-data.json", ["data/native-data.json", "application/json; charset=utf-8"]],
]);

function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(value)}\n`);
}

async function readJson(request) {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new TypeError("content-type must be application/json");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new RangeError("request body exceeds 16384 bytes");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createPlayerServer() {
  let state = createPlayerState();
  const eventClients = new Set();

  const broadcast = () => {
    const event = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
    for (const client of eventClients) client.write(event);
  };

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "GET" && url.pathname === "/healthz") {
        return sendJson(response, 200, { ok: true, revision: state.revision });
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        return sendJson(response, 200, state);
      }
      if (request.method === "PUT" && url.pathname === "/api/state") {
        try {
          state = updatePlayerState(state, await readJson(request));
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
        sendJson(response, 200, state);
        broadcast();
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/randomize") {
        if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
          return sendJson(response, 415, { error: "content-type must be application/json" });
        }
        const layer1 = Math.floor(Math.random() * 327);
        let layer2 = Math.floor(Math.random() * 327);
        while (layer2 === layer1) layer2 = Math.floor(Math.random() * 327);
        state = updatePlayerState(state, { layer1, layer2 });
        sendJson(response, 200, state);
        broadcast();
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/events") {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
        });
        eventClients.add(response);
        response.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
        request.once("close", () => eventClients.delete(response));
        return;
      }

      const staticFile = request.method === "GET" ? STATIC_FILES.get(url.pathname) : undefined;
      if (!staticFile) return sendJson(response, 404, { error: "not found" });
      const [path, contentType] = staticFile;
      const body = await readFile(resolve(root, path));
      response.writeHead(200, {
        "content-type": contentType,
        "cache-control": path.startsWith("data/") ? "public, max-age=3600" : "no-cache",
        "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'",
        "x-content-type-options": "nosniff",
      });
      response.end(body);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });
}

export function closePlayerServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.EARTHBOUND_BIND_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.EARTHBOUND_PORT ?? "8787", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError("EARTHBOUND_PORT must be an integer between 1 and 65535");
  }
  const server = createPlayerServer();
  server.listen(port, host, () => {
    console.log(`EarthBound Background Engine listening on http://${host}:${port}`);
  });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    closePlayerServer(server).then(
      () => process.exit(0),
      (error) => {
        console.error(error);
        process.exit(1);
      },
    );
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
