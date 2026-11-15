import { NotImplementedError } from '../errors';
import type { CrdtDoc } from '../crdt/index';
import type { VaultPath } from '../platform/filesystem';
import type { Platform } from '../platform/index';
import type { Block, NoteMeta } from '../store/types';

export interface ParsedMarkdown {
  meta: NoteMeta;
  blocks: Block[];
}

/**
 * Markdown (CommonMark + frontmatter + the documented extension set) to the block
 * tree. Must retain enough of the source that `serializeMarkdown(parseMarkdown(s))`
 * returns `s` byte for byte when nothing was edited.
 */
export function parseMarkdown(_source: string): ParsedMarkdown {
  throw new NotImplementedError('filebridge.parseMarkdown');
}

export function serializeMarkdown(_parsed: ParsedMarkdown): string {
  throw new NotImplementedError('filebridge.serializeMarkdown');
}

export type ReconcileResult =
  | { kind: 'unchanged' }
  /** The external edit was diffed against the base and applied as CRDT operations. */
  | { kind: 'merged'; backupPath: VaultPath }
  /** Ambiguous: surfaced once to the user, both versions kept. */
  | { kind: 'conflict'; backupPath: VaultPath; ours: string; theirs: string };

/**
 * Files and CRDTs are two sources of change. The bridge keeps a base version per
 * file, diffs external edits against it, converts the diff to CRDT operations, and
 * always copies the original to a timestamped file before merging.
 */
export interface FileBridge {
  /** Record `text` as the last version both the file and the CRDT agree on. */
  setBase(path: VaultPath, text: string): Promise<void>;
  getBase(path: VaultPath): Promise<string | undefined>;
  /** Called when the watcher reports a change the app did not make. */
  reconcileExternalChange(path: VaultPath, doc: CrdtDoc): Promise<ReconcileResult>;
  /** Write the CRDT's current state to the file and advance the base. */
  flush(path: VaultPath, doc: CrdtDoc): Promise<void>;
}

export function createFileBridge(_platform: Platform): FileBridge {
  throw new NotImplementedError('filebridge');
}
