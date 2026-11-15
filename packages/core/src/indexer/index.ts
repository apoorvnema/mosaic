import { NotImplementedError } from '../errors';
import type { VaultPath } from '../platform/filesystem';
import type { Platform } from '../platform/index';
import type { NoteMeta } from '../store/types';

export interface IndexedNote {
  path: VaultPath;
  title: string;
  meta: NoteMeta;
  /** First lines of body text, for cards and list rows. */
  preview: string;
  modifiedAt: number;
}

export interface LinkRef {
  from: VaultPath;
  to: VaultPath;
  /** The block containing the link, when it has a materialised id. */
  blockId?: string;
}

export interface NoteQuery {
  /** Only notes under this folder (a notebook or section). */
  folder?: VaultPath;
  pinned?: boolean;
  archived?: boolean;
  label?: string;
  orderBy?: 'modified' | 'title' | 'path';
  limit?: number;
}

/**
 * The SQLite index over the vault. Derived, never authoritative: wiping it and
 * calling `rebuild()` must reproduce exactly the same observable state.
 */
export interface VaultIndex {
  /** Drop everything and re-derive from the files alone. */
  rebuild(): Promise<{ notes: number; ms: number }>;
  /** Re-index one file after it changed (or remove it if it is gone). */
  refresh(path: VaultPath): Promise<void>;
  get(path: VaultPath): Promise<IndexedNote | undefined>;
  query(query?: NoteQuery): Promise<IndexedNote[]>;
  backlinks(path: VaultPath): Promise<LinkRef[]>;
  outboundLinks(path: VaultPath): Promise<LinkRef[]>;
  labels(): Promise<{ label: string; count: number }[]>;
  /** A stable digest of the whole index, for the wipe-and-rebuild test. */
  fingerprint(): Promise<string>;
}

export function createVaultIndex(_platform: Platform): VaultIndex {
  throw new NotImplementedError('indexer');
}
