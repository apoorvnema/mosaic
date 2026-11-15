/**
 * A vault-relative POSIX path: forward slashes, no leading slash, no `.` or `..`
 * segments. `''` is the vault root. Adapters own the mapping to a real location.
 */
export type VaultPath = string;

export interface FileEntry {
  path: VaultPath;
  kind: 'file' | 'directory';
}

export interface FileStat {
  kind: 'file' | 'directory';
  size: number;
  /** Milliseconds since the epoch. */
  modifiedAt: number;
}

export type FileChange =
  | { kind: 'created'; path: VaultPath }
  | { kind: 'modified'; path: VaultPath }
  | { kind: 'deleted'; path: VaultPath };

export type Unsubscribe = () => void;

export interface FileSystemCapabilities {
  /** False where the platform cannot observe external changes (some browsers). */
  watch: boolean;
}

/**
 * Read, write, list, watch, move and delete inside one vault folder. The vault is
 * the source of truth, so `write` must be crash-safe: a reader never observes a
 * half-written file.
 */
export interface FileSystem {
  readonly capabilities: FileSystemCapabilities;

  /** Throws FileNotFoundError when the path does not exist. */
  read(path: VaultPath): Promise<Uint8Array>;
  readText(path: VaultPath): Promise<string>;
  /** Creates parent directories as needed. Atomic: temp file then rename where possible. */
  write(path: VaultPath, data: Uint8Array | string): Promise<void>;
  /** Entries directly inside `dir`, or the whole subtree when `recursive`. Sorted by path. */
  list(dir: VaultPath, options?: { recursive?: boolean }): Promise<FileEntry[]>;
  /** `undefined` when the path does not exist. */
  stat(path: VaultPath): Promise<FileStat | undefined>;
  exists(path: VaultPath): Promise<boolean>;
  mkdir(path: VaultPath): Promise<void>;
  /** Creates the destination's parent directories. Fails if `to` already exists. */
  move(from: VaultPath, to: VaultPath): Promise<void>;
  /** Deletes a file, or a directory with its contents. No-op when missing. */
  delete(path: VaultPath): Promise<void>;
  /** Observe changes under `dir`, recursively, including ones made by other programs. */
  watch(dir: VaultPath, listener: (change: FileChange) => void): Unsubscribe;
}

/** Normalise and validate a vault path. Throws on anything that could escape the vault. */
export function normalizeVaultPath(path: string): VaultPath {
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') throw new Error(`Path escapes the vault: ${path}`);
    segments.push(segment);
  }
  return segments.join('/');
}

export function parentPath(path: VaultPath): VaultPath {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function joinPath(...parts: string[]): VaultPath {
  return normalizeVaultPath(parts.join('/'));
}
