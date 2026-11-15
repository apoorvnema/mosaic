import type { Clock } from './clock';
import type { Crypto } from './crypto';
import type { Database } from './database';
import type { FileSystem } from './filesystem';
import type { Logger } from './logger';
import type { Storage } from './storage';
import type { Telemetry } from './telemetry';

export * from './clock';
export * from './crypto';
export * from './database';
export * from './filesystem';
export * from './logger';
export * from './storage';
export * from './telemetry';

/** What every shell can provide — including ones with no file system. */
export interface RelayOnlyPlatform {
  readonly name: string;
  storage: Storage;
  crypto: Crypto;
  clock: Clock;
  logger: Logger;
  telemetry: Telemetry;
}

/**
 * The full adapter bundle a shell hands to core. A shell that cannot own a vault
 * folder (the Chrome extension) provides RelayOnlyPlatform instead, and the type
 * system keeps vault code away from it.
 */
export interface Platform extends RelayOnlyPlatform {
  fs: FileSystem;
  db: Database;
}
