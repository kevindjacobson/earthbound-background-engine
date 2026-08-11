import assert from "node:assert/strict";
import test from "node:test";

import { prepareGpuTextureData } from "../src/player/gpu-renderer.mjs";

test("prepareGpuTextureData preserves bytes, little-endian tile words, and padded palettes", () => {
  const nativeData = {
    graphics: { bytesBase64: Buffer.from([1, 2, 3, 4]).toString("base64") },
    arrangements: {
      wordsBase64: Buffer.from([0x34, 0x12, 0xcd, 0xab]).toString("base64"),
    },
  };
  const data = {
    palettes: [
      { colors: [0x001f, 0x03e0] },
      { colors: [0x7c00] },
    ],
  };

  const textures = prepareGpuTextureData(nativeData, data);

  assert.deepEqual(textures.graphics, Uint8Array.from([1, 2, 3, 4]));
  assert.deepEqual(textures.arrangements, Uint16Array.from([0x1234, 0xabcd]));
  assert.equal(textures.palettes.length, 32);
  assert.deepEqual(textures.palettes.slice(0, 4), Uint16Array.from([0x001f, 0x03e0, 0, 0]));
  assert.equal(textures.palettes[16], 0x7c00);
});
