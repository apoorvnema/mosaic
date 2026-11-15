export type TimerHandle = { readonly __timer: unique symbol } | number | object;

/** All time and timers go through here so tests can skew and control them. */
export interface Clock {
  /** Milliseconds since the epoch. */
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}
