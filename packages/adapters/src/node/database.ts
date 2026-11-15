import type { Database, RunResult, SqlRow, SqlValue } from '@mosaic/core';
import BetterSqlite3 from 'better-sqlite3';

/** SQLite via better-sqlite3. `file` may be `:memory:`. */
export function createNodeDatabase(file: string): Database {
  const db = new BetterSqlite3(file);
  db.pragma('journal_mode = WAL');
  let inTransaction = false;
  return {
    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },
    async run(sql: string, params: readonly SqlValue[] = []): Promise<RunResult> {
      const result = db.prepare(sql).run(...params);
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    },
    async query<T extends SqlRow = SqlRow>(
      sql: string,
      params: readonly SqlValue[] = [],
    ): Promise<T[]> {
      const rows = db.prepare(sql).all(...params) as SqlRow[];
      for (const row of rows) {
        for (const key in row) {
          const value = row[key];
          // better-sqlite3 returns Buffers; hand core plain Uint8Arrays.
          if (value instanceof Uint8Array) row[key] = new Uint8Array(value);
        }
      }
      return rows as T[];
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (inTransaction) throw new Error('Database.transaction is not re-entrant');
      inTransaction = true;
      db.exec('begin immediate');
      try {
        const value = await fn();
        db.exec('commit');
        return value;
      } catch (error) {
        db.exec('rollback');
        throw error;
      } finally {
        inTransaction = false;
      }
    },
    async close(): Promise<void> {
      db.close();
    },
  };
}
