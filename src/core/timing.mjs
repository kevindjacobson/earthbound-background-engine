export const CANONICAL_FPS = 30;

export function frameNumberAt({ baseFrame, elapsedMs, speed, playing }) {
  if (!playing || speed === 0) return baseFrame;
  return baseFrame + Math.floor(Math.max(0, elapsedMs) * CANONICAL_FPS * (speed / 100) / 1_000);
}
