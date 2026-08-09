import { renderExactPairRgba } from "./exact-renderer.mjs";

export const NATIVE_WIDTH = 256;
export const NATIVE_HEIGHT = 224;
export const MAX_LAYER_ID = 326;

function assertInteger(name, value, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

export function renderPairRgba({
  data,
  nativeData,
  layer1,
  layer2,
  frameNumber,
  width = NATIVE_WIDTH,
  height = NATIVE_HEIGHT,
}) {
  assertInteger("layer1", layer1, 0, MAX_LAYER_ID);
  assertInteger("layer2", layer2, 0, MAX_LAYER_ID);
  assertInteger("frameNumber", frameNumber, 0, Number.MAX_SAFE_INTEGER);
  assertInteger("width", width, 1, 8192);
  assertInteger("height", height, 1, 8192);

  return renderExactPairRgba(
    nativeData,
    data,
    [layer1, layer2],
    frameNumber,
    width,
    height,
  );
}
