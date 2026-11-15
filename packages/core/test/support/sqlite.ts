import BetterSqlite3 from 'better-sqlite3';
import type { Database, RunResult, SqlRow, SqlValue } from '../../src/index';

/**
 * A real in-memory SQLite for core's own tests. Core cannot depend on
 * @mosaic/adapters (the dependency points the other way), so this small wrapper
 * is test support, outside src/ and outside the import-boundary rule.
 */
export function createTestDatabase(): Database {
  const db = new BetterSqlite3(':memory:');
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
      return db.prepare(sql).all(...params) as T[];
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      db.exec('begin');
      try {
        const value = await fn();
        db.exec('commit');
        return value;
      } catch (error) {
        db.exec('rollback');
        throw error;
      }
    },
    async close(): Promise<void> {
      db.close();
    },
  };
}
