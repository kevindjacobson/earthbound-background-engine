import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [data, nativeData, packageDocument] = await Promise.all([
  read("data/layers.json").then(JSON.parse),
  read("data/native-data.json").then(JSON.parse),
  read("package.json").then(JSON.parse),
]);

assert.equal(data.layers.length, 327);
assert.equal(data.palettes.length, 114);
assert.equal(data.effects.length, 135);
assert.equal(nativeData.graphics.count, 103);
assert.equal(nativeData.source.revision, data.source.revision);
assert.equal(nativeData.source.sha256, data.source.sha256);

const graphics = Buffer.from(nativeData.graphics.bytesBase64, "base64");
const arrangements = Buffer.from(nativeData.arrangements.wordsBase64, "base64");
const pixelFont = await readFile(resolve(root, "src/player/fonts/silkscreen-bold.ttf"));
assert.equal(graphics.length, 117040);
assert.equal(arrangements.length, 210944);
assert.equal(pixelFont.length, 30632);
assert.equal(createHash("sha256").update(graphics).digest("hex"), nativeData.graphics.sha256);
assert.equal(createHash("sha256").update(arrangements).digest("hex"), nativeData.arrangements.sha256);
assert.equal(
  createHash("sha256").update(pixelFont).digest("hex"),
  "768476aa712d4f5c3e18d3bce80f980a8bd3f72b7094d22ec5e768df3acfed61",
);
assert.equal(packageDocument.dependencies, undefined, "runtime dependencies were added");

for (const path of [
  "src/server.mjs",
  "src/core/engine.mjs",
  "src/core/exact-renderer.mjs",
  "src/core/state.mjs",
  "src/core/timing.mjs",
  "src/core/audio-reactivity.mjs",
  "src/player/app.mjs",
  "src/player/audio-input.mjs",
  "src/player/gpu-renderer.mjs",
  "src/player/controls-panel.mjs",
  "src/cloudflare/worker.mjs",
  "scripts/build-cloudflare.mjs",
  "vitest.config.mjs",
]) {
  const check = spawnSync(process.execPath, ["--check", resolve(root, path)], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
}

for (const path of ["scripts/install-raspi.sh", "scripts/start-kiosk.sh"]) {
  const check = spawnSync("sh", ["-n", resolve(root, path)], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
}

console.log("check: data, JavaScript, and shell scripts OK");
