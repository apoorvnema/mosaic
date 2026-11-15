import { NotImplementedError } from '../errors';
import type { CrdtUpdate, StateVector } from '../crdt/index';
import type { Unsubscribe } from '../platform/filesystem';
import type { RelayOnlyPlatform } from '../platform/index';

export type SyncState = 'offline' | 'connecting' | 'syncing' | 'idle';

export interface SyncStatus {
  state: SyncState;
  /** Updates written locally and not yet acknowledged by the relay. */
  pending: number;
  lastSyncedAt?: number;
  lastError?: string;
}

/**
 * The wire, abstracted so tests can drop, delay and reorder messages. The real
 * transport is WebSocket for live updates and HTTP for cold start.
 */
export interface RelayTransport {
  connect(): Promise<void>;
  disconnect(): void;
  /** Resolves when the relay has durably appended the update (the acknowledgement). */
  push(docId: string, update: CrdtUpdate): Promise<void>;
  /** Everything the relay has that `since` lacks. */
  pull(docId: string, since: StateVector): Promise<CrdtUpdate[]>;
  onUpdate(listener: (docId: string, update: CrdtUpdate) => void): Unsubscribe;
  onDisconnect(listener: () => void): Unsubscribe;
}

/**
 * Sync client: offline queue persisted in Storage, reconnect with backoff,
 * per-device status. Works on RelayOnlyPlatform — the extension is a sync client
 * with no vault folder.
 */
export interface SyncClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Queue a local update. Durable before this resolves; survives a restart. */
  enqueue(docId: string, update: CrdtUpdate): Promise<void>;
  status(): SyncStatus;
  onStatus(listener: (status: SyncStatus) => void): Unsubscribe;
  /** Remote updates to apply to the local CRDT document. */
  onRemoteUpdate(listener: (docId: string, update: CrdtUpdate) => void): Unsubscribe;
}

export function createSyncClient(
  _platform: RelayOnlyPlatform,
  _transport: RelayTransport,
): SyncClient {
  throw new NotImplementedError('sync');
}
