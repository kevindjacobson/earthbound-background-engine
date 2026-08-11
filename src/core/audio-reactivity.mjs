const FEATURE_KEYS = ["rms", "bass", "lowMid", "mid", "treble", "centroid"];

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function bandEnergy(frequencyData, sampleRate, minimumHz, maximumHz) {
  const binHz = sampleRate / 2 / frequencyData.length;
  const start = Math.max(1, Math.ceil(minimumHz / binHz));
  const end = Math.min(frequencyData.length, Math.ceil(maximumHz / binHz));
  if (end <= start) return 0;
  let squares = 0;
  for (let index = start; index < end; index += 1) {
    const magnitude = frequencyData[index] / 255;
    squares += magnitude * magnitude;
  }
  return Math.sqrt(squares / (end - start));
}

export function extractAudioFeatures({ timeDomain, frequencyData, sampleRate }) {
  let waveformSquares = 0;
  for (const sample of timeDomain) {
    const centered = (sample - 128) / 128;
    waveformSquares += centered * centered;
  }

  let weightedFrequency = 0;
  let magnitudeTotal = 0;
  const nyquist = sampleRate / 2;
  for (let index = 1; index < frequencyData.length; index += 1) {
    const magnitude = frequencyData[index] / 255;
    weightedFrequency += (index / frequencyData.length) * magnitude;
    magnitudeTotal += magnitude;
  }

  return {
    rms: timeDomain.length ? clamp01(Math.sqrt(waveformSquares / timeDomain.length)) : 0,
    bass: bandEnergy(frequencyData, sampleRate, 20, 160),
    lowMid: bandEnergy(frequencyData, sampleRate, 160, 600),
    mid: bandEnergy(frequencyData, sampleRate, 600, 2_400),
    treble: bandEnergy(frequencyData, sampleRate, 2_400, Math.min(12_000, nyquist)),
    centroid: magnitudeTotal ? clamp01(weightedFrequency / magnitudeTotal) : 0,
  };
}

export function smoothAudioFeatures(previous, next, { attack = 0.55, release = 0.18 } = {}) {
  return Object.fromEntries(FEATURE_KEYS.map((key) => {
    const rate = next[key] >= previous[key] ? attack : release;
    return [key, previous[key] + (next[key] - previous[key]) * rate];
  }));
}

export function compressSpectrum(source, outputLength = 64) {
  const output = new Uint8Array(outputLength);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * source.length / outputLength);
    const end = Math.max(start + 1, Math.floor((outputIndex + 1) * source.length / outputLength));
    let total = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      total += source[sourceIndex] ?? 0;
    }
    output[outputIndex] = Math.round(total / (end - start));
  }
  return output;
}

export function amplifyAudioFeatures(features) {
  if (features.rms <= 0.006) {
    return Object.fromEntries(FEATURE_KEYS.map((key) => [key, 0]));
  }
  const amplify = (value, noiseFloor, gain) => clamp01((value - noiseFloor) * gain);
  return {
    rms: amplify(features.rms, 0.006, 10),
    bass: amplify(features.bass, 0.015, 5),
    lowMid: amplify(features.lowMid, 0.015, 5),
    mid: amplify(features.mid, 0.015, 5),
    treble: amplify(features.treble, 0.015, 5),
    centroid: features.centroid,
  };
}

export function amplifyWaveform(source, rms) {
  const output = new Uint8Array(source.length);
  if (rms <= 0.006) {
    output.fill(128);
    return output;
  }
  const gain = Math.min(12, Math.max(1, 0.28 / rms));
  for (let index = 0; index < source.length; index += 1) {
    output[index] = Math.min(255, Math.max(1, Math.round(128 + (source[index] - 128) * gain)));
  }
  return output;
}

export function shapeSpectrum(source, signalPresent) {
  if (!signalPresent) return new Uint8Array(source.length);
  return Uint8Array.from(source, (value) => (
    Math.round(Math.pow(value / 255, 0.65) * 255)
  ));
}
