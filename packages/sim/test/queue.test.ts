import { describe, expect, it } from 'vitest';
import { EventQueue, mulberry32 } from '../src';

describe('EventQueue', () => {
  it('is empty at start', () => {
    const q = new EventQueue();
    expect(q.size).toBe(0);
    expect(q.peek()).toBeUndefined();
    expect(q.pop()).toBeUndefined();
  });

  it('pops in time order and breaks ties by scheduling order (stable sequence id)', () => {
    const q = new EventQueue();
    const fired: string[] = [];
    const add = (t: number, name: string) => q.push(t, () => fired.push(name));
    expect(add(5, 'a')).toBe(0);
    expect(add(1, 'b')).toBe(1);
    add(5, 'c');
    add(1, 'd');
    add(3, 'e');
    add(5, 'f');
    expect(q.size).toBe(6);
    for (let ev = q.pop(); ev !== undefined; ev = q.pop()) ev.fire();
    expect(fired).toEqual(['b', 'd', 'e', 'a', 'c', 'f']);
  });

  it('matches a sort by (t, seq) on 500 seeded random events', () => {
    const rng = mulberry32(7);
    const q = new EventQueue();
    const items: Array<{ t: number; seq: number }> = [];
    for (let i = 0; i < 500; i++) {
      const t = Math.floor(rng() * 20);
      items.push({ t, seq: q.push(t, () => undefined) });
    }
    const out: Array<{ t: number; seq: number }> = [];
    for (let ev = q.pop(); ev !== undefined; ev = q.pop()) out.push({ t: ev.t, seq: ev.seq });
    expect(out).toEqual([...items].sort((a, b) => a.t - b.t || a.seq - b.seq));
  });
});
