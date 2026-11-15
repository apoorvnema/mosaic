import type { VaultPath } from '../platform/filesystem';

/** Stable block identifier. Only written to disk once something references the block. */
export type BlockId = string;

/** The twelve stable note colours. The meaning is the user's; the set never changes. */
export const NOTE_COLORS = [
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'indigo',
  'blue',
  'teal',
  'green',
  'lime',
  'brown',
  'gray',
] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export type TextBlockType =
  'paragraph' | 'heading' | 'list-item' | 'task' | 'quote' | 'callout' | 'code' | 'table-row';
export type EmbedBlockType = 'image' | 'file' | 'audio' | 'bookmark' | 'block-ref' | 'query';
export type DiagramBlockType = 'mermaid' | 'drawing';
export type BlockType = TextBlockType | EmbedBlockType | DiagramBlockType;

export interface Block {
  /** Present only when materialised (something links to this block). */
  id?: BlockId;
  type: BlockType;
  /** Inline markdown source for text blocks; target for embeds; source for diagrams. */
  text: string;
  /** Type-specific properties: heading level, task checked, code language, list ordering… */
  props: Record<string, string | number | boolean>;
  children: Block[];
}

/**
 * Flags and properties stored in YAML frontmatter. Pinning, colour and archive are
 * flags on the note — never a separate object, never a copy.
 */
export interface NoteMeta {
  title?: string;
  pinned?: boolean;
  /** Desktop sticky window: on top of every application. */
  sticky?: boolean;
  archived?: boolean;
  color?: NoteColor;
  labels?: string[];
  /** Everything else in the frontmatter, preserved verbatim, including unknown keys. */
  [key: string]: unknown;
}

export interface Note {
  path: VaultPath;
  meta: NoteMeta;
  blocks: Block[];
}

export type StoreChange =
  | { kind: 'saved'; path: VaultPath; origin: 'local' | 'external' | 'sync' }
  | { kind: 'deleted'; path: VaultPath }
  | { kind: 'moved'; from: VaultPath; to: VaultPath };
