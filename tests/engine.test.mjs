import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderPairRgba } from "../src/core/engine.mjs";

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"));
}

test("renderPairRgba preserves the pinned exact 50+300 frame", async () => {
  const [data, nativeData] = await Promise.all([
    fixture("layers.json"),
    fixture("native-data.json"),
  ]);

  const rgba = renderPairRgba({
    data,
    nativeData,
    layer1: 50,
    layer2: 300,
    frameNumber: 0,
  });

  assert.equal(rgba.length, 256 * 224 * 4);
  assert.equal(
    createHash("sha256").update(rgba).digest("hex"),
    "974072a27ae47f780aab780681867f92e0c9fca9ced335dda3266ec50a01cc55",
  );
});

test("renderPairRgba rejects invalid layer IDs before reading layer data", () => {
  assert.throws(
    () => renderPairRgba({ data: {}, nativeData: {}, layer1: 327, layer2: 0, frameNumber: 0 }),
    /layer1 must be an integer between 0 and 326/,
  );
});
