const GRAPHICS_TEXTURE_WIDTH = 1024;
const ARRANGEMENT_TEXTURE_WIDTH = 1024;
const WAVEFORM_TEXTURE_WIDTH = 1024;
const SPECTRUM_TEXTURE_WIDTH = 64;

const VERTEX_SHADER = `#version 300 es
precision highp float;

void main() {
  vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform highp usampler2D uGraphics;
uniform highp usampler2D uArrangements;
uniform highp usampler2D uPalettes;
uniform sampler2D uWaveform;
uniform sampler2D uSpectrum;
uniform ivec4 uLayer[2];
uniform ivec4 uCycleA[2];
uniform ivec2 uCycleB[2];
uniform ivec4 uEffectA[2];
uniform ivec4 uEffectB[2];
uniform int uFrameNumber;
uniform bool uLayer2Enabled;
uniform float uIntensity;
uniform vec4 uAudioFeatures;

out vec4 outputColor;

const float PI = 3.141592653589793;

int positiveModulo(int value, int modulus) {
  int result = value % modulus;
  return result < 0 ? result + modulus : result;
}

int roundLikeJavaScript(float value) {
  return int(floor(value + 0.5));
}

uint graphicsByte(int byteIndex) {
  return texelFetch(
    uGraphics,
    ivec2(byteIndex % ${GRAPHICS_TEXTURE_WIDTH}, byteIndex / ${GRAPHICS_TEXTURE_WIDTH}),
    0
  ).r;
}

uint arrangementWord(int graphicsId, int tileX, int tileY) {
  int wordIndex = graphicsId * 1024 + tileY * 32 + tileX;
  return texelFetch(
    uArrangements,
    ivec2(wordIndex % ${ARRANGEMENT_TEXTURE_WIDTH}, wordIndex / ${ARRANGEMENT_TEXTURE_WIDTH}),
    0
  ).r;
}

int exactTileIndex(ivec2 sourcePoint, int slot) {
  ivec4 layer = uLayer[slot];
  int graphicsId = layer.x;
  int graphicsOffset = layer.y;
  int bitsPerPixel = layer.z;
  uint block = arrangementWord(graphicsId, sourcePoint.x >> 3, sourcePoint.y >> 3);
  int tile = int(block & 0x3ffu);
  int localX = sourcePoint.x & 7;
  int localY = sourcePoint.y & 7;
  if ((block & 0x4000u) != 0u) localX = 7 - localX;
  if ((block & 0x8000u) != 0u) localY = 7 - localY;

  int base = graphicsOffset + tile * 8 * bitsPerPixel;
  int colorIndex = 0;
  for (int plane = 0; plane < 4; plane += 1) {
    if (plane < bitsPerPixel) {
      int byteIndex = base + localY * 2 + (plane >> 1) * 16 + (plane & 1);
      uint planarByte = graphicsByte(byteIndex);
      colorIndex |= int((planarByte >> uint(7 - localX)) & 1u) << plane;
    }
  }
  return colorIndex;
}

float rowSpectrum(ivec2 destination) {
  float row = (float(destination.y) + 0.5) / 224.0;
  float mirroredBand = abs(row * 2.0 - 1.0);
  return texture(uSpectrum, vec2(mirroredBand, 0.5)).r;
}

ivec2 distortedSourcePoint(ivec2 destination, int slot) {
  ivec4 effectA = uEffectA[slot];
  ivec4 effectB = uEffectB[slot];
  float doubledTick = float(uFrameNumber * 2);
  float amplitude =
    (float(effectA.z) + float(effectB.y) * doubledTick) / 512.0;
  amplitude *= 1.0 + uAudioFeatures.y * uIntensity * 2.0;
  float frequency =
    ((8.0 * PI) / (1024.0 * 256.0)) *
    (float(effectA.y) + float(effectB.x) * doubledTick);
  float compression = 1.0 +
    (float(effectA.w) + float(effectB.w) * doubledTick) / 256.0;
  float speed = (PI / 60.0) * float(effectB.z) * float(uFrameNumber);
  int sineOffset = roundLikeJavaScript(
    amplitude * sin(frequency * float(destination.y) + speed)
  );
  int type = effectA.x;
  int offset = type == 2 && (destination.y & 1) == 0 ? -sineOffset : sineOffset;
  int sourceX = type == 1 || type == 2
    ? positiveModulo(destination.x + offset, 256)
    : destination.x;
  int sourceY = type == 3
    ? positiveModulo(int(floor(float(sineOffset) + float(destination.y) * compression)), 256)
    : destination.y;

  float row = (float(destination.y) + 0.5) / 224.0;
  float waveform = texture(uWaveform, vec2(row, 0.5)).r * 2.0 - 1.0;
  float spectrum = rowSpectrum(destination);
  int waveformOffset = roundLikeJavaScript(
    waveform * (2.0 + 14.0 * uAudioFeatures.x) * uIntensity
  );
  int spectrumOffset = int(floor(spectrum * 6.0 * uIntensity));
  if (((destination.y >> 2) & 1) == 0) spectrumOffset = -spectrumOffset;
  sourceX = positiveModulo(sourceX + waveformOffset + spectrumOffset, 256);
  return ivec2(sourceX, sourceY);
}

int paletteCycleCount(int slot) {
  ivec4 cycle = uCycleA[slot];
  if (cycle.y <= 0 || cycle.x == 0) return 0;
  int interval = (cycle.y + 1) / 2;
  int cycleCalls = (uFrameNumber + 1) / interval;
  return max(cycleCalls - 1, 0);
}

int wrapCycleIndex(int index, int start, int end, int position) {
  int length = end - start + 1;
  return start + positiveModulo(index - start - position, length);
}

int pingPongCycleIndex(int index, int start, int end, int position) {
  int length = end - start + 1;
  int candidate = index + position % (length * 2);
  if (candidate > end) {
    int difference = candidate - end - 1;
    candidate = end - difference;
    if (candidate < start) {
      difference = start - candidate - 1;
      candidate = start + difference;
    }
  }
  return candidate;
}

int cycledPaletteIndex(int index, int slot) {
  ivec4 cycle = uCycleA[slot];
  ivec2 cycleB = uCycleB[slot];
  int position = paletteCycleCount(slot);
  if ((cycle.x == 1 || cycle.x == 2) && index >= cycle.z && index <= cycle.w) {
    return wrapCycleIndex(index, cycle.z, cycle.w, position);
  }
  if (cycle.x == 2 && index >= cycleB.x && index <= cycleB.y) {
    return wrapCycleIndex(index, cycleB.x, cycleB.y, position);
  }
  if (cycle.x == 3 && index >= cycle.z && index <= cycle.w) {
    return pingPongCycleIndex(index, cycle.z, cycle.w, position);
  }
  return index;
}

int audioReactivePaletteIndex(int index, int slot, int bitsPerPixel) {
  if (index == 0 || uIntensity <= 0.0) return index;
  int colorCount = bitsPerPixel == 2 ? 4 : 16;
  float colorBand = (float(index) + 0.5) / float(colorCount);
  if (slot == 1) colorBand = 1.0 - colorBand;
  float materialEnergy = texture(uSpectrum, vec2(colorBand, 0.5)).r;
  float drive = max(materialEnergy, uAudioFeatures.w * 0.75);
  int shift = int(floor(drive * uIntensity * 5.0));
  return shift == 0
    ? index
    : 1 + positiveModulo(index - 1 + shift, colorCount - 1);
}

vec3 decodeBgr555(uint packed) {
  uvec3 rgb5 = uvec3(packed & 31u, (packed >> 5u) & 31u, (packed >> 10u) & 31u);
  return vec3(rgb5 * 8u) / 255.0;
}

vec3 renderLayer(ivec2 destination, int slot) {
  ivec2 sourcePoint = distortedSourcePoint(destination, slot);
  int colorIndex = exactTileIndex(sourcePoint, slot);
  colorIndex = cycledPaletteIndex(colorIndex, slot);
  colorIndex = audioReactivePaletteIndex(colorIndex, slot, uLayer[slot].z);
  uint packed = texelFetch(uPalettes, ivec2(colorIndex, uLayer[slot].w), 0).r;
  return decodeBgr555(packed);
}

vec3 quantizeBgr555Steps(vec3 color) {
  return floor(clamp(color, 0.0, 248.0 / 255.0) * (255.0 / 8.0) + 0.5) * (8.0 / 255.0);
}

vec3 renderScene(ivec2 destination) {
  destination.x = positiveModulo(destination.x, 256);
  destination.y = clamp(destination.y, 0, 223);
  vec3 layer1 = renderLayer(destination, 0);
  vec3 scene = layer1;
  if (uLayer2Enabled) {
    scene = quantizeBgr555Steps(mix(layer1, renderLayer(destination, 1), 0.5));
  }
  return scene;
}

void main() {
  ivec2 destination = ivec2(
    int(floor(gl_FragCoord.x)),
    223 - int(floor(gl_FragCoord.y))
  );
  vec3 scene = renderScene(destination);
  int rgbSeparation = roundLikeJavaScript(uAudioFeatures.w * uIntensity * 3.0);
  if (rgbSeparation > 0) {
    vec3 redSource = renderScene(destination + ivec2(rgbSeparation, 0));
    vec3 blueSource = renderScene(destination - ivec2(rgbSeparation, 0));
    scene = vec3(redSource.r, scene.g, blueSource.b);
  }
  outputColor = vec4(scene, 1.0);
}`;

function decodeBase64(value) {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

export function prepareGpuTextureData(nativeData, data) {
  const graphics = decodeBase64(nativeData.graphics.bytesBase64);
  const arrangementBytes = decodeBase64(nativeData.arrangements.wordsBase64);
  const arrangements = new Uint16Array(arrangementBytes.length / 2);
  const view = new DataView(arrangementBytes.buffer, arrangementBytes.byteOffset, arrangementBytes.byteLength);
  for (let index = 0; index < arrangements.length; index += 1) {
    arrangements[index] = view.getUint16(index * 2, true);
  }
  const palettes = new Uint16Array(data.palettes.length * 16);
  for (let paletteIndex = 0; paletteIndex < data.palettes.length; paletteIndex += 1) {
    palettes.set(data.palettes[paletteIndex].colors, paletteIndex * 16);
  }
  return { graphics, arrangements, palettes };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`audio-reactive shader failed to compile: ${message}`);
  }
  return shader;
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`audio-reactive shader failed to link: ${message}`);
  }
  return program;
}

function padded(source, length) {
  if (source.length === length) return source;
  const output = new source.constructor(length);
  output.set(source);
  return output;
}

function createTexture(gl, { unit, internalFormat, format, type, width, height, data }) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
  return texture;
}

function uniform(gl, program, name) {
  const location = gl.getUniformLocation(program, name);
  if (location === null) throw new Error(`audio-reactive shader is missing ${name}`);
  return location;
}

function layerUniforms(data, nativeData, ids) {
  const layerValues = [];
  const cycleAValues = [];
  const cycleBValues = [];
  const effectAValues = [];
  const effectBValues = [];
  for (const id of ids) {
    const layer = data.layers[id];
    const effect = data.effects[layer.effect];
    layerValues.push(
      layer.graphics,
      nativeData.graphics.offsets[layer.graphics],
      layer.bitsPerPixel,
      layer.palette,
    );
    cycleAValues.push(layer.cycleType, layer.cycleSpeed, layer.cycle1Start, layer.cycle1End);
    cycleBValues.push(layer.cycle2Start, layer.cycle2End);
    effectAValues.push(effect.type, effect.frequency, effect.amplitude, effect.compression);
    effectBValues.push(
      effect.frequencyAcceleration,
      effect.amplitudeAcceleration,
      effect.speed,
      effect.compressionAcceleration,
    );
  }
  return {
    layer: new Int32Array(layerValues),
    cycleA: new Int32Array(cycleAValues),
    cycleB: new Int32Array(cycleBValues),
    effectA: new Int32Array(effectAValues),
    effectB: new Int32Array(effectBValues),
  };
}

export function createGpuRenderer(canvas, data, nativeData) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) throw new Error("WebGL 2 is unavailable");

  const program = createProgram(gl);
  const prepared = prepareGpuTextureData(nativeData, data);
  const graphicsHeight = Math.ceil(prepared.graphics.length / GRAPHICS_TEXTURE_WIDTH);
  const arrangementHeight = Math.ceil(prepared.arrangements.length / ARRANGEMENT_TEXTURE_WIDTH);
  createTexture(gl, {
    unit: 0,
    internalFormat: gl.R8UI,
    format: gl.RED_INTEGER,
    type: gl.UNSIGNED_BYTE,
    width: GRAPHICS_TEXTURE_WIDTH,
    height: graphicsHeight,
    data: padded(prepared.graphics, GRAPHICS_TEXTURE_WIDTH * graphicsHeight),
  });
  createTexture(gl, {
    unit: 1,
    internalFormat: gl.R16UI,
    format: gl.RED_INTEGER,
    type: gl.UNSIGNED_SHORT,
    width: ARRANGEMENT_TEXTURE_WIDTH,
    height: arrangementHeight,
    data: padded(prepared.arrangements, ARRANGEMENT_TEXTURE_WIDTH * arrangementHeight),
  });
  createTexture(gl, {
    unit: 2,
    internalFormat: gl.R16UI,
    format: gl.RED_INTEGER,
    type: gl.UNSIGNED_SHORT,
    width: 16,
    height: data.palettes.length,
    data: prepared.palettes,
  });
  const waveformTexture = createTexture(gl, {
    unit: 3,
    internalFormat: gl.R8,
    format: gl.RED,
    type: gl.UNSIGNED_BYTE,
    width: WAVEFORM_TEXTURE_WIDTH,
    height: 1,
    data: new Uint8Array(WAVEFORM_TEXTURE_WIDTH).fill(128),
  });
  const spectrumTexture = createTexture(gl, {
    unit: 4,
    internalFormat: gl.R8,
    format: gl.RED,
    type: gl.UNSIGNED_BYTE,
    width: SPECTRUM_TEXTURE_WIDTH,
    height: 1,
    data: new Uint8Array(SPECTRUM_TEXTURE_WIDTH),
  });

  gl.useProgram(program);
  const locations = {
    layer: uniform(gl, program, "uLayer[0]"),
    cycleA: uniform(gl, program, "uCycleA[0]"),
    cycleB: uniform(gl, program, "uCycleB[0]"),
    effectA: uniform(gl, program, "uEffectA[0]"),
    effectB: uniform(gl, program, "uEffectB[0]"),
    frameNumber: uniform(gl, program, "uFrameNumber"),
    layer2Enabled: uniform(gl, program, "uLayer2Enabled"),
    intensity: uniform(gl, program, "uIntensity"),
    audioFeatures: uniform(gl, program, "uAudioFeatures"),
  };
  for (const [name, unit] of [
    ["uGraphics", 0],
    ["uArrangements", 1],
    ["uPalettes", 2],
    ["uWaveform", 3],
    ["uSpectrum", 4],
  ]) {
    gl.uniform1i(uniform(gl, program, name), unit);
  }
  const vertexArray = gl.createVertexArray();
  gl.bindVertexArray(vertexArray);
  gl.viewport(0, 0, canvas.width, canvas.height);

  let currentLayerKey = "";
  return {
    kind: "gpu",
    render({ layer1, layer2, frameNumber, intensity = 0, audio }) {
      const layerKey = `${layer1}:${layer2}`;
      if (layerKey !== currentLayerKey) {
        const values = layerUniforms(data, nativeData, [layer1, layer2]);
        gl.uniform4iv(locations.layer, values.layer);
        gl.uniform4iv(locations.cycleA, values.cycleA);
        gl.uniform2iv(locations.cycleB, values.cycleB);
        gl.uniform4iv(locations.effectA, values.effectA);
        gl.uniform4iv(locations.effectB, values.effectB);
        currentLayerKey = layerKey;
      }

      if (audio) {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, waveformTexture);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          WAVEFORM_TEXTURE_WIDTH,
          1,
          gl.RED,
          gl.UNSIGNED_BYTE,
          audio.waveform,
        );
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, spectrumTexture);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          SPECTRUM_TEXTURE_WIDTH,
          1,
          gl.RED,
          gl.UNSIGNED_BYTE,
          audio.spectrum,
        );
      }

      const features = audio?.features ?? {};
      gl.uniform1i(locations.frameNumber, frameNumber);
      gl.uniform1i(locations.layer2Enabled, layer2 !== 0);
      gl.uniform1f(locations.intensity, Math.min(1, Math.max(0, intensity)));
      gl.uniform4f(
        locations.audioFeatures,
        features.rms ?? 0,
        features.bass ?? 0,
        features.mid ?? 0,
        features.treble ?? 0,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
