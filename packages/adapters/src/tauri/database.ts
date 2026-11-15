import type { Database, RunResult, SqlRow, SqlValue } from '@mosaic/core';
import TauriSql from '@tauri-apps/plugin-sql';

/**
 * SQLite through Tauri's sql plugin. `file` is an absolute path to the index.
 * NOT exercised in the cloud dev environment: verify on a real build, including
 * that the bundled SQLite has FTS5 (databaseContract checks it).
 */
export async function createTauriDatabase(file: string): Promise<Database> {
  const db = await TauriSql.load(`sqlite:${file}`);
  const bind = (params: readonly SqlValue[] = []) =>
    params.map((p) =>
      p instanceof Uint8Array ? Array.from(p) : typeof p === 'bigint' ? Number(p) : p,
    );
  let inTransaction = false;
  return {
    exec: async (sql) => void (await db.execute(sql)),
    async run(sql, params): Promise<RunResult> {
      const result = await db.execute(sql, bind(params));
      return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertId ?? 0 };
    },
    async query<T extends SqlRow = SqlRow>(
      sql: string,
      params?: readonly SqlValue[],
    ): Promise<T[]> {
      const rows = await db.select<Record<string, unknown>[]>(sql, bind(params));
      for (const row of rows) {
        for (const key in row)
          if (Array.isArray(row[key])) row[key] = new Uint8Array(row[key] as number[]);
      }
      return rows as T[];
    },
    // The sql plugin uses a connection pool, so BEGIN/COMMIT across calls is only
    // safe with a pool of one. The desktop config must set that; see ADR 0005.
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (inTransaction) throw new Error('Database.transaction is not re-entrant');
      inTransaction = true;
      await db.execute('begin immediate');
      try {
        const value = await fn();
        await db.execute('commit');
        return value;
      } catch (error) {
        await db.execute('rollback');
        throw error;
      } finally {
        inTransaction = false;
      }
    },
    close: async () => void (await db.close()),
  };
}
