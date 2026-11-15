import type { IndexedNote, LinkRef, SearchHit, Vault } from '@mosaic/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FoundationStatus } from '../components/FoundationStatus';
import {
  BackIcon,
  FileIcon,
  Logo,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
  TrashIcon,
} from '../components/icons';
import { Editor } from '../editor/Editor';
import { nextTheme } from '../theme';
import { useNoteList, useOpenNote, useRoute } from './useVault';

const DIAGNOSTICS = '~diagnostics';
const baseName = (path: string) =>
  path.slice(path.lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '');
const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

function useTheme(): ['light' | 'dark', () => void] {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return [theme, () => setTheme(nextTheme)];
}

function useSearch(vault: Vault, query: string): SearchHit[] | undefined {
  const [result, setResult] = useState<{ query: string; hits: SearchHit[] }>();
  const wanted = query.trim();
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    const run = () => {
      const started = performance.now();
      void vault.search.search(wanted, { limit: 40 }).then((hits) => {
        vault.platform.telemetry.timing('search.query', performance.now() - started);
        if (live) setResult({ query: wanted, hits });
      });
    };
    run();
    // Results follow the vault: an edit anywhere re-runs the open search.
    const stop = vault.onIndexed(run);
    return () => {
      live = false;
      stop();
    };
  }, [vault, wanted]);
  // While a new query is in flight, keep showing the previous results rather than flashing.
  return wanted ? result?.hits : undefined;
}

function Sidebar(props: {
  vault: Vault;
  notes: IndexedNote[];
  current: string | undefined;
  onOpen(path: string): void;
  onNew(): void;
  onDiagnostics(): void;
}) {
  const { vault, notes, current } = props;
  const [query, setQuery] = useState('');
  const hits = useSearch(vault, query);
  const input = useRef<HTMLInputElement>(null);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const groups = useMemo(() => {
    const byFolder = new Map<string, IndexedNote[]>();
    for (const note of notes) {
      const folder = folderOf(note.path);
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), note]);
    }
    return [...byFolder.entries()];
  }, [notes]);

  return (
    <aside className="m-sidebar" aria-label="Notes">
      <div className="m-sidebar-head">
        <div className="m-brand">
          <Logo />
          <b>Mosaic</b>
        </div>
        <button type="button" className="m-icon-button" aria-label="New note" onClick={props.onNew}>
          <PlusIcon />
        </button>
      </div>

      <label className="m-search">
        <SearchIcon />
        <input
          ref={input}
          type="search"
          placeholder="Search notes"
          aria-label="Search notes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('');
            if (event.key === 'Enter' && hits?.[0]) props.onOpen(hits[0].path);
          }}
        />
        <kbd className="m-kbd">Ctrl K</kbd>
      </label>

      <nav className="m-note-list" aria-label={hits ? 'Search results' : 'All notes'}>
        {hits ? (
          hits.length === 0 ? (
            <p className="m-list-empty">No notes match “{query}”.</p>
          ) : (
            hits.map((hit) => (
              <button
                key={hit.path}
                type="button"
                className="m-note-row m-hit"
                aria-current={hit.path === current ? 'page' : undefined}
                onClick={() => props.onOpen(hit.path)}
              >
                <span className="m-note-title">{hit.title}</span>
                {/* The snippet is escaped by core; only <mark> is markup. */}
                <span className="m-hit-snippet" dangerouslySetInnerHTML={{ __html: hit.snippet }} />
                <span className="m-hit-path">{hit.path}</span>
              </button>
            ))
          )
        ) : notes.length === 0 ? (
          <p className="m-list-empty">
            No notes yet. Create one, or drop markdown files into the folder.
          </p>
        ) : (
          groups.map(([folder, list]) => (
            <section key={folder} className="m-folder">
              <h2 className="m-folder-name">{folder || 'Vault'}</h2>
              {list.map((note) => (
                <button
                  key={note.path}
                  type="button"
                  className="m-note-row"
                  data-path={note.path}
                  aria-current={note.path === current ? 'page' : undefined}
                  onClick={() => props.onOpen(note.path)}
                >
                  <FileIcon />
                  <span className="m-note-title">{baseName(note.path)}</span>
                </button>
              ))}
            </section>
          ))
        )}
      </nav>

      <div className="m-sidebar-foot">
        <button type="button" className="m-text-button" onClick={props.onDiagnostics}>
          {notes.length} {notes.length === 1 ? 'note' : 'notes'} · {vault.platform.name}
        </button>
        <button
          type="button"
          className="m-icon-button"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </aside>
  );
}

function Backlinks({
  vault,
  path,
  notes,
  onOpen,
}: {
  vault: Vault;
  path: string;
  notes: IndexedNote[];
  onOpen(path: string): void;
}) {
  const [links, setLinks] = useState<LinkRef[]>([]);
  useEffect(() => {
    let live = true;
    void vault.index.backlinks(path).then((found) => live && setLinks(found));
    return () => {
      live = false;
    };
  }, [vault, path, notes]);
  if (links.length === 0) return null;
  const titles = new Map(notes.map((note) => [note.path, note.title]));
  return (
    <section className="m-backlinks" aria-labelledby="backlinks-title">
      <h2 id="backlinks-title" className="m-section-title">
        Linked from
      </h2>
      {links.map((link) => (
        <button
          key={link.from}
          type="button"
          className="m-note-row"
          onClick={() => onOpen(link.from)}
        >
          <FileIcon />
          <span className="m-note-title">{titles.get(link.from) ?? baseName(link.from)}</span>
          <span className="m-hit-path">{folderOf(link.from)}</span>
        </button>
      ))}
    </section>
  );
}

function NotePane(props: {
  vault: Vault;
  path: string;
  notes: IndexedNote[];
  onOpen(path: string): void;
  onBack(): void;
  onTrashed(path: string): void;
}) {
  const { vault, path } = props;
  const open = useOpenNote(vault, path);
  const [title, setTitle] = useState(baseName(path));
  const [renameError, setRenameError] = useState<string>();
  const urls = useRef<string[]>([]);

  // This component is keyed by path, so state starts fresh for every note.
  useEffect(() => {
    const made = urls.current;
    return () => made.splice(0).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function rename(): Promise<void> {
    const next = title.trim().replace(/[\\/:*?"<>|]+/g, ' ');
    if (!next || next === baseName(path)) return setTitle(baseName(path));
    const folder = folderOf(path);
    const target = `${folder ? `${folder}/` : ''}${next}.md`;
    if (await vault.platform.fs.exists(target))
      return setRenameError(`“${next}” already exists in this folder.`);
    await open.flush();
    await vault.store.move(path, target);
    props.onOpen(target);
  }

  const resolveMedia = useCallback(
    async (src: string) => {
      const candidates = [src, `${folderOf(path)}/${src}`, `_media/${src}`].map((p) =>
        p.replace(/^\/+/, ''),
      );
      for (const candidate of candidates) {
        try {
          const bytes = await vault.store.readMedia(decodeURIComponent(candidate));
          const url = URL.createObjectURL(new Blob([bytes.slice() as Uint8Array<ArrayBuffer>]));
          urls.current.push(url);
          return url;
        } catch {
          // try the next place an image path can be relative to
        }
      }
      return undefined;
    },
    [vault, path],
  );

  if (open.missing) {
    return (
      <div className="m-centered">
        <div>
          <p>This note no longer exists.</p>
          <button type="button" className="m-button" onClick={props.onBack}>
            Back to notes
          </button>
        </div>
      </div>
    );
  }

  return (
    <article className="m-note" aria-label={baseName(path)}>
      <header className="m-note-bar">
        <button
          type="button"
          className="m-icon-button m-back"
          aria-label="Back to notes"
          onClick={props.onBack}
        >
          <BackIcon />
        </button>
        <span className="m-note-folder">{folderOf(path) || 'Vault'}</span>
        <span className="m-save-state" data-state={open.saveState} role="status">
          {open.saveState === 'saved'
            ? 'Saved'
            : open.saveState === 'saving'
              ? 'Saving…'
              : 'Could not save'}
        </span>
        <button
          type="button"
          className="m-icon-button"
          aria-label="Move note to trash"
          onClick={() =>
            void open
              .flush()
              .then(() => vault.store.trash(path))
              .then(() => props.onTrashed(path))
          }
        >
          <TrashIcon />
        </button>
      </header>
      <div className="m-note-body">
        <input
          className="m-note-name"
          aria-label="Note name"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setRenameError(undefined);
          }}
          onBlur={() => void rename()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setTitle(baseName(path));
          }}
        />
        {renameError && (
          <p className="m-field-error" role="alert">
            {renameError}
          </p>
        )}
        {open.note && (
          <Editor
            docKey={`${path}#${open.version}`}
            blocks={open.note.blocks}
            onChange={open.edit}
            suggestNotes={(query) => vault.search.suggest(query, 8)}
            onOpenLink={(target) =>
              void vault.index.resolve(target).then(async (found) => {
                if (found) return props.onOpen(found);
                // A link to a note that does not exist yet creates it, beside this one.
                const created = await vault.store.create(
                  await vault.freePath(folderOf(path), target),
                );
                props.onOpen(created.path);
              })
            }
            resolveMedia={resolveMedia}
            addMedia={async (file) =>
              vault.store.addMedia(file.name, new Uint8Array(await file.arrayBuffer()))
            }
          />
        )}
        <Backlinks vault={vault} path={path} notes={props.notes} onOpen={props.onOpen} />
      </div>
    </article>
  );
}

/** The app once a vault is open: the note list on the left, one note on the right. */
export function Workspace({ vault }: { vault: Vault }) {
  const [route, go] = useRoute();
  const notes = useNoteList(vault);
  const [undo, setUndo] = useState<string>();
  const path = route && route !== DIAGNOSTICS ? route : undefined;

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(undefined), 8000);
    return () => clearTimeout(timer);
  }, [undo]);

  async function newNote(): Promise<void> {
    const folder = path ? folderOf(path) : 'Inbox';
    const created = await vault.store.create(await vault.freePath(folder, 'Untitled'));
    go(created.path);
  }

  return (
    <div className="m-shell" data-view={route ? 'note' : 'list'}>
      <Sidebar
        vault={vault}
        notes={notes}
        current={path}
        onOpen={go}
        onNew={() => void newNote()}
        onDiagnostics={() => go(DIAGNOSTICS)}
      />
      <main className="m-main">
        {route === DIAGNOSTICS ? (
          <div className="m-content">
            <div className="m-content-inner">
              <button type="button" className="m-text-button m-back" onClick={() => go('')}>
                ← Back to notes
              </button>
              <FoundationStatus platform={vault.platform} />
            </div>
          </div>
        ) : path ? (
          <NotePane
            key={path}
            vault={vault}
            path={path}
            notes={notes}
            onOpen={go}
            onBack={() => go('')}
            onTrashed={(trashed) => {
              setUndo(trashed);
              go('');
            }}
          />
        ) : (
          <div className="m-centered">
            <div>
              <Logo size={40} />
              <p>Pick a note, or start a new one.</p>
              <button type="button" className="m-button" onClick={() => void newNote()}>
                New note
              </button>
            </div>
          </div>
        )}
      </main>
      {undo && (
        <div className="m-toast" role="status">
          <span>Moved “{baseName(undo)}” to trash</span>
          <button
            type="button"
            className="m-text-button"
            onClick={() =>
              void vault.store.restore(undo).then(() => (setUndo(undefined), go(undo)))
            }
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
