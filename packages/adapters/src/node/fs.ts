import {
  FileNotFoundError,
  normalizeVaultPath,
  type FileChange,
  type FileEntry,
  type FileStat,
  type FileSystem,
  type Unsubscribe,
  type VaultPath,
} from '@mosaic/core';
import { watch as chokidarWatch } from 'chokidar';
import { randomBytes } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';

const TMP_PREFIX = '.mosaic-tmp-';
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

/** A vault folder on a real disk. Used by tests, the dev server, and CLI tools. */
export class NodeFileSystem implements FileSystem {
  readonly capabilities = { watch: true };
  readonly root: string;

  constructor(root: string) {
    this.root = nodePath.resolve(root);
  }

  private abs(path: VaultPath): string {
    return nodePath.join(this.root, ...normalizeVaultPath(path).split('/'));
  }

  async read(path: VaultPath): Promise<Uint8Array> {
    const abs = this.abs(path);
    try {
      return new Uint8Array(await fsp.readFile(abs));
    } catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(path);
      throw error;
    }
  }

  async readText(path: VaultPath): Promise<string> {
    return new TextDecoder().decode(await this.read(path));
  }

  /** Crash-safe: write a sibling temp file, fsync, then rename over the target. */
  async write(path: VaultPath, data: Uint8Array | string): Promise<void> {
    const abs = this.abs(path);
    const dir = nodePath.dirname(abs);
    await fsp.mkdir(dir, { recursive: true });
    const tmp = nodePath.join(dir, `${TMP_PREFIX}${randomBytes(6).toString('hex')}`);
    const handle = await fsp.open(tmp, 'w');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fsp.rename(tmp, abs);
    } catch (error) {
      await fsp.rm(tmp, { force: true });
      throw error;
    }
  }

  async list(dir: VaultPath, options?: { recursive?: boolean }): Promise<FileEntry[]> {
    const base = normalizeVaultPath(dir);
    let dirents;
    try {
      dirents = await fsp.readdir(this.abs(base), {
        withFileTypes: true,
        recursive: options?.recursive ?? false,
      });
    } catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(dir);
      throw error;
    }
    const entries: FileEntry[] = [];
    for (const dirent of dirents) {
      if (dirent.name.startsWith(TMP_PREFIX)) continue;
      const rel = nodePath.relative(this.root, nodePath.join(dirent.parentPath, dirent.name));
      entries.push({
        path: rel.split(nodePath.sep).join('/'),
        kind: dirent.isDirectory() ? 'directory' : 'file',
      });
    }
    return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  async stat(path: VaultPath): Promise<FileStat | undefined> {
    try {
      const stat = await fsp.stat(this.abs(path));
      return {
        kind: stat.isDirectory() ? 'directory' : 'file',
        size: stat.isDirectory() ? 0 : stat.size,
        modifiedAt: stat.mtimeMs,
      };
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  async exists(path: VaultPath): Promise<boolean> {
    return (await this.stat(path)) !== undefined;
  }

  async mkdir(path: VaultPath): Promise<void> {
    await fsp.mkdir(this.abs(path), { recursive: true });
  }

  async move(from: VaultPath, to: VaultPath): Promise<void> {
    const src = this.abs(from);
    const dst = this.abs(to);
    if (await this.exists(to)) throw new Error(`Destination exists: ${to}`);
    await fsp.mkdir(nodePath.dirname(dst), { recursive: true });
    try {
      await fsp.rename(src, dst);
    } catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(from);
      throw error;
    }
  }

  async delete(path: VaultPath): Promise<void> {
    const normalized = normalizeVaultPath(path);
    if (normalized === '') throw new Error('Refusing to delete the vault root');
    await fsp.rm(this.abs(normalized), { recursive: true, force: true });
  }

  /**
   * chokidar rather than `fs.watch(…, { recursive: true })`: on Linux the built-in
   * recursive watcher loses a file after an atomic rename-replace and then never
   * reports its deletion, which is exactly how this adapter (and most editors) write.
   */
  watch(dir: VaultPath, listener: (change: FileChange) => void): Unsubscribe {
    const toVaultPath = (abs: string) =>
      nodePath.relative(this.root, abs).split(nodePath.sep).join('/');
    const watcher = chokidarWatch(this.abs(dir), {
      ignoreInitial: true,
      ignored: (abs) => nodePath.basename(abs).startsWith(TMP_PREFIX),
    });
    watcher
      .on('add', (abs) => listener({ kind: 'created', path: toVaultPath(abs) }))
      .on('change', (abs) => listener({ kind: 'modified', path: toVaultPath(abs) }))
      .on('unlink', (abs) => listener({ kind: 'deleted', path: toVaultPath(abs) }))
      .on('error', () => undefined);
    return () => void watcher.close();
  }
}
