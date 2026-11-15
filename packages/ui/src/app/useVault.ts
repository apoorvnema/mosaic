import {
  openVault,
  serializeMarkdown,
  type Block,
  type IndexedNote,
  type Note,
  type Platform,
  type Vault,
} from '@mosaic/core';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Open the vault once per platform. */
export function useVault(platform: Platform): { vault?: Vault; error?: unknown } {
  const [state, setState] = useState<{ vault?: Vault; error?: unknown }>({});
  useEffect(() => {
    let live = true;
    let opened: Vault | undefined;
    openVault(platform).then(
      (vault) => {
        opened = vault;
        if (live) setState({ vault });
        else void vault.close();
      },
      (error: unknown) => live && setState({ error }),
    );
    return () => {
      live = false;
      void opened?.close();
    };
  }, [platform]);
  return state;
}

/** Every note in the vault, kept current as files change — here or in another program. */
export function useNoteList(vault: Vault): IndexedNote[] {
  const [notes, setNotes] = useState<IndexedNote[]>([]);
  useEffect(() => {
    let live = true;
    const load = () =>
      void vault.index.query({ orderBy: 'path' }).then((list) => live && setNotes(list));
    load();
    const stop = vault.onIndexed(load);
    return () => {
      live = false;
      stop();
    };
  }, [vault]);
  return notes;
}

/** The current route, kept in the URL hash so reload and links work. */
export function useRoute(): [string, (route: string) => void] {
  const read = () => decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  const go = useCallback((next: string) => {
    location.hash = next ? `#/${next.split('/').map(encodeURIComponent).join('/')}` : '';
  }, []);
  return [route, go];
}

export type SaveState = 'saved' | 'saving' | 'error';

export interface OpenNote {
  note?: Note;
  /** Changes when the editor must be rebuilt: another note, or an external edit. */
  version: number;
  missing: boolean;
  saveState: SaveState;
  /** The editor's blocks changed. Saved after a short pause. */
  edit(blocks: Block[]): void;
  /** Write any pending edit now. */
  flush(): Promise<void>;
}

const SAVE_DELAY_MS = 350;

/**
 * One note, open for editing. Mount one per note (key the component by path). Edits are saved shortly after typing stops. An edit
 * made by another program reloads the note; if that collides with unsaved typing,
 * the other program's version is copied to `.mosaic/backups/` before ours is saved.
 */
export function useOpenNote(vault: Vault, path: string): OpenNote {
  const [state, setState] = useState<{ note?: Note; version: number; missing: boolean }>({
    version: 0,
    missing: false,
  });
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const current = useRef<{
    note?: Note;
    pending?: Block[];
    timer?: ReturnType<typeof setTimeout>;
    saved?: string;
  }>({});

  const flush = useCallback(async () => {
    const session = current.current;
    clearTimeout(session.timer);
    const { note, pending } = session;
    if (!note || !pending) return;
    delete session.pending;
    const next = { ...note, blocks: pending };
    try {
      session.saved = serializeMarkdown(next);
      await vault.store.save(next);
      setSaveState(session.pending ? 'saving' : 'saved');
    } catch (error) {
      vault.platform.logger.log('error', 'saving a note failed', {
        path: note.path,
        error: String(error),
      });
      setSaveState('error');
    }
  }, [vault]);

  useEffect(() => {
    let live = true;
    const session = (current.current = {} as typeof current.current);
    const load = () =>
      vault.store.open(path).then(
        (note) => {
          if (!live) return;
          session.note = note;
          session.saved = serializeMarkdown(note);
          setState((s) => ({ note, version: s.version + 1, missing: false }));
        },
        () => live && setState((s) => ({ version: s.version + 1, missing: true })),
      );
    void load();

    const stop = vault.store.onChange((change) => {
      if (change.kind === 'deleted' && change.path === path)
        setState((s) => ({ version: s.version + 1, missing: true }));
      if (change.kind !== 'saved' || change.origin !== 'external' || change.path !== path) return;
      void vault.platform.fs.readText(path).then(async (text) => {
        if (!live || text === session.saved) return;
        if (session.pending) {
          // Unsaved typing meets an outside edit: keep theirs safe, then carry on.
          const stamp = new Date(vault.platform.clock.now()).toISOString().replace(/[:.]/g, '-');
          await vault.platform.fs.write(
            `.mosaic/backups/${path.replace(/\.md$/i, '')}.${stamp}.md`,
            text,
          );
          return;
        }
        await load();
      });
    });
    return () => {
      live = false;
      stop();
      void flush();
    };
  }, [vault, path, flush]);

  const edit = useCallback(
    (blocks: Block[]) => {
      const session = current.current;
      session.pending = blocks;
      setSaveState('saving');
      clearTimeout(session.timer);
      session.timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  return { ...state, saveState, edit, flush };
}
