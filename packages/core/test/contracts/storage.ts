import { describe, expect, it } from 'vitest';
import type { Storage } from '../../src/index';

export function storageContract(
  name: string,
  make: () => Promise<{ storage: Storage; cleanup?: () => Promise<void> }>,
): void {
  describe(`Storage contract: ${name}`, () => {
    async function withStorage(fn: (s: Storage) => Promise<void>): Promise<void> {
      const { storage, cleanup } = await make();
      try {
        await fn(storage);
      } finally {
        await cleanup?.();
      }
    }
    const bytes = (...n: number[]) => new Uint8Array(n);

    it('gets what was set, and undefined otherwise', () =>
      withStorage(async (s) => {
        expect(await s.get('missing')).toBeUndefined();
        await s.set('oplog/doc-1/000001', bytes(1, 2, 3));
        expect(await s.get('oplog/doc-1/000001')).toEqual(bytes(1, 2, 3));
        await s.set('oplog/doc-1/000001', bytes(9));
        expect(await s.get('oplog/doc-1/000001')).toEqual(bytes(9));
      }));

    it('lists keys by prefix in sorted order', () =>
      withStorage(async (s) => {
        await s.set('oplog/doc-1/000002', bytes(2));
        await s.set('oplog/doc-1/000001', bytes(1));
        await s.set('oplog/doc-2/000001', bytes(3));
        await s.set('index/meta', bytes(4));
        expect(await s.list('oplog/doc-1/')).toEqual(['oplog/doc-1/000001', 'oplog/doc-1/000002']);
        expect(await s.list()).toEqual([
          'index/meta',
          'oplog/doc-1/000001',
          'oplog/doc-1/000002',
          'oplog/doc-2/000001',
        ]);
      }));

    it('handles keys with awkward characters', () =>
      withStorage(async (s) => {
        const key = 'base/Notes & Ideas/What? 100%.md';
        await s.set(key, bytes(7));
        expect(await s.get(key)).toEqual(bytes(7));
        expect(await s.list('base/')).toEqual([key]);
      }));

    it('deletes keys', () =>
      withStorage(async (s) => {
        await s.set('k', bytes(1));
        await s.delete('k');
        await s.delete('k');
        expect(await s.get('k')).toBeUndefined();
        expect(await s.list()).toEqual([]);
      }));

    it('stores blobs by hash, separately from keys', () =>
      withStorage(async (s) => {
        expect(await s.hasBlob('abc123')).toBe(false);
        expect(await s.getBlob('abc123')).toBeUndefined();
        await s.putBlob('abc123', bytes(0, 255, 128));
        expect(await s.hasBlob('abc123')).toBe(true);
        expect(await s.getBlob('abc123')).toEqual(bytes(0, 255, 128));
        expect(await s.list()).toEqual([]);
        await s.deleteBlob('abc123');
        expect(await s.hasBlob('abc123')).toBe(false);
      }));
  });
}
