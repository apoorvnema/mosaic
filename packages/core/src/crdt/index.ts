import { NotImplementedError } from '../errors';
import type { Unsubscribe } from '../platform/filesystem';
import type { Note } from '../store/types';

/** An opaque Yjs binary update. The relay stores these and never parses them. */
export type CrdtUpdate = Uint8Array;
export type StateVector = Uint8Array;

/** Where an update came from; lets listeners skip their own echoes. */
export type UpdateOrigin = 'local' | 'remote' | 'file';

/**
 * One CRDT document per note (Yjs — see docs/adr/0003). Text merges as a sequence
 * CRDT; frontmatter properties are last-writer-wins per field.
 */
export interface CrdtDoc {
  /** Load a note's content into an empty document. */
  loadNote(note: Note): void;
  /** The current merged state, as a note. */
  toNote(): Note;
  /** Replace body text by diffing against the current text (used by the file bridge). */
  applyTextDiff(nextMarkdown: string, origin: UpdateOrigin): void;
  setMeta(key: string, value: unknown, origin: UpdateOrigin): void;
  applyUpdate(update: CrdtUpdate, origin: UpdateOrigin): void;
  encodeState(): CrdtUpdate;
  encodeStateVector(): StateVector;
  /** The updates a peer with `remote` state is missing. */
  encodeDiff(remote: StateVector): CrdtUpdate;
  onUpdate(listener: (update: CrdtUpdate, origin: UpdateOrigin) => void): Unsubscribe;
  destroy(): void;
}

export function createCrdtDoc(_options?: { clientId?: number }): CrdtDoc {
  throw new NotImplementedError('crdt');
}

/** Merge many updates into one snapshot without instantiating a document. */
export function compactUpdates(_updates: readonly CrdtUpdate[]): CrdtUpdate {
  throw new NotImplementedError('crdt.compactUpdates');
}
