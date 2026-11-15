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
/** `divider` is a thematic break (`---`). Not in the plan's table; markdown has it. */
export type BlockType = TextBlockType | EmbedBlockType | DiagramBlockType | 'divider';

/**
 * What the parser remembers about a block's original text, so that a block nobody
 * edited is written back byte for byte. Opaque to everything except filebridge.
 */
export interface BlockSource {
  /** The block's own lines, exactly as they were in the file. */
  raw: string;
  /** Blank lines that followed it. */
  trailing: string;
  /** Fingerprint of the block's fields at parse time; a mismatch means "edited". */
  snapshot: string;
  /** Leading whitespace of a list item, and the marker it used (`-`, `*`, `1.`…). */
  indent: string;
  marker?: string;
  /** Set when the block no longer follows the block it followed in the file (it was moved). */
  detached?: boolean;
}

export interface NoteSource {
  /** The frontmatter block including its `---` fences, or '' when there is none. */
  frontmatter: string;
  metaSnapshot: string;
  /** Blank lines before the first block. */
  leading: string;
  eol: '\n' | '\r\n';
}

export interface Block {
  /** Present only when materialised (something links to this block). */
  id?: BlockId;
  type: BlockType;
  /** Inline markdown source for text blocks; target for embeds; source for diagrams. */
  text: string;
  /** Type-specific properties: heading level, task checked, code language, list ordering… */
  props: Record<string, string | number | boolean>;
  children: Block[];
  source?: BlockSource;
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
  source?: NoteSource;
}

export type StoreChange =
  | { kind: 'saved'; path: VaultPath; origin: 'local' | 'external' | 'sync' }
  | { kind: 'deleted'; path: VaultPath }
  | { kind: 'moved'; from: VaultPath; to: VaultPath };
