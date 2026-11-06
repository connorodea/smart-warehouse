import { describe, expect, it } from 'vitest';
import type { ServiceTime } from '@twin/layout';
import { mulberry32, sampleServiceTime } from '../src';

const sec = (value: number) => ({ value, unit: 's' as const, source: 'owner' as const });
const draw = (d: ServiceTime, n: number, seed = 1) => {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => sampleServiceTime(d, rng));
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('mulberry32', () => {
  it('gives the same sequence for the same seed and a different one for another seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const sa = Array.from({ length: 50 }, a);
    expect(Array.from({ length: 50 }, b)).toEqual(sa);
    expect(Array.from({ length: 50 }, c)).not.toEqual(sa);
  });

  it('stays in [0, 1) and treats seeds modulo 2^32', () => {
    const r = mulberry32(-1);
    const xs = Array.from({ length: 10000 }, r);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(Math.abs(mean(xs) - 0.5)).toBeLessThan(0.02);
    expect(Array.from({ length: 5 }, mulberry32(2 ** 32 + 5))).toEqual(Array.from({ length: 5 }, mulberry32(5)));
  });

  it('is pinned: seed 1 first value never changes across releases', () => {
    expect(mulberry32(1)()).toBe(0.6270739405881613);
  });
});

describe('sampleServiceTime', () => {
  it('fixed returns the value', () => {
    expect(draw({ kind: 'fixed', value: sec(12) }, 3)).toEqual([12, 12, 12]);
  });

  it('uniform stays in [min, max] with the right mean', () => {
    const xs = draw({ kind: 'uniform', min: sec(10), max: sec(20) }, 5000);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...xs)).toBeLessThanOrEqual(20);
    expect(Math.abs(mean(xs) - 15)).toBeLessThan(0.3);
  });

  it('exponential is >= 0 with the right mean', () => {
    const xs = draw({ kind: 'exponential', mean: sec(30) }, 20000);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.abs(mean(xs) - 30) / 30).toBeLessThan(0.03);
  });

  it('normal has the right mean and clamps negative draws to 0', () => {
    const xs = draw({ kind: 'normal', mean: sec(50), stdDev: sec(5) }, 20000);
    expect(Math.abs(mean(xs) - 50)).toBeLessThan(0.2);
    const wide = draw({ kind: 'normal', mean: sec(1), stdDev: sec(10) }, 2000);
    expect(Math.min(...wide)).toBe(0);
  });

  it('lognormal mean and stdDev describe the distribution itself', () => {
    const xs = draw({ kind: 'lognormal', mean: sec(45), stdDev: sec(15) }, 40000);
    const m = mean(xs);
    const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
    expect(Math.abs(m - 45) / 45).toBeLessThan(0.02);
    expect(Math.abs(sd - 15) / 15).toBeLessThan(0.05);
    expect(Math.min(...xs)).toBeGreaterThan(0);
  });

  it('lognormal with mean 0 returns 0', () => {
    expect(draw({ kind: 'lognormal', mean: sec(0), stdDev: sec(3) }, 2)).toEqual([0, 0]);
  });
});
