import type { Clock, TimerHandle } from '../platform/clock';

/** A clock that only moves when a test says so. `skew` models a device with a wrong clock. */
export class ManualClock implements Clock {
  private timers = new Map<number, { at: number; fn: () => void }>();
  private nextId = 1;

  constructor(
    private time = 0,
    readonly skew = 0,
  ) {}

  now(): number {
    return this.time + this.skew;
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + Math.max(0, ms), fn });
    return id;
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers.delete(handle as number);
  }

  /** Move time forward, firing due timers in order. */
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | undefined;
      for (const entry of this.timers) {
        if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
      }
      if (!next) break;
      this.timers.delete(next[0]);
      this.time = next[1].at;
      next[1].fn();
    }
    this.time = end;
  }
}
