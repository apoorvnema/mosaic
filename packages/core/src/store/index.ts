import { parseMarkdown, serializeMarkdown } from '../filebridge/markdown';
import {
  normalizeVaultPath,
  type FileChange,
  type Unsubscribe,
  type VaultPath,
} from '../platform/filesystem';
import type { Platform } from '../platform/index';
import type { Note, NoteMeta, StoreChange } from './types';

export * from './types';

/**
 * The document store: notes as block trees, backed by plain files in the vault.
 * The file on disk is the source of truth; the store is a typed view over it.
 */
export interface NoteStore {
  /** Every note path in the vault (markdown files outside hidden folders). */
  list(): Promise<VaultPath[]>;
  open(path: VaultPath): Promise<Note>;
  /** Create a new note file. Fails if the path exists. */
  create(path: VaultPath, init?: { meta?: NoteMeta; markdown?: string }): Promise<Note>;
  /** Write the note. Must not touch the file when nothing changed. */
  save(note: Note): Promise<void>;
  /** Change flags (pin, colour, archive…) without rewriting the body. `undefined` removes a key. */
  updateMeta(path: VaultPath, patch: Partial<NoteMeta>): Promise<Note>;
  /** Move or rename; the note keeps its identity, links are the index's job. */
  move(from: VaultPath, to: VaultPath): Promise<void>;
  /** Move to `.mosaic/trash/`; never an immediate unlink. */
  trash(path: VaultPath): Promise<void>;
  restore(path: VaultPath): Promise<void>;
  /** Store a media file under `_media/` and return its vault path. Never overwrites. */
  addMedia(name: string, data: Uint8Array): Promise<VaultPath>;
  readMedia(path: VaultPath): Promise<Uint8Array>;
  onChange(listener: (change: StoreChange) => void): Unsubscribe;
  close(): Promise<void>;
}

export const TRASH_DIR = '.mosaic/trash';
export const MEDIA_DIR = '_media';
/** How long after one of our own writes a watcher event may still be its echo. */
const ECHO_WINDOW_MS = 3000;

/** A note is a markdown file that is not inside a hidden (dot) folder. */
export function isNotePath(path: VaultPath): boolean {
  return (
    /\.(md|markdown)$/i.test(path) && !path.split('/').some((segment) => segment.startsWith('.'))
  );
}

export function createNoteStore(platform: Platform): NoteStore {
  const { fs, clock } = platform;
  const listeners = new Set<(change: StoreChange) => void>();
  /** What we last wrote to each path, to tell our own echo from an external edit. */
  const ownWrites = new Map<VaultPath, { text: string | undefined; at: number }>();
  let stopWatching: Unsubscribe | undefined;

  const emit = (change: StoreChange) => listeners.forEach((listener) => listener(change));
  const remember = (path: VaultPath, text: string | undefined) =>
    ownWrites.set(path, { text, at: clock.now() });

  function onFileChange(change: FileChange): void {
    if (!isNotePath(change.path)) return;
    const own = ownWrites.get(change.path);
    const recent = own !== undefined && clock.now() - own.at < ECHO_WINDOW_MS;
    if (change.kind === 'deleted') {
      if (recent && own.text === undefined) return;
      emit({ kind: 'deleted', path: change.path });
      return;
    }
    if (!recent || own.text === undefined) {
      emit({ kind: 'saved', path: change.path, origin: 'external' });
      return;
    }
    // Probably our own write coming back. Only the content can say for sure.
    void fs.readText(change.path).then(
      (text) => text !== own.text && emit({ kind: 'saved', path: change.path, origin: 'external' }),
      () => undefined,
    );
  }

  async function open(path: VaultPath): Promise<Note> {
    const normalized = normalizeVaultPath(path);
    return { path: normalized, ...parseMarkdown(await fs.readText(normalized)) };
  }

  async function save(note: Note): Promise<void> {
    const text = serializeMarkdown(note);
    const current = (await fs.exists(note.path)) ? await fs.readText(note.path) : undefined;
    if (current === text) return;
    remember(note.path, text);
    await fs.write(note.path, text);
    emit({ kind: 'saved', path: note.path, origin: 'local' });
  }

  async function move(from: VaultPath, to: VaultPath, announce = true): Promise<void> {
    const source = normalizeVaultPath(from);
    const target = normalizeVaultPath(to);
    remember(source, undefined);
    remember(target, await fs.readText(source));
    await fs.move(source, target);
    if (announce) emit({ kind: 'moved', from: source, to: target });
  }

  return {
    async list() {
      const entries = await fs.list('', { recursive: true });
      return entries
        .filter((entry) => entry.kind === 'file' && isNotePath(entry.path))
        .map((entry) => entry.path);
    },
    open,
    save,

    async create(path, init = {}) {
      const normalized = normalizeVaultPath(path);
      if (await fs.exists(normalized)) throw new Error(`A note already exists at ${normalized}`);
      const parsed = parseMarkdown(init.markdown ?? '');
      if (init.meta) Object.assign(parsed.meta, init.meta);
      const note: Note = { path: normalized, ...parsed };
      const text = serializeMarkdown(note);
      remember(normalized, text);
      await fs.write(normalized, text);
      emit({ kind: 'saved', path: normalized, origin: 'local' });
      return open(normalized);
    },

    async updateMeta(path, patch) {
      const note = await open(path);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete note.meta[key];
        else note.meta[key] = value;
      }
      await save(note);
      return open(path);
    },

    move: (from, to) => move(from, to),

    async trash(path) {
      const normalized = normalizeVaultPath(path);
      const target = `${TRASH_DIR}/${normalized}`;
      await fs.delete(target);
      await move(normalized, target, false);
      emit({ kind: 'deleted', path: normalized });
    },

    async restore(path) {
      const normalized = normalizeVaultPath(path);
      await move(`${TRASH_DIR}/${normalized}`, normalized, false);
      emit({ kind: 'saved', path: normalized, origin: 'local' });
    },

    async addMedia(name, data) {
      const clean = name.replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, '') || 'file';
      const dot = clean.lastIndexOf('.');
      const stem = dot > 0 ? clean.slice(0, dot) : clean;
      const extension = dot > 0 ? clean.slice(dot) : '';
      let path = `${MEDIA_DIR}/${clean}`;
      for (let n = 2; await fs.exists(path); n++) path = `${MEDIA_DIR}/${stem}-${n}${extension}`;
      await fs.write(path, data);
      return path;
    },

    readMedia: (path) => fs.read(path),

    onChange(listener) {
      listeners.add(listener);
      stopWatching ??= fs.watch('', onFileChange);
      return () => listeners.delete(listener);
    },

    async close() {
      stopWatching?.();
      stopWatching = undefined;
      listeners.clear();
    },
  };
}
