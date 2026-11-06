import { describe, expect, it } from 'vitest';
import type { Layout } from '@twin/layout';
import { aStar, buildGraph, reach } from '../src';

// Minimal hand-built graph (TEST FIXTURE); only pathGraph is read by buildGraph.
const node = (id: string, x: number, y: number) => ({ id, position: { x, y, unit: 'm' as const, source: 'cad' as const } });
const edge = (id: string, from: string, to: string, len: number) => ({
  id,
  from,
  to,
  length: { value: len, unit: 'm' as const, source: 'derived' as const },
  capacity: { value: 1 as const, unit: 'vehicles' as const, source: 'derived' as const },
});
const graphOf = (nodes: ReturnType<typeof node>[], edges: ReturnType<typeof edge>[]) =>
  buildGraph({ pathGraph: { nodes, edges } } as unknown as Layout);

describe('aStar', () => {
  // A square A(0,0) B(10,0) C(10,10) D(0,10); A->B->C costs 20, A->D->C costs 20 too, A->C direct 15.
  const nodes = [node('A', 0, 0), node('B', 10, 0), node('C', 10, 10), node('D', 0, 10), node('X', 50, 50)];

  it('returns a zero route from a node to itself', () => {
    expect(aStar(graphOf(nodes, []), 'A', 'A')).toEqual({ cost: 0, edges: [] });
  });

  it('finds the shortest route', () => {
    const g = graphOf(nodes, [edge('AB', 'A', 'B', 10), edge('BC', 'B', 'C', 10), edge('AD', 'A', 'D', 10), edge('DC', 'D', 'C', 10), edge('AC', 'A', 'C', 15)]);
    const r = aStar(g, 'A', 'C');
    expect(r?.cost).toBe(15);
    expect(r?.edges.map((e) => e.id)).toEqual(['AC']);
  });

  it('breaks equal-cost ties deterministically by node order', () => {
    const g = graphOf(nodes, [edge('AD', 'A', 'D', 10), edge('DC', 'D', 'C', 10), edge('AB', 'A', 'B', 10), edge('BC', 'B', 'C', 10)]);
    expect(aStar(g, 'A', 'C')?.edges.map((e) => e.id)).toEqual(['AB', 'BC']);
  });

  it('improves a node it already reached through a cheaper later route', () => {
    // A->C is found first at cost 30, then A->B->C at cost 20 replaces it.
    const g = graphOf(nodes, [edge('AC', 'A', 'C', 30), edge('AB', 'A', 'B', 10), edge('BC', 'B', 'C', 10), edge('CB', 'C', 'B', 1)]);
    const r = aStar(g, 'A', 'C');
    expect(r?.cost).toBe(20);
    expect(r?.edges.map((e) => e.id)).toEqual(['AB', 'BC']);
  });

  it('skips closed nodes and keeps an equal-cost known route', () => {
    const line = [node('A', 0, 0), node('B', 10, 0), node('C', 20, 0), node('D', 30, 0)];
    const g = graphOf(line, [edge('AB', 'A', 'B', 10), edge('AC', 'A', 'C', 20), edge('BA', 'B', 'A', 10), edge('BC', 'B', 'C', 10), edge('CD', 'C', 'D', 10)]);
    const r = aStar(g, 'A', 'D');
    expect(r?.cost).toBe(30);
    expect(r?.edges.map((e) => e.id)).toEqual(['AC', 'CD']);
  });

  it('returns undefined when the target cannot be reached', () => {
    const g = graphOf(nodes, [edge('AB', 'A', 'B', 10)]);
    expect(aStar(g, 'A', 'X')).toBeUndefined();
  });

  it('scales the heuristic down when an edge is shorter than the straight line, staying optimal', () => {
    const g = graphOf(nodes, [edge('AB', 'A', 'B', 5), edge('BC', 'B', 'C', 10), edge('AC', 'A', 'C', 14.9)]);
    expect(g.hScale).toBe(0.5);
    expect(aStar(g, 'A', 'C')?.cost).toBe(14.9);
  });

  it('ignores edges between nodes at the same position when scaling the heuristic', () => {
    const g = graphOf([node('A', 0, 0), node('B', 0, 0)], [edge('AB', 'A', 'B', 3)]);
    expect(g.hScale).toBe(1);
    expect(aStar(g, 'A', 'B')?.cost).toBe(3);
  });
});

describe('reach', () => {
  it('follows edges forward or backward', () => {
    const g = graphOf([node('A', 0, 0), node('B', 1, 0), node('C', 2, 0)], [edge('AB', 'A', 'B', 1), edge('BC', 'B', 'C', 1), edge('AC', 'A', 'C', 2)]);
    expect([...reach(g, 'A', false)].sort()).toEqual(['A', 'B', 'C']);
    expect([...reach(g, 'A', true)]).toEqual(['A']);
    expect([...reach(g, 'C', true)].sort()).toEqual(['A', 'B', 'C']);
  });
});
