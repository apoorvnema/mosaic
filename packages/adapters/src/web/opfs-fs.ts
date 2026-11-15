import {
  FileNotFoundError,
  normalizeVaultPath,
  parentPath,
  type FileChange,
  type FileEntry,
  type FileStat,
  type FileSystem,
  type Unsubscribe,
  type VaultPath,
} from '@mosaic/core';

const isMissing = (error: unknown) => (error as DOMException)?.name === 'NotFoundError';
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

// FileSystemObserver is Chromium-only for now and not yet in TypeScript's DOM lib.
interface ObserverRecord {
  type: 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unknown' | 'errored';
  relativePathComponents: string[];
  changedHandle: FileSystemHandle | null;
}
type ObserverCtor = new (callback: (records: ObserverRecord[]) => void) => {
  observe(handle: FileSystemHandle, options?: { recursive?: boolean }): Promise<void>;
  disconnect(): void;
};

/**
 * A vault in the Origin Private File System, or in any directory handle the user
 * picked. Writes go through createWritable(), which stages to a swap file and
 * commits on close, so a reader never sees a half-written note.
 */
export class OpfsFileSystem implements FileSystem {
  readonly capabilities: { watch: boolean };

  constructor(private root: FileSystemDirectoryHandle) {
    this.capabilities = { watch: 'FileSystemObserver' in globalThis };
  }

  /** Open (creating if needed) a named vault inside this origin's private file system. */
  static async open(vaultName = 'vault'): Promise<OpfsFileSystem> {
    const opfs = await navigator.storage.getDirectory();
    const vaults = await opfs.getDirectoryHandle('vaults', { create: true });
    return new OpfsFileSystem(await vaults.getDirectoryHandle(vaultName, { create: true }));
  }

  private async dir(path: VaultPath, create = false): Promise<FileSystemDirectoryHandle> {
    let handle = this.root;
    for (const segment of normalizeVaultPath(path).split('/').filter(Boolean)) {
      handle = await handle.getDirectoryHandle(segment, { create });
    }
    return handle;
  }

  private async file(path: VaultPath): Promise<FileSystemFileHandle> {
    const p = normalizeVaultPath(path);
    try {
      return await (await this.dir(parentPath(p))).getFileHandle(baseName(p));
    } catch (error) {
      if (isMissing(error) || (error as DOMException)?.name === 'TypeMismatchError') {
        throw new FileNotFoundError(path);
      }
      throw error;
    }
  }

  async read(path: VaultPath): Promise<Uint8Array> {
    const file = await (await this.file(path)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async readText(path: VaultPath): Promise<string> {
    return new TextDecoder().decode(await this.read(path));
  }

  async write(path: VaultPath, data: Uint8Array | string): Promise<void> {
    const p = normalizeVaultPath(path);
    if (p === '') throw new Error('Not a file: vault root');
    const dir = await this.dir(parentPath(p), true);
    const handle = await dir.getFileHandle(baseName(p), { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(
        typeof data === 'string' ? data : (data.slice() as Uint8Array<ArrayBuffer>),
      );
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
  }

  async list(dir: VaultPath, options?: { recursive?: boolean }): Promise<FileEntry[]> {
    const base = normalizeVaultPath(dir);
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await this.dir(base);
    } catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(dir);
      throw error;
    }
    const entries: FileEntry[] = [];
    const walk = async (h: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const [name, child] of h.entries()) {
        if (name.endsWith('.crswap')) continue;
        const path = prefix ? `${prefix}/${name}` : name;
        entries.push({ path, kind: child.kind });
        if (child.kind === 'directory' && options?.recursive) {
          await walk(child as FileSystemDirectoryHandle, path);
        }
      }
    };
    await walk(handle, base);
    return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  async stat(path: VaultPath): Promise<FileStat | undefined> {
    const p = normalizeVaultPath(path);
    if (p === '') return { kind: 'directory', size: 0, modifiedAt: 0 };
    let parent: FileSystemDirectoryHandle;
    try {
      parent = await this.dir(parentPath(p));
    } catch (error) {
      if (isMissing(error) || (error as DOMException)?.name === 'TypeMismatchError')
        return undefined;
      throw error;
    }
    try {
      const file = await (await parent.getFileHandle(baseName(p))).getFile();
      return { kind: 'file', size: file.size, modifiedAt: file.lastModified };
    } catch {
      try {
        await parent.getDirectoryHandle(baseName(p));
        return { kind: 'directory', size: 0, modifiedAt: 0 };
      } catch {
        return undefined;
      }
    }
  }

  async exists(path: VaultPath): Promise<boolean> {
    return (await this.stat(path)) !== undefined;
  }

  async mkdir(path: VaultPath): Promise<void> {
    await this.dir(path, true);
  }

  /** OPFS has no portable rename for directories, so a move is copy-then-delete. */
  async move(from: VaultPath, to: VaultPath): Promise<void> {
    const src = normalizeVaultPath(from);
    const dst = normalizeVaultPath(to);
    if (await this.exists(dst)) throw new Error(`Destination exists: ${to}`);
    const stat = await this.stat(src);
    if (!stat) throw new FileNotFoundError(from);
    if (stat.kind === 'file') {
      await this.write(dst, await this.read(src));
    } else {
      await this.mkdir(dst);
      for (const entry of await this.list(src, { recursive: true })) {
        const target = dst + entry.path.slice(src.length);
        if (entry.kind === 'directory') await this.mkdir(target);
        else await this.write(target, await this.read(entry.path));
      }
    }
    await this.delete(src);
  }

  async delete(path: VaultPath): Promise<void> {
    const p = normalizeVaultPath(path);
    if (p === '') throw new Error('Refusing to delete the vault root');
    try {
      await (await this.dir(parentPath(p))).removeEntry(baseName(p), { recursive: true });
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  watch(dir: VaultPath, listener: (change: FileChange) => void): Unsubscribe {
    const Observer = (globalThis as { FileSystemObserver?: ObserverCtor }).FileSystemObserver;
    if (!Observer) return () => undefined;
    const base = normalizeVaultPath(dir);
    const kinds = { appeared: 'created', modified: 'modified', disappeared: 'deleted' } as const;
    const observer = new Observer((records) => {
      for (const record of records) {
        const kind = kinds[record.type as keyof typeof kinds];
        const name = record.relativePathComponents.at(-1) ?? '';
        if (!kind || name.endsWith('.crswap') || record.changedHandle?.kind === 'directory')
          continue;
        listener({
          kind,
          path: normalizeVaultPath(`${base}/${record.relativePathComponents.join('/')}`),
        });
      }
    });
    void this.dir(base).then((handle) => observer.observe(handle, { recursive: true }));
    return () => observer.disconnect();
  }
}
