/** One scheduled event. `seq` is assigned at push time and breaks ties between equal times. */
export interface QueuedEvent {
  t: number;
  seq: number;
  fire: () => void;
}

/**
 * Binary min-heap of events ordered by (t, seq). Two events at the same time fire in
 * the order they were scheduled, so a run is deterministic.
 */
export class EventQueue {
  private heap: QueuedEvent[] = [];
  private nextSeq = 0;

  get size(): number {
    return this.heap.length;
  }

  push(t: number, fire: () => void): number {
    const ev: QueuedEvent = { t, seq: this.nextSeq++, fire };
    this.heap.push(ev);
    this.up(this.heap.length - 1);
    return ev.seq;
  }

  peek(): QueuedEvent | undefined {
    return this.heap[0];
  }

  pop(): QueuedEvent | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (top !== undefined && last !== top) {
      this.heap[0] = last as QueuedEvent;
      this.down(0);
    }
    return top;
  }

  private less(i: number, j: number): boolean {
    const a = this.heap[i] as QueuedEvent;
    const b = this.heap[j] as QueuedEvent;
    return a.t < b.t || (a.t === b.t && a.seq < b.seq);
  }

  private swap(i: number, j: number): void {
    const a = this.heap[i] as QueuedEvent;
    this.heap[i] = this.heap[j] as QueuedEvent;
    this.heap[j] = a;
  }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) return;
      this.swap(i, p);
      i = p;
    }
  }

  private down(i: number): void {
    const n = this.heap.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) return;
      this.swap(i, m);
      i = m;
    }
  }
}
