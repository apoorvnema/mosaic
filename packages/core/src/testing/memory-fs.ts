import { FileNotFoundError } from '../errors';
import {
  normalizeVaultPath,
  parentPath,
  type FileChange,
  type FileEntry,
  type FileStat,
  type FileSystem,
  type Unsubscribe,
  type VaultPath,
} from '../platform/filesystem';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * In-memory FileSystem for headless tests. `externalWrite` simulates another
 * program touching the folder (the same thing as `write`, named for intent).
 */
export class MemoryFileSystem implements FileSystem {
  readonly capabilities = { watch: true };
  private files = new Map<VaultPath, { data: Uint8Array; modifiedAt: number }>();
  private dirs = new Set<VaultPath>(['']);
  private watchers = new Set<{ dir: VaultPath; listener: (c: FileChange) => void }>();

  constructor(private now: () => number = () => 0) {}

  async read(path: VaultPath): Promise<Uint8Array> {
    const file = this.files.get(normalizeVaultPath(path));
    if (!file) throw new FileNotFoundError(path);
    return file.data.slice();
  }

  async readText(path: VaultPath): Promise<string> {
    return decoder.decode(await this.read(path));
  }

  async write(path: VaultPath, data: Uint8Array | string): Promise<void> {
    const p = normalizeVaultPath(path);
    if (p === '' || this.dirs.has(p)) throw new Error(`Not a file: ${path}`);
    await this.mkdir(parentPath(p));
    const existed = this.files.has(p);
    const bytes = typeof data === 'string' ? encoder.encode(data) : data.slice();
    this.files.set(p, { data: bytes, modifiedAt: this.now() });
    this.emit({ kind: existed ? 'modified' : 'created', path: p });
  }

  /** Simulate an edit made by another program. */
  externalWrite(path: VaultPath, data: Uint8Array | string): Promise<void> {
    return this.write(path, data);
  }

  async list(dir: VaultPath, options?: { recursive?: boolean }): Promise<FileEntry[]> {
    const d = normalizeVaultPath(dir);
    if (!this.dirs.has(d)) throw new FileNotFoundError(dir);
    const inside = (p: VaultPath) =>
      p !== d && (d === '' || p.startsWith(d + '/')) && (options?.recursive || parentPath(p) === d);
    const entries: FileEntry[] = [];
    for (const p of this.dirs) if (inside(p)) entries.push({ path: p, kind: 'directory' });
    for (const p of this.files.keys()) if (inside(p)) entries.push({ path: p, kind: 'file' });
    return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  async stat(path: VaultPath): Promise<FileStat | undefined> {
    const p = normalizeVaultPath(path);
    const file = this.files.get(p);
    if (file) return { kind: 'file', size: file.data.byteLength, modifiedAt: file.modifiedAt };
    if (this.dirs.has(p)) return { kind: 'directory', size: 0, modifiedAt: 0 };
    return undefined;
  }

  async exists(path: VaultPath): Promise<boolean> {
    return (await this.stat(path)) !== undefined;
  }

  async mkdir(path: VaultPath): Promise<void> {
    let p = normalizeVaultPath(path);
    while (p !== '' && !this.dirs.has(p)) {
      if (this.files.has(p)) throw new Error(`Not a directory: ${p}`);
      this.dirs.add(p);
      p = parentPath(p);
    }
  }

  async move(from: VaultPath, to: VaultPath): Promise<void> {
    const src = normalizeVaultPath(from);
    const dst = normalizeVaultPath(to);
    if (await this.exists(dst)) throw new Error(`Destination exists: ${to}`);
    const file = this.files.get(src);
    if (file) {
      await this.mkdir(parentPath(dst));
      this.files.delete(src);
      this.files.set(dst, file);
      this.emit({ kind: 'deleted', path: src });
      this.emit({ kind: 'created', path: dst });
      return;
    }
    if (!this.dirs.has(src)) throw new FileNotFoundError(from);
    const children = await this.list(src, { recursive: true });
    await this.mkdir(dst);
    for (const child of children) {
      const target = dst + child.path.slice(src.length);
      if (child.kind === 'directory') await this.mkdir(target);
      else await this.move(child.path, target);
    }
    for (const p of [...this.dirs]) if (p === src || p.startsWith(src + '/')) this.dirs.delete(p);
  }

  async delete(path: VaultPath): Promise<void> {
    const p = normalizeVaultPath(path);
    if (this.files.delete(p)) {
      this.emit({ kind: 'deleted', path: p });
      return;
    }
    if (!this.dirs.has(p) || p === '') return;
    for (const f of [...this.files.keys()]) {
      if (f.startsWith(p + '/')) {
        this.files.delete(f);
        this.emit({ kind: 'deleted', path: f });
      }
    }
    for (const d of [...this.dirs]) if (d === p || d.startsWith(p + '/')) this.dirs.delete(d);
  }

  watch(dir: VaultPath, listener: (change: FileChange) => void): Unsubscribe {
    const watcher = { dir: normalizeVaultPath(dir), listener };
    this.watchers.add(watcher);
    return () => this.watchers.delete(watcher);
  }

  private emit(change: FileChange): void {
    for (const { dir, listener } of this.watchers) {
      if (dir === '' || change.path.startsWith(dir + '/')) listener(change);
    }
  }
}
