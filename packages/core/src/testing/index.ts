import type { Database } from '../platform/database';
import type { Platform, RelayOnlyPlatform } from '../platform/index';
import { ManualClock } from './manual-clock';
import { MemoryFileSystem } from './memory-fs';
import { InsecureTestCrypto, MemoryLogger, MemoryTelemetry } from './memory-misc';
import { MemoryStorage } from './memory-storage';

export * from './manual-clock';
export * from './memory-fs';
export * from './memory-misc';
export * from './memory-storage';

export interface MemoryPlatform extends RelayOnlyPlatform {
  storage: MemoryStorage;
  clock: ManualClock;
  logger: MemoryLogger;
  telemetry: MemoryTelemetry;
  fs: MemoryFileSystem;
}

/**
 * A complete in-memory platform for headless tests, minus SQL: there is no pure
 * in-memory SQLite, so tests that need `db` pass a real one (see test/support).
 */
export function createMemoryPlatform(
  options: { now?: number; skew?: number } = {},
): MemoryPlatform {
  const clock = new ManualClock(options.now ?? 1_700_000_000_000, options.skew ?? 0);
  return {
    name: 'memory',
    storage: new MemoryStorage(),
    crypto: new InsecureTestCrypto(),
    clock,
    logger: new MemoryLogger(),
    telemetry: new MemoryTelemetry(),
    fs: new MemoryFileSystem(() => clock.now()),
  };
}

export function withDatabase(platform: MemoryPlatform, db: Database): MemoryPlatform & Platform {
  return { ...platform, db };
}
