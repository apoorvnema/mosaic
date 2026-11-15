import { describe, expect, it } from 'vitest';
import { normalizeVaultPath } from '../src/index';
import {
  createMemoryPlatform,
  ManualClock,
  MemoryFileSystem,
  MemoryStorage,
} from '../src/testing/index';
import {
  cryptoContract,
  databaseContract,
  fileSystemContract,
  storageContract,
} from './contracts/index';
import { createTestDatabase } from './support/sqlite';

// The in-memory fakes must obey the same contracts as the real adapters,
// otherwise every test built on them proves nothing.
fileSystemContract('memory', async () => ({ fs: new MemoryFileSystem() }));
storageContract('memory', async () => ({ storage: new MemoryStorage() }));
databaseContract('better-sqlite3 test support', async () => ({ db: createTestDatabase() }));
cryptoContract('insecure test crypto', async () => createMemoryPlatform().crypto);

describe('normalizeVaultPath', () => {
  it('normalises separators and redundant segments', () => {
    expect(normalizeVaultPath('/Work//Notes/./a.md')).toBe('Work/Notes/a.md');
    expect(normalizeVaultPath('Work\\Notes\\a.md')).toBe('Work/Notes/a.md');
    expect(normalizeVaultPath('')).toBe('');
  });
  it('refuses to leave the vault', () => {
    expect(() => normalizeVaultPath('../secrets')).toThrow();
    expect(() => normalizeVaultPath('a/../../b')).toThrow();
  });
});

describe('ManualClock', () => {
  it('fires timers in order as time advances, and applies skew to now()', () => {
    const clock = new ManualClock(1000, 5000);
    const fired: string[] = [];
    clock.setTimeout(() => fired.push('late'), 300);
    clock.setTimeout(() => fired.push('early'), 100);
    const cancelled = clock.setTimeout(() => fired.push('never'), 200);
    clock.clearTimeout(cancelled);
    expect(clock.now()).toBe(6000);
    clock.advance(150);
    expect(fired).toEqual(['early']);
    clock.advance(1000);
    expect(fired).toEqual(['early', 'late']);
    expect(clock.now()).toBe(7150);
  });
});
