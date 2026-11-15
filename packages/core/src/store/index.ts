import { NotImplementedError } from '../errors';
import type { Unsubscribe, VaultPath } from '../platform/filesystem';
import type { Platform } from '../platform/index';
import type { Note, NoteMeta, StoreChange } from './types';

export * from './types';

/**
 * The document store: notes as block trees, backed by plain files in the vault.
 * The file on disk is the source of truth; the store is a typed view over it.
 */
export interface NoteStore {
  /** Every note path in the vault (markdown files outside `.mosaic/` and the trash). */
  list(): Promise<VaultPath[]>;
  open(path: VaultPath): Promise<Note>;
  /** Create a new note file. Fails if the path exists. */
  create(path: VaultPath, init?: { meta?: NoteMeta; markdown?: string }): Promise<Note>;
  /** Write the note. Must not touch the file when nothing changed. */
  save(note: Note): Promise<void>;
  /** Change flags (pin, colour, archive…) without rewriting the body. */
  updateMeta(path: VaultPath, patch: Partial<NoteMeta>): Promise<Note>;
  /** Move or rename; the note keeps its identity, links are the index's job. */
  move(from: VaultPath, to: VaultPath): Promise<void>;
  /** Move to `.mosaic/trash/` with 30-day recovery; never an immediate unlink. */
  trash(path: VaultPath): Promise<void>;
  restore(path: VaultPath): Promise<void>;
  onChange(listener: (change: StoreChange) => void): Unsubscribe;
  close(): Promise<void>;
}

export function createNoteStore(_platform: Platform): NoteStore {
  throw new NotImplementedError('store');
}
