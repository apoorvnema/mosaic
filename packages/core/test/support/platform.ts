import type { Platform } from '../../src/index';
import { createMemoryPlatform, withDatabase, type MemoryPlatform } from '../../src/testing/index';
import { createTestDatabase } from './sqlite';

/** Memory file system and storage, real SQLite. What most module specs want. */
export function testPlatform(options?: { now?: number; skew?: number }): MemoryPlatform & Platform {
  return withDatabase(createMemoryPlatform(options), createTestDatabase());
}
