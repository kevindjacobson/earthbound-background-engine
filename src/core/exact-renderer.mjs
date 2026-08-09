const positiveModulo = (value, modulus) => ((value % modulus) + modulus) % modulus;
const decodedStores = new WeakMap();

function decodeBase64(value) {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

function stores(nativeData) {
  let value = decodedStores.get(nativeData);
  if (!value) {
    value = {
      graphics: decodeBase64(nativeData.graphics.bytesBase64),
      arrangements: decodeBase64(nativeData.arrangements.wordsBase64),
      graphicsCache: new Map(),
    };
    decodedStores.set(nativeData, value);
  }
  return value;
}

export function decodeExactGraphics(nativeData, graphicsIndex, bitsPerPixel) {
  const store = stores(nativeData);
  const cacheKey = `${graphicsIndex}:${bitsPerPixel}`;
  if (store.graphicsCache.has(cacheKey)) return store.graphicsCache.get(cacheKey);
  const graphicsOffset = nativeData.graphics.offsets[graphicsIndex];
  const graphicsLength = nativeData.graphics.lengths[graphicsIndex];
  if (!Number.isInteger(graphicsOffset) || !Number.isInteger(graphicsLength)) {
    throw new RangeError(`missing exact graphics bank ${graphicsIndex}`);
  }
  if (nativeData.graphics.bitsPerPixel[graphicsIndex] !== bitsPerPixel) {
    throw new RangeError(`graphics bank ${graphicsIndex} has incompatible bit depth`);
  }
  const tileCount = graphicsLength / (8 * bitsPerPixel);
  const tiles = Array.from({ length: tileCount }, () => new Uint8Array(64));
  for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
    const base = graphicsOffset + tileIndex * 8 * bitsPerPixel;
    const tile = tiles[tileIndex];
    for (let x = 0; x < 8; x += 1) {
      for (let y = 0; y < 8; y += 1) {
        let color = 0;
        for (let plane = 0; plane < bitsPerPixel; plane += 1) {
          const byte = store.graphics[
            base + y * 2 + Math.floor(plane / 2) * 16 + (plane & 1)
          ];
          color |= ((byte >>> (7 - x)) & 1) << plane;
        }
        tile[y * 8 + x] = color;
      }
    }
  }

  const bankWords = nativeData.arrangements.wordsPerBank;
  const arrangementBase = graphicsIndex * bankWords * 2;
  const pixels = new Uint8Array(256 * 256);
  for (let tileY = 0; tileY < nativeData.arrangements.height; tileY += 1) {
    for (let tileX = 0; tileX < nativeData.arrangements.width; tileX += 1) {
      const wordOffset = arrangementBase + (tileY * nativeData.arrangements.width + tileX) * 2;
      const block = store.arrangements[wordOffset] | (store.arrangements[wordOffset + 1] << 8);
      const tile = tiles[block & 0x3ff];
      if (!tile) throw new RangeError(`arrangement references missing tile ${block & 0x3ff}`);
      const horizontalFlip = (block & 0x4000) !== 0;
      const verticalFlip = (block & 0x8000) !== 0;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const destinationX = tileX * 8 + (horizontalFlip ? 7 - x : x);
          const destinationY = tileY * 8 + (verticalFlip ? 7 - y : y);
          pixels[destinationY * 256 + destinationX] = tile[y * 8 + x];
        }
      }
    }
  }
  store.graphicsCache.set(cacheKey, pixels);
  return pixels;
}

function cyclePosition(layer, frameNumber) {
  if (!layer.cycleType || !layer.cycleSpeed) return 0;
  const interval = Math.ceil(layer.cycleSpeed / 2);
  const cycleCalls = Math.floor((Math.max(0, frameNumber) + 1) / interval);
  return Math.max(0, cycleCalls - 1);
}

export function exactPaletteIndex(index, layer, frameNumber) {
  const position = cyclePosition(layer, frameNumber);
  if (position === 0) return index;
  const wrapSource = (start, end) => {
    const length = end - start + 1;
    if (length <= 0 || index < start || index > end) return null;
    let source = index - (position % length);
    if (source < start) source += length;
    return source;
  };
  if (layer.cycleType === 1 || layer.cycleType === 2) {
    const source = wrapSource(layer.cycle1Start, layer.cycle1End);
    if (source !== null) return source;
  }
  if (layer.cycleType === 2) {
    const source = wrapSource(layer.cycle2Start, layer.cycle2End);
    if (source !== null) return source;
  }
  if (
    layer.cycleType === 3 &&
    index >= layer.cycle1Start &&
    index <= layer.cycle1End
  ) {
    const start = layer.cycle1Start;
    const end = layer.cycle1End;
    const length = end - start + 1;
    let source = index + (position % (length * 2));
    if (source > end) {
      let difference = source - end - 1;
      source = end - difference;
      if (source < start) {
        difference = start - source - 1;
        source = start + difference;
      }
    }
    return source;
  }
  return index;
}

function distortedSource(effect, frameNumber, x, y) {
  const doubledTick = frameNumber * 2;
  const amplitude =
    (effect.amplitude + effect.amplitudeAcceleration * doubledTick) / 512;
  const frequency =
    ((8 * Math.PI) / (1024 * 256)) *
    (effect.frequency + effect.frequencyAcceleration * doubledTick);
  const compression =
    1 + (effect.compression + effect.compressionAcceleration * doubledTick) / 256;
  const speed = (Math.PI / 60) * effect.speed * frameNumber;
  const sineOffset = Math.round(amplitude * Math.sin(frequency * y + speed));
  const offset = effect.type === 2 && y % 2 === 0 ? -sineOffset : sineOffset;
  return {
    x: effect.type === 1 || effect.type === 2 ? positiveModulo(x + offset, 256) : x,
    y: effect.type === 3
      ? positiveModulo(Math.floor(sineOffset + y * compression), 256)
      : y,
  };
}

export function renderExactLayerRgba(
  nativeData,
  layer,
  palette,
  effect,
  frameNumber,
  width = 256,
  height = 224,
) {
  if (!Number.isInteger(frameNumber) || frameNumber < 0) {
    throw new RangeError("frame number must be a nonnegative integer");
  }
  const source = decodeExactGraphics(nativeData, layer.graphics, layer.bitsPerPixel);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sceneY = Math.min(223, Math.floor(((y + 0.5) * 224) / height));
    for (let x = 0; x < width; x += 1) {
      const sceneX = Math.min(255, Math.floor(((x + 0.5) * 256) / width));
      const sample = distortedSource(effect, frameNumber, sceneX, sceneY);
      const rawIndex = source[sample.y * 256 + sample.x];
      const paletteIndex = exactPaletteIndex(rawIndex, layer, frameNumber);
      const color = palette.colors[paletteIndex];
      const offset = (y * width + x) * 4;
      rgba[offset] = (color & 31) * 8;
      rgba[offset + 1] = ((color >>> 5) & 31) * 8;
      rgba[offset + 2] = ((color >>> 10) & 31) * 8;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

export function renderExactPairRgba(
  nativeData,
  data,
  ids,
  frameNumber,
  width = 256,
  height = 224,
) {
  const frames = ids.map((id) => {
    const layer = data.layers[id];
    return renderExactLayerRgba(
      nativeData,
      layer,
      data.palettes[layer.palette],
      data.effects[layer.effect],
      frameNumber,
      width,
      height,
    );
  });
  const alpha = ids[1] === 0 ? [1, 0] : [0.5, 0.5];
  const output = new Uint8ClampedArray(frames[0].length);
  for (let offset = 0; offset < output.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      output[offset + channel] =
        frames[0][offset + channel] * alpha[0] +
        frames[1][offset + channel] * alpha[1];
    }
    output[offset + 3] = 255;
  }
  return output;
}
