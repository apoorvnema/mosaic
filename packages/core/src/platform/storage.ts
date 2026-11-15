/**
 * Key-value plus blob storage for app-private state: the derived index's
 * bookkeeping and the CRDT oplog. Never the home of note content the user owns —
 * that lives in the vault via FileSystem.
 *
 * Keys are `/`-separated strings, e.g. `oplog/<docId>/000042`.
 */
export interface Storage {
  get(key: string): Promise<Uint8Array | undefined>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys starting with `prefix`, sorted ascending. */
  list(prefix?: string): Promise<string[]>;

  /** Content-addressed blobs. `hash` is chosen by the caller (hex of Crypto.hash). */
  putBlob(hash: string, data: Uint8Array): Promise<void>;
  getBlob(hash: string): Promise<Uint8Array | undefined>;
  hasBlob(hash: string): Promise<boolean>;
  deleteBlob(hash: string): Promise<void>;
}
