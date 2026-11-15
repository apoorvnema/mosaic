import { describe, expect, it } from 'vitest';
import type { Database } from '../../src/index';

export function databaseContract(
  name: string,
  make: () => Promise<{ db: Database; cleanup?: () => Promise<void> }>,
): void {
  describe(`Database contract: ${name}`, () => {
    async function withDb(fn: (db: Database) => Promise<void>): Promise<void> {
      const { db, cleanup } = await make();
      try {
        await fn(db);
      } finally {
        await db.close();
        await cleanup?.();
      }
    }

    it('runs statements with parameters and returns rows', () =>
      withDb(async (db) => {
        await db.exec('create table notes (path text primary key, title text, size integer)');
        const result = await db.run('insert into notes values (?, ?, ?)', ['a.md', 'Alpha', 12]);
        expect(result.changes).toBe(1);
        await db.run('insert into notes values (?, ?, ?)', ['b.md', null, 0]);
        const rows = await db.query<{ path: string; title: string | null; size: number }>(
          'select * from notes order by path',
        );
        expect(rows).toEqual([
          { path: 'a.md', title: 'Alpha', size: 12 },
          { path: 'b.md', title: null, size: 0 },
        ]);
      }));

    it('round-trips blobs', () =>
      withDb(async (db) => {
        await db.exec('create table b (data blob)');
        await db.run('insert into b values (?)', [new Uint8Array([1, 2, 255])]);
        const [row] = await db.query<{ data: Uint8Array }>('select data from b');
        expect(new Uint8Array(row!.data)).toEqual(new Uint8Array([1, 2, 255]));
      }));

    it('commits a transaction, and rolls back when it throws', () =>
      withDb(async (db) => {
        await db.exec('create table t (n integer)');
        await db.transaction(async () => {
          await db.run('insert into t values (1)');
          await db.run('insert into t values (2)');
        });
        await expect(
          db.transaction(async () => {
            await db.run('insert into t values (3)');
            throw new Error('boom');
          }),
        ).rejects.toThrow('boom');
        const rows = await db.query<{ n: number }>('select n from t order by n');
        expect(rows.map((r) => r.n)).toEqual([1, 2]);
      }));

    it('supports FTS5, which the search index depends on', () =>
      withDb(async (db) => {
        await db.exec('create virtual table fts using fts5(path unindexed, body)');
        await db.run('insert into fts values (?, ?)', ['a.md', 'the quick brown fox']);
        await db.run('insert into fts values (?, ?)', ['b.md', 'lazy dogs sleep']);
        const rows = await db.query<{ path: string }>(
          'select path from fts where fts match ? order by rank',
          ['quick'],
        );
        expect(rows).toEqual([{ path: 'a.md' }]);
      }));
  });
}
