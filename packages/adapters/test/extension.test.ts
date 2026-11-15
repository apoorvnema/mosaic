import { storageContract } from '@mosaic/core/contracts';
import { describe, expect, it } from 'vitest';
import {
  ChromeStorage,
  createExtensionPlatform,
  type StorageAreaLike,
} from '../src/extension/index';

/** chrome.storage.local, faithfully enough: JSON values only. */
function fakeArea(): StorageAreaLike & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(keys) {
      const wanted = keys == null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(
        wanted.filter((k) => data.has(k)).map((k) => [k, structuredClone(data.get(k))]),
      );
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, JSON.parse(JSON.stringify(v)));
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
    },
  };
}

storageContract('chrome.storage (fake area)', async () => ({
  storage: new ChromeStorage(fakeArea()),
}));

describe('extension platform', () => {
  it('is relay-only: no file system and no database', async () => {
    const platform = await createExtensionPlatform(fakeArea());
    expect(platform.name).toBe('extension');
    expect('fs' in platform).toBe(false);
    expect('db' in platform).toBe(false);
  });

  it('survives large values without blowing the call stack', async () => {
    const storage = new ChromeStorage(fakeArea());
    const big = new Uint8Array(300_000).map((_, i) => i % 251);
    await storage.set('big', big);
    expect(await storage.get('big')).toEqual(big);
  });
});
