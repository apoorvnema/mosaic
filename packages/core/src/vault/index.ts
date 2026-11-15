import { createVaultIndex, type VaultIndex } from '../indexer/index';
import type { Unsubscribe, VaultPath } from '../platform/filesystem';
import type { Platform } from '../platform/index';
import { createSearchEngine, type SearchEngine } from '../search/index';
import { createNoteStore, type NoteStore } from '../store/index';
import type { StoreChange } from '../store/types';

/**
 * An open vault: the store, its index and search, wired together so the index
 * follows every change — ours or another program's. This is what a shell opens.
 */
export interface Vault {
  readonly platform: Platform;
  readonly store: NoteStore;
  readonly index: VaultIndex;
  readonly search: SearchEngine;
  /** Fires after the index has caught up with a change, so views can re-query. */
  onIndexed(listener: (change: StoreChange) => void): Unsubscribe;
  /** A path for a new note in `folder` that does not collide with an existing file. */
  freePath(folder: VaultPath, title: string): Promise<VaultPath>;
  close(): Promise<void>;
}

export async function openVault(platform: Platform): Promise<Vault> {
  const store = createNoteStore(platform);
  const index = createVaultIndex(platform);
  const search = createSearchEngine(platform);
  const listeners = new Set<(change: StoreChange) => void>();

  await index.sync();

  const stop = store.onChange((change) => {
    const work =
      change.kind === 'moved'
        ? Promise.all([index.refresh(change.from), index.refresh(change.to)])
        : index.refresh(change.path);
    void work.then(
      () => listeners.forEach((listener) => listener(change)),
      (error: unknown) =>
        platform.logger.log('error', 'index refresh failed', { error: String(error) }),
    );
  });

  return {
    platform,
    store,
    index,
    search,
    onIndexed(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async freePath(folder, title) {
      const stem = title.replace(/[\\/:*?"<>|#^[\]]+/g, ' ').trim() || 'Untitled';
      const prefix = folder ? `${folder}/` : '';
      let path = `${prefix}${stem}.md`;
      for (let n = 2; await platform.fs.exists(path); n++) path = `${prefix}${stem} ${n}.md`;
      return path;
    },
    async close() {
      stop();
      listeners.clear();
      await store.close();
    },
  };
}
