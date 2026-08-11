import {
  amplifyAudioFeatures,
  amplifyWaveform,
  compressSpectrum,
  extractAudioFeatures,
  shapeSpectrum,
  smoothAudioFeatures,
} from "/core/audio-reactivity.mjs";

const SILENT_FEATURES = Object.freeze({
  rms: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  treble: 0,
  centroid: 0,
});

export function silentAudioFrame() {
  return {
    features: { ...SILENT_FEATURES },
    waveform: new Uint8Array(1024).fill(128),
    spectrum: new Uint8Array(64),
  };
}

export async function createMicrophoneAudioInput() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone input is unavailable in this browser");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
    },
    video: false,
  });

  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) {
    for (const track of stream.getTracks()) track.stop();
    throw new Error("Web Audio is unavailable in this browser");
  }

  const context = new AudioContextClass();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.minDecibels = -90;
  analyser.maxDecibels = -20;
  analyser.smoothingTimeConstant = 0.68;
  context.createMediaStreamSource(stream).connect(analyser);
  await context.resume();

  const waveform = new Uint8Array(analyser.fftSize);
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  const smoothedSpectrum = new Uint8Array(64);
  let features = { ...SILENT_FEATURES };
  let stopped = false;

  return {
    sample() {
      if (stopped) return silentAudioFrame();
      analyser.getByteTimeDomainData(waveform);
      analyser.getByteFrequencyData(frequencyData);
      const measured = extractAudioFeatures({
        timeDomain: waveform,
        frequencyData,
        sampleRate: context.sampleRate,
      });
      features = smoothAudioFeatures(features, amplifyAudioFeatures(measured));
      const compressed = shapeSpectrum(
        compressSpectrum(frequencyData, smoothedSpectrum.length),
        measured.rms > 0.006,
      );
      for (let index = 0; index < smoothedSpectrum.length; index += 1) {
        const rate = compressed[index] >= smoothedSpectrum[index] ? 0.55 : 0.18;
        smoothedSpectrum[index] = Math.round(
          smoothedSpectrum[index] + (compressed[index] - smoothedSpectrum[index]) * rate,
        );
      }
      return {
        features,
        waveform: amplifyWaveform(waveform, measured.rms),
        spectrum: smoothedSpectrum,
      };
    },

    async stop() {
      if (stopped) return;
      stopped = true;
      for (const track of stream.getTracks()) track.stop();
      await context.close();
    },
  };
}
