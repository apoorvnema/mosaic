import type { Database, RunResult, SqlRow, SqlValue } from '@mosaic/core';
import * as SQLite from '@journeyapps/wa-sqlite';
import SQLiteAsyncFactory from '@journeyapps/wa-sqlite/dist/wa-sqlite-async.mjs';
// @ts-expect-error The package ships types for its API but not for this example VFS.
import { OPFSAnyContextVFS as UntypedVfs } from '@journeyapps/wa-sqlite/src/examples/OPFSAnyContextVFS.js';

const OPFSAnyContextVFS = UntypedVfs as {
  create(name: string, module: unknown, options?: object): Promise<SQLiteVFS>;
};

/**
 * SQLite in the browser: wa-sqlite (asyncify build) over the Origin Private File
 * System. Runs on the calling thread today; the Database interface is async, so
 * moving it into a worker later changes nothing above this file. See docs/adr/0005.
 */
export async function createWebDatabase(name = 'mosaic-index.sqlite'): Promise<Database> {
  const module = await SQLiteAsyncFactory();
  const sqlite3 = SQLite.Factory(module);
  const vfs = await OPFSAnyContextVFS.create('mosaic-opfs', module);
  sqlite3.vfs_register(vfs, true);
  const db = await sqlite3.open_v2(name);

  // wa-sqlite is single-connection and not re-entrant: serialise every call.
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => undefined);
    return next;
  };

  async function all(sql: string, params: readonly SqlValue[]): Promise<SqlRow[]> {
    const rows: SqlRow[] = [];
    for await (const stmt of sqlite3.statements(db, sql)) {
      if (params.length) sqlite3.bind_collection(stmt, params as SQLiteCompatibleType[]);
      const columns = sqlite3.column_names(stmt);
      while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
        const values = sqlite3.row(stmt);
        const row: SqlRow = {};
        columns.forEach((column, i) => {
          const value = values[i];
          // Blob memory is only valid until the next step: copy it out.
          row[column] = value instanceof Uint8Array ? value.slice() : ((value ?? null) as SqlValue);
        });
        rows.push(row);
      }
    }
    return rows;
  }

  let inTransaction = false;
  const direct = {
    exec: async (sql: string) => void (await sqlite3.exec(db, sql)),
    run: async (sql: string, params: readonly SqlValue[] = []): Promise<RunResult> => {
      await all(sql, params);
      return { changes: sqlite3.changes(db), lastInsertRowid: sqlite3.last_insert_id(db) };
    },
    query: async <T extends SqlRow>(sql: string, params: readonly SqlValue[] = []) =>
      (await all(sql, params)) as T[],
  };

  // While a transaction is open, calls from anywhere (its own callback, or the UI
  // reading at the same moment) queue on a second chain so the connection is never
  // re-entered. They run inside the transaction, which is harmless for reads.
  let txTail: Promise<unknown> = Promise.resolve();
  const queue = <T>(fn: () => Promise<T>): Promise<T> => {
    if (!inTransaction) return serial(fn);
    const next = txTail.then(fn, fn);
    txTail = next.catch(() => undefined);
    return next;
  };

  return {
    exec: (sql) => queue(() => direct.exec(sql)),
    run: (sql, params) => queue(() => direct.run(sql, params)),
    query: <T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]) =>
      queue(() => direct.query<T>(sql, params)),
    transaction: <T>(fn: () => Promise<T>) =>
      serial(async () => {
        await direct.exec('begin immediate');
        inTransaction = true;
        try {
          const value = await fn();
          await txTail;
          inTransaction = false;
          await direct.exec('commit');
          return value;
        } catch (error) {
          await txTail;
          inTransaction = false;
          await direct.exec('rollback');
          throw error;
        }
      }),
    close: () => serial(async () => void (await sqlite3.close(db))),
  };
}
