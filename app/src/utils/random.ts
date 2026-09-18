/**
 * Deterministic, dependency-free "random" number in `[0, 1)` derived from a string seed — same
 * seed always yields the same value, so simulated metrics (score jitter, latency, token counts...)
 * stay stable across reloads instead of reshuffling every render. Shared by `engine.ts` (live
 * simulate path), `metrics.ts` (Review's relevancy score), and `seed.ts` (seeded demo data) so all
 * three draw from one implementation instead of three copies quietly drifting apart.
 */
export function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return (Math.abs(h) % 1000) / 1000;
}
