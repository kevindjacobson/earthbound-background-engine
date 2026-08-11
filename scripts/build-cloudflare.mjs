import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, ".cloudflare/public");
const files = new Map([
  ["src/player/index.html", "index.html"],
  ["src/player/app.mjs", "app.mjs"],
  ["src/player/audio-input.mjs", "audio-input.mjs"],
  ["src/player/gpu-renderer.mjs", "gpu-renderer.mjs"],
  ["src/player/controls-panel.mjs", "controls-panel.mjs"],
  ["src/player/fonts/silkscreen-bold.ttf", "fonts/silkscreen-bold.ttf"],
  ["src/player/styles.css", "styles.css"],
  ["src/core/audio-reactivity.mjs", "core/audio-reactivity.mjs"],
  ["src/core/engine.mjs", "core/engine.mjs"],
  ["src/core/exact-renderer.mjs", "core/exact-renderer.mjs"],
  ["src/core/timing.mjs", "core/timing.mjs"],
  ["src/core/state.mjs", "core/state.mjs"],
  ["data/layers.json", "data/layers.json"],
  ["data/native-data.json", "data/native-data.json"],
]);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const [source, destination] of files) {
  const target = resolve(output, destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, source), target);
}

await writeFile(resolve(output, "_headers"), `/*
  Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'
  Permissions-Policy: camera=(), geolocation=(), microphone=(self)
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-Robots-Tag: noindex, nofollow, noarchive

/data/*
  Cache-Control: public, max-age=3600
`);

console.log(`Cloudflare static assets built in ${output}`);
