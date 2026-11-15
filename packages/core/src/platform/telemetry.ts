/**
 * Opt-in only. The default implementation on every platform is a no-op; nothing
 * is recorded or sent unless the user turns it on. Never pass note content.
 */
export interface Telemetry {
  event(name: string, properties?: Record<string, string | number | boolean>): void;
  /** Record a measured duration against a performance budget, e.g. `search.query`. */
  timing(name: string, ms: number): void;
}
