export type SqlValue = string | number | bigint | Uint8Array | null;
export type SqlRow = Record<string, SqlValue>;

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * SQL execution for the SQLite index (FTS5 required). The index is derived data:
 * deleting the database must cost a rebuild and nothing else.
 */
export interface Database {
  /** Run one or more statements with no parameters and no result (schema, pragmas). */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  query<T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  /** Commits when `fn` resolves, rolls back when it throws. Not re-entrant. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
