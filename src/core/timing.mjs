export const CANONICAL_FPS = 30;

const TAP_RESET_MS = 2_000;
const MAX_TEMPO_TAPS = 5;
const REFERENCE_BPM = 120;

export function frameNumberAt({ baseFrame, elapsedMs, speed, playing }) {
  if (!playing || speed === 0) return baseFrame;
  return baseFrame + Math.floor(Math.max(0, elapsedMs) * CANONICAL_FPS * (speed / 100) / 1_000);
}

export function recordTempoTap(taps, timestamp) {
  const previous = taps.at(-1);
  const reset = previous === undefined || timestamp <= previous || timestamp - previous > TAP_RESET_MS;
  const nextTaps = (reset ? [timestamp] : [...taps, timestamp]).slice(-MAX_TEMPO_TAPS);
  if (nextTaps.length < 2) return { taps: nextTaps, bpm: null, speed: null };

  const elapsed = nextTaps.at(-1) - nextTaps[0];
  const bpm = Math.round(60_000 * (nextTaps.length - 1) / elapsed);
  const speed = Math.min(400, Math.max(1, Math.round(bpm / REFERENCE_BPM * 100)));
  return { taps: nextTaps, bpm, speed };
}
