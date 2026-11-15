import { extractWikiLinks, inlineToPlainText } from '../filebridge/inline';
import { parseMarkdown } from '../filebridge/markdown';
import type { VaultPath } from '../platform/filesystem';
import type { Platform } from '../platform/index';
import { isNotePath } from '../store/index';
import type { Block, NoteMeta } from '../store/types';

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
  /** The block the link points at, when it names one (`[[Note#^id]]`). */
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
  /** Bring the index up to date with the folder: only files that changed are re-read. */
  sync(): Promise<{ changed: number; removed: number }>;
  /** Re-index one file after it changed (or remove it if it is gone). */
  refresh(path: VaultPath): Promise<void>;
  get(path: VaultPath): Promise<IndexedNote | undefined>;
  query(query?: NoteQuery): Promise<IndexedNote[]>;
  /** The note a `[[wiki link]]` target refers to, if any. */
  resolve(target: string): Promise<VaultPath | undefined>;
  backlinks(path: VaultPath): Promise<LinkRef[]>;
  outboundLinks(path: VaultPath): Promise<LinkRef[]>;
  labels(): Promise<{ label: string; count: number }[]>;
  /** A stable digest of the whole index, for the wipe-and-rebuild test. */
  fingerprint(): Promise<string>;
}

/** Bump when the tables change; a mismatch triggers a rebuild, never a migration. */
export const INDEX_SCHEMA_VERSION = 2;

const SCHEMA = `
create table if not exists meta (key text primary key, value text);
create table if not exists notes (
  id integer primary key,
  path text not null unique,
  name text not null,
  folder text not null,
  title text not null,
  meta text not null,
  preview text not null,
  pinned integer not null,
  archived integer not null,
  modified_at real not null,
  size integer not null
);
create index if not exists notes_name on notes (name);
create table if not exists links (source text not null, target text not null, target_name text not null, block_id text);
create index if not exists links_source on links (source);
create index if not exists links_target_name on links (target_name);
create table if not exists labels (path text not null, label text not null);
create index if not exists labels_path on labels (path);
create index if not exists labels_label on labels (label);
create virtual table if not exists notes_fts using fts5(title, body, tokenize = 'unicode61 remove_diacritics 2');
`;

/** `Work/Roadmap.md` → `roadmap`: what a bare `[[Roadmap]]` matches. */
function nameKey(pathOrTarget: string): string {
  const base = pathOrTarget.slice(pathOrTarget.lastIndexOf('/') + 1);
  return base.replace(/\.(md|markdown)$/i, '').toLowerCase();
}

/** `Work/Roadmap` or `Work/Roadmap.md` → `work/roadmap`. */
function pathKey(pathOrTarget: string): string {
  return pathOrTarget.replace(/\.(md|markdown)$/i, '').toLowerCase();
}

function plainText(blocks: readonly Block[], out: string[] = []): string[] {
  for (const block of blocks) {
    if (block.type === 'code' || block.type === 'mermaid') out.push(block.text);
    else if (block.type !== 'divider' && block.text) out.push(inlineToPlainText(block.text));
    if (block.type === 'callout' && block.props.title) out.push(String(block.props.title));
    plainText(block.children, out);
  }
  return out;
}

interface NoteRow {
  [key: string]: string | number | null;
  path: string;
  title: string;
  meta: string;
  preview: string;
  modified_at: number;
}

const toNote = (row: NoteRow): IndexedNote => ({
  path: row.path,
  title: row.title,
  meta: JSON.parse(row.meta) as NoteMeta,
  preview: row.preview,
  modifiedAt: row.modified_at,
});

export function createVaultIndex(platform: Platform): VaultIndex {
  const { fs, db, clock, crypto } = platform;
  let ready: Promise<void> | undefined;
  /** One writer at a time: a watcher refresh must not interleave with a rebuild. */
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => undefined);
    return next;
  };

  const init = () =>
    (ready ??= (async () => {
      await db.exec('create table if not exists meta (key text primary key, value text)');
      const [row] = await db.query<{ value: string }>(
        "select value from meta where key = 'schema'",
      );
      if (row?.value !== String(INDEX_SCHEMA_VERSION)) {
        // A different layout: the index is derived, so drop it rather than migrate it.
        for (const table of ['notes_fts', 'notes', 'links', 'labels'])
          await db.exec(`drop table if exists ${table}`);
      }
      await db.exec(SCHEMA);
      await db.run("insert or replace into meta values ('schema', ?)", [
        String(INDEX_SCHEMA_VERSION),
      ]);
    })());

  async function clear(): Promise<void> {
    for (const table of ['notes', 'links', 'labels', 'notes_fts'])
      await db.exec(`delete from ${table}`);
  }

  async function remove(path: VaultPath): Promise<void> {
    const [row] = await db.query<{ id: number }>('select id from notes where path = ?', [path]);
    if (!row) return;
    // FTS rows share the note's rowid, so this is a key lookup, not a table scan.
    await db.run('delete from notes_fts where rowid = ?', [row.id]);
    await db.run('delete from notes where id = ?', [row.id]);
    await db.run('delete from links where source = ?', [path]);
    await db.run('delete from labels where path = ?', [path]);
  }

  async function indexFile(
    path: VaultPath,
    stat: { size: number; modifiedAt: number },
    fresh = false,
  ): Promise<void> {
    const source = await fs.readText(path);
    const { meta, blocks } = parseMarkdown(source);
    const heading = blocks.find((block) => block.type === 'heading' && block.props.level === 1);
    const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '');
    const title =
      typeof meta.title === 'string' && meta.title.trim()
        ? meta.title.trim()
        : heading
          ? inlineToPlainText(heading.text)
          : base;
    const lines = plainText(blocks);
    const preview = lines
      .filter((line) => line !== title)
      .join('\n')
      .slice(0, 280);
    const slash = path.lastIndexOf('/');
    const labels = Array.isArray(meta.labels)
      ? meta.labels
      : Array.isArray(meta.tags)
        ? (meta.tags as unknown[])
        : [];

    if (!fresh) await remove(path);
    const inserted = await db.run('insert into notes values (null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      path,
      nameKey(path),
      slash === -1 ? '' : path.slice(0, slash),
      title,
      JSON.stringify(meta),
      preview,
      meta.pinned === true ? 1 : 0,
      meta.archived === true ? 1 : 0,
      stat.modifiedAt,
      stat.size,
    ]);
    await db.run('insert into notes_fts (rowid, title, body) values (?, ?, ?)', [
      inserted.lastInsertRowid,
      title,
      lines.join('\n'),
    ]);
    const seen = new Set<string>();
    for (const link of extractWikiLinks(source)) {
      const key = `${link.target}#${link.blockId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await db.run('insert into links values (?, ?, ?, ?)', [
        path,
        pathKey(link.target),
        nameKey(link.target),
        link.blockId ?? null,
      ]);
    }
    for (const label of new Set(
      labels.filter((l): l is string => typeof l === 'string' && l !== ''),
    )) {
      await db.run('insert into labels values (?, ?)', [path, label]);
    }
  }

  async function noteFiles(): Promise<VaultPath[]> {
    const entries = await fs.list('', { recursive: true });
    return entries
      .filter((entry) => entry.kind === 'file' && isNotePath(entry.path))
      .map((entry) => entry.path);
  }

  /** A link names a note by full path, or by bare file name when that is unambiguous enough. */
  async function resolve(target: string): Promise<VaultPath | undefined> {
    const clean = target.split('#')[0]!.trim();
    if (!clean) return undefined;
    const rows = await db.query<{ path: string }>(
      'select path from notes where name = ? order by length(path), path',
      [nameKey(clean)],
    );
    const exact = rows.find((row) => pathKey(row.path) === pathKey(clean));
    return (exact ?? rows[0])?.path;
  }

  return {
    rebuild: () =>
      exclusive(async () => {
        await init();
        const started = clock.now();
        const files = await noteFiles();
        await db.transaction(async () => {
          await clear();
          for (const path of files) {
            const stat = await fs.stat(path);
            if (stat) await indexFile(path, stat, true);
          }
        });
        return { notes: files.length, ms: clock.now() - started };
      }),

    sync: () =>
      exclusive(async () => {
        await init();
        const known = new Map(
          (
            await db.query<{ path: string; modified_at: number; size: number }>(
              'select path, modified_at, size from notes',
            )
          ).map((row) => [row.path, row]),
        );
        const files = await noteFiles();
        let changed = 0;
        await db.transaction(async () => {
          for (const path of files) {
            const stat = await fs.stat(path);
            const row = known.get(path);
            known.delete(path);
            if (!stat || (row && row.modified_at === stat.modifiedAt && row.size === stat.size))
              continue;
            await indexFile(path, stat);
            changed++;
          }
          for (const path of known.keys()) await remove(path);
        });
        return { changed, removed: known.size };
      }),

    refresh: (path) =>
      exclusive(async () => {
        await init();
        const stat = isNotePath(path) ? await fs.stat(path) : undefined;
        await db.transaction(async () => {
          if (stat?.kind === 'file') await indexFile(path, stat);
          else await remove(path);
        });
      }),

    async get(path) {
      await init();
      const [row] = await db.query<NoteRow>('select * from notes where path = ?', [path]);
      return row ? toNote(row) : undefined;
    },

    async query(query = {}) {
      await init();
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (query.folder !== undefined && query.folder !== '') {
        where.push("(folder = ? or folder like ? escape '\\')");
        params.push(query.folder, `${query.folder.replace(/[\\%_]/g, '\\$&')}/%`);
      }
      if (query.pinned !== undefined) {
        where.push('pinned = ?');
        params.push(query.pinned ? 1 : 0);
      }
      if (query.archived !== undefined) {
        where.push('archived = ?');
        params.push(query.archived ? 1 : 0);
      }
      if (query.label !== undefined) {
        where.push('path in (select path from labels where label = ?)');
        params.push(query.label);
      }
      const order = {
        modified: 'modified_at desc, path',
        title: 'title collate nocase, path',
        path: 'path',
      }[query.orderBy ?? 'modified'];
      const sql = `select * from notes ${where.length ? `where ${where.join(' and ')}` : ''} order by ${order} ${
        query.limit ? `limit ${Math.max(1, Math.floor(query.limit))}` : ''
      }`;
      return (await db.query<NoteRow>(sql, params)).map(toNote);
    },

    async resolve(target) {
      await init();
      return resolve(target);
    },

    async backlinks(path) {
      await init();
      const rows = await db.query<{ source: string; target: string; block_id: string | null }>(
        'select source, target, block_id from links where target_name = ? and source != ? order by source',
        [nameKey(path), path],
      );
      const out: LinkRef[] = [];
      for (const row of rows) {
        if ((await resolve(row.target)) !== path) continue;
        out.push({
          from: row.source,
          to: path,
          ...(row.block_id ? { blockId: row.block_id } : {}),
        });
      }
      return out;
    },

    async outboundLinks(path) {
      await init();
      const rows = await db.query<{ target: string; block_id: string | null }>(
        'select target, block_id from links where source = ? order by rowid',
        [path],
      );
      const out: LinkRef[] = [];
      for (const row of rows) {
        const to = await resolve(row.target);
        if (to) out.push({ from: path, to, ...(row.block_id ? { blockId: row.block_id } : {}) });
      }
      return out;
    },

    async labels() {
      await init();
      return db.query<{ label: string; count: number }>(
        'select label, count(*) as count from labels group by label order by count desc, label',
      );
    },

    async fingerprint() {
      await init();
      const dump = JSON.stringify([
        await db.query(
          'select path, name, folder, title, meta, preview, pinned, archived, modified_at, size from notes order by path',
        ),
        await db.query('select * from links order by source, target, block_id'),
        await db.query('select * from labels order by path, label'),
        await db.query(
          'select n.path, f.title, f.body from notes_fts f join notes n on n.id = f.rowid order by n.path',
        ),
      ]);
      const digest = await crypto.hash(new TextEncoder().encode(dump));
      return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    },
  };
}
