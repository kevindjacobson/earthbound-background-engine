import assert from "node:assert/strict";
import test from "node:test";

import {
  amplifyAudioFeatures,
  amplifyWaveform,
  compressSpectrum,
  extractAudioFeatures,
  shapeSpectrum,
  smoothAudioFeatures,
} from "../src/core/audio-reactivity.mjs";

test("extractAudioFeatures reports silence for centered waveform and empty spectrum", () => {
  const features = extractAudioFeatures({
    timeDomain: new Uint8Array(8).fill(128),
    frequencyData: new Uint8Array(512),
    sampleRate: 48_000,
  });

  assert.deepEqual(features, {
    rms: 0,
    bass: 0,
    lowMid: 0,
    mid: 0,
    treble: 0,
    centroid: 0,
  });
});

test("extractAudioFeatures separates bass and treble energy", () => {
  const bassSpectrum = new Uint8Array(512);
  bassSpectrum[2] = 255;
  const bass = extractAudioFeatures({
    timeDomain: new Uint8Array(8).fill(128),
    frequencyData: bassSpectrum,
    sampleRate: 48_000,
  });

  const trebleSpectrum = new Uint8Array(512);
  trebleSpectrum[100] = 255;
  const treble = extractAudioFeatures({
    timeDomain: new Uint8Array(8).fill(128),
    frequencyData: trebleSpectrum,
    sampleRate: 48_000,
  });

  assert.ok(bass.bass > 0);
  assert.equal(bass.treble, 0);
  assert.ok(treble.treble > 0);
  assert.equal(treble.bass, 0);
});

test("smoothAudioFeatures uses a fast attack and slower release", () => {
  const silence = { rms: 0, bass: 0, lowMid: 0, mid: 0, treble: 0, centroid: 0 };
  const loud = { rms: 1, bass: 1, lowMid: 1, mid: 1, treble: 1, centroid: 1 };

  assert.deepEqual(smoothAudioFeatures(silence, loud, { attack: 0.5, release: 0.25 }), {
    rms: 0.5,
    bass: 0.5,
    lowMid: 0.5,
    mid: 0.5,
    treble: 0.5,
    centroid: 0.5,
  });
  assert.deepEqual(smoothAudioFeatures(loud, silence, { attack: 0.5, release: 0.25 }), {
    rms: 0.75,
    bass: 0.75,
    lowMid: 0.75,
    mid: 0.75,
    treble: 0.75,
    centroid: 0.75,
  });
});

test("compressSpectrum preserves alternating frequency regions", () => {
  assert.deepEqual(
    compressSpectrum(Uint8Array.from([0, 0, 255, 255, 0, 0, 255, 255]), 4),
    Uint8Array.from([0, 255, 0, 255]),
  );
});

test("quiet music is amplified above integer visual thresholds", () => {
  const amplified = amplifyAudioFeatures({
    rms: 0.03,
    bass: 0.08,
    lowMid: 0.06,
    mid: 0.05,
    treble: 0.08,
    centroid: 0.4,
  });

  assert.ok(amplified.rms >= 0.2);
  assert.ok(amplified.bass >= 0.3);
  assert.ok(amplified.treble >= 0.3);
  assert.equal(amplified.centroid, 0.4);
});

test("the noise gate suppresses idle microphone input", () => {
  assert.deepEqual(amplifyAudioFeatures({
    rms: 0.004,
    bass: 0.2,
    lowMid: 0.2,
    mid: 0.2,
    treble: 0.2,
    centroid: 0.5,
  }), {
    rms: 0,
    bass: 0,
    lowMid: 0,
    mid: 0,
    treble: 0,
    centroid: 0,
  });
});

test("waveform and spectrum shaping make audible input visually useful", () => {
  const waveform = amplifyWaveform(Uint8Array.from([128, 132, 124]), 0.03);
  const spectrum = shapeSpectrum(Uint8Array.from([0, 38, 128, 255]), true);

  assert.equal(waveform[0], 128);
  assert.ok(waveform[1] >= 160);
  assert.ok(waveform[2] <= 96);
  assert.equal(spectrum[0], 0);
  assert.ok(spectrum[1] >= 70);
  assert.equal(spectrum[3], 255);
});
