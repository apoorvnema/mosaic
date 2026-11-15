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
import * as tfs from '@tauri-apps/plugin-fs';

const TMP_PREFIX = '.mosaic-tmp-';

/**
 * A vault folder through Tauri's fs plugin — desktop and mobile. `root` is an
 * absolute path that the app's fs scope must allow (see src-tauri/capabilities).
 * NOT exercised in the cloud dev environment: verify on a real build.
 */
export class TauriFileSystem implements FileSystem {
  readonly capabilities = { watch: true };
  private root: string;

  constructor(root: string) {
    this.root = root.replace(/[\\/]+$/, '');
  }

  private abs(path: VaultPath): string {
    const p = normalizeVaultPath(path);
    return p ? `${this.root}/${p}` : this.root;
  }

  async read(path: VaultPath): Promise<Uint8Array> {
    if (!(await tfs.exists(this.abs(path)))) throw new FileNotFoundError(path);
    return tfs.readFile(this.abs(path));
  }

  async readText(path: VaultPath): Promise<string> {
    return new TextDecoder().decode(await this.read(path));
  }

  async write(path: VaultPath, data: Uint8Array | string): Promise<void> {
    const p = normalizeVaultPath(path);
    await this.mkdir(parentPath(p));
    const tmp = this.abs(`${parentPath(p)}/${TMP_PREFIX}${crypto.randomUUID().slice(0, 12)}`);
    await tfs.writeFile(tmp, typeof data === 'string' ? new TextEncoder().encode(data) : data);
    try {
      await tfs.rename(tmp, this.abs(p));
    } catch (error) {
      await tfs.remove(tmp).catch(() => undefined);
      throw error;
    }
  }

  async list(dir: VaultPath, options?: { recursive?: boolean }): Promise<FileEntry[]> {
    const base = normalizeVaultPath(dir);
    if (!(await tfs.exists(this.abs(base)))) throw new FileNotFoundError(dir);
    const entries: FileEntry[] = [];
    const walk = async (rel: string): Promise<void> => {
      for (const entry of await tfs.readDir(this.abs(rel))) {
        if (entry.name.startsWith(TMP_PREFIX)) continue;
        const path = rel ? `${rel}/${entry.name}` : entry.name;
        entries.push({ path, kind: entry.isDirectory ? 'directory' : 'file' });
        if (entry.isDirectory && options?.recursive) await walk(path);
      }
    };
    await walk(base);
    return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  async stat(path: VaultPath): Promise<FileStat | undefined> {
    const abs = this.abs(path);
    if (!(await tfs.exists(abs))) return undefined;
    const info = await tfs.stat(abs);
    return {
      kind: info.isDirectory ? 'directory' : 'file',
      size: info.isDirectory ? 0 : info.size,
      modifiedAt: info.mtime?.getTime() ?? 0,
    };
  }

  exists(path: VaultPath): Promise<boolean> {
    return tfs.exists(this.abs(path));
  }

  async mkdir(path: VaultPath): Promise<void> {
    await tfs.mkdir(this.abs(path), { recursive: true });
  }

  async move(from: VaultPath, to: VaultPath): Promise<void> {
    if (!(await this.exists(from))) throw new FileNotFoundError(from);
    if (await this.exists(to)) throw new Error(`Destination exists: ${to}`);
    await this.mkdir(parentPath(normalizeVaultPath(to)));
    await tfs.rename(this.abs(from), this.abs(to));
  }

  async delete(path: VaultPath): Promise<void> {
    const p = normalizeVaultPath(path);
    if (p === '') throw new Error('Refusing to delete the vault root');
    if (await tfs.exists(this.abs(p))) await tfs.remove(this.abs(p), { recursive: true });
  }

  watch(dir: VaultPath, listener: (change: FileChange) => void): Unsubscribe {
    let stop: (() => void) | undefined;
    let stopped = false;
    const toVaultPath = (abs: string) =>
      normalizeVaultPath(abs.replace(/\\/g, '/').slice(this.root.replace(/\\/g, '/').length));
    void tfs
      .watch(
        this.abs(dir),
        (event) => {
          const type = event.type;
          const kind =
            typeof type === 'object' && 'create' in type
              ? 'created'
              : typeof type === 'object' && 'modify' in type
                ? 'modified'
                : typeof type === 'object' && 'remove' in type
                  ? 'deleted'
                  : undefined;
          if (!kind) return;
          for (const abs of event.paths) {
            const path = toVaultPath(abs);
            if (!path.split('/').pop()?.startsWith(TMP_PREFIX)) listener({ kind, path });
          }
        },
        { recursive: true, delayMs: 100 },
      )
      .then((unwatch) => (stopped ? unwatch() : (stop = unwatch)));
    return () => {
      stopped = true;
      stop?.();
    };
  }
}
