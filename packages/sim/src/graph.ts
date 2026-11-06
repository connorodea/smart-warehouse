import type { Layout, PathEdge } from '@twin/layout';

export interface Graph {
  ids: string[];
  index: Map<string, number>;
  x: number[];
  y: number[];
  out: Array<Array<{ edge: PathEdge; to: number }>>;
  /**
   * Heuristic scale: the smallest (edge length / straight-line distance) over all edges,
   * capped at 1. Scaling the Euclidean heuristic by it keeps A* admissible even when an
   * owner's edge is slightly shorter than the straight line between its nodes.
   */
  hScale: number;
}

export interface Route {
  cost: number;
  edges: PathEdge[];
}

export function buildGraph(layout: Layout): Graph {
  const nodes = layout.pathGraph.nodes;
  const ids = nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const x = nodes.map((n) => n.position.x);
  const y = nodes.map((n) => n.position.y);
  const out: Graph['out'] = nodes.map(() => []);
  let hScale = 1;
  for (const edge of layout.pathGraph.edges) {
    const a = index.get(edge.from) as number;
    const b = index.get(edge.to) as number;
    out[a]?.push({ edge, to: b });
    // A zero straight-line distance gives Infinity here, which Math.min ignores.
    hScale = Math.min(hScale, edge.length.value / Math.hypot((x[b] as number) - (x[a] as number), (y[b] as number) - (y[a] as number)));
  }
  return { ids, index, x, y, out, hScale };
}

/**
 * A* shortest route by edge length, heuristic = scaled Euclidean distance.
 * Ties on f are broken by the lower node index, so the route is deterministic.
 * Returns undefined when `to` cannot be reached from `from`.
 */
export function aStar(g: Graph, fromId: string, toId: string): Route | undefined {
  const from = g.index.get(fromId) as number;
  const to = g.index.get(toId) as number;
  const h = (n: number) =>
    g.hScale * Math.hypot((g.x[to] as number) - (g.x[n] as number), (g.y[to] as number) - (g.y[n] as number));
  const gScore = new Map<number, number>([[from, 0]]);
  const via = new Map<number, { edge: PathEdge; prev: number }>();
  const open = new Set<number>([from]);
  const closed = new Set<number>();
  while (open.size > 0) {
    let cur = -1;
    let curF = Infinity;
    for (const n of open) {
      const f = (gScore.get(n) as number) + h(n);
      if (f < curF || (f === curF && n < cur)) {
        cur = n;
        curF = f;
      }
    }
    if (cur === to) {
      const edges: PathEdge[] = [];
      for (let n = to; n !== from; ) {
        const step = via.get(n) as { edge: PathEdge; prev: number };
        edges.unshift(step.edge);
        n = step.prev;
      }
      return { cost: gScore.get(to) as number, edges };
    }
    open.delete(cur);
    closed.add(cur);
    for (const { edge, to: m } of g.out[cur] as Graph['out'][number]) {
      if (closed.has(m)) continue;
      const tentative = (gScore.get(cur) as number) + edge.length.value;
      const known = gScore.get(m);
      if (known === undefined || tentative < known) {
        gScore.set(m, tentative);
        via.set(m, { edge, prev: cur });
        open.add(m);
      }
    }
  }
  return undefined;
}

/** Node ids reachable from `start` along directed edges (forward) or against them (backward). */
export function reach(g: Graph, start: string, backward: boolean): Set<string> {
  const adj = new Map<string, string[]>();
  for (const list of g.out) {
    for (const { edge } of list) {
      const [a, b] = backward ? [edge.to, edge.from] : [edge.from, edge.to];
      adj.set(a, [...(adj.get(a) ?? []), b]);
    }
  }
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length > 0) {
    const n = stack.pop() as string;
    for (const m of adj.get(n) ?? []) {
      if (!seen.has(m)) {
        seen.add(m);
        stack.push(m);
      }
    }
  }
  return seen;
}
