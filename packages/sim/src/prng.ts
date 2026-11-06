import type { ServiceTime } from '@twin/layout';

/** A source of uniform numbers in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32: a small, fast 32-bit seeded PRNG. The same seed always gives the same
 * sequence on every JS engine, because it uses only 32-bit integer operations.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box-Muller). Uses 1 - u so the log argument is in (0, 1]. */
function standardNormal(rng: Rng): number {
  const u1 = 1 - rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Draw one service time in seconds from a station's owner-entered distribution.
 * - normal: negative draws are clamped to 0 (a service time cannot be negative).
 * - lognormal: `mean` and `stdDev` describe the distribution itself (not its log).
 */
export function sampleServiceTime(d: ServiceTime, rng: Rng): number {
  switch (d.kind) {
    case 'fixed':
      return d.value.value;
    case 'uniform':
      return d.min.value + rng() * (d.max.value - d.min.value);
    case 'exponential':
      return -d.mean.value * Math.log(1 - rng());
    case 'normal':
      return Math.max(0, d.mean.value + d.stdDev.value * standardNormal(rng));
    case 'lognormal': {
      const m = d.mean.value;
      if (m === 0) return 0;
      const s = d.stdDev.value;
      const sigma2 = Math.log(1 + (s * s) / (m * m));
      const mu = Math.log(m) - sigma2 / 2;
      return Math.exp(mu + Math.sqrt(sigma2) * standardNormal(rng));
    }
  }
}
