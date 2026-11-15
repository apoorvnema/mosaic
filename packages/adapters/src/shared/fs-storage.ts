import type { FileSystem, Storage } from '@mosaic/core';

/**
 * Storage implemented on a FileSystem, under `.mosaic/` in the vault. Used
 * wherever the platform has a real folder, so the oplog travels with it.
 * Each key segment is percent-encoded into a file name.
 */
export class FileSystemStorage implements Storage {
  constructor(
    private fs: FileSystem,
    private root = '.mosaic/store',
  ) {}

  private keyPath(key: string): string {
    return `${this.root}/kv/${key.split('/').map(encodeSegment).join('/')}`;
  }
  private blobPath(hash: string): string {
    if (!/^[0-9a-zA-Z_-]+$/.test(hash)) throw new Error(`Invalid blob hash: ${hash}`);
    return `${this.root}/blobs/${hash.slice(0, 2)}/${hash}`;
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    return this.readOptional(this.keyPath(key));
  }
  async set(key: string, value: Uint8Array): Promise<void> {
    await this.fs.write(this.keyPath(key), value);
  }
  async delete(key: string): Promise<void> {
    await this.fs.delete(this.keyPath(key));
  }
  async list(prefix = ''): Promise<string[]> {
    const base = `${this.root}/kv`;
    if (!(await this.fs.exists(base))) return [];
    const entries = await this.fs.list(base, { recursive: true });
    return entries
      .filter((e) => e.kind === 'file')
      .map((e) =>
        e.path
          .slice(base.length + 1)
          .split('/')
          .map(decodeURIComponent)
          .join('/'),
      )
      .filter((key) => key.startsWith(prefix))
      .sort();
  }

  async putBlob(hash: string, data: Uint8Array): Promise<void> {
    await this.fs.write(this.blobPath(hash), data);
  }
  async getBlob(hash: string): Promise<Uint8Array | undefined> {
    return this.readOptional(this.blobPath(hash));
  }
  async hasBlob(hash: string): Promise<boolean> {
    return this.fs.exists(this.blobPath(hash));
  }
  async deleteBlob(hash: string): Promise<void> {
    await this.fs.delete(this.blobPath(hash));
  }

  private async readOptional(path: string): Promise<Uint8Array | undefined> {
    return (await this.fs.exists(path)) ? this.fs.read(path) : undefined;
  }
}

function encodeSegment(segment: string): string {
  // encodeURIComponent leaves `.` alone, so guard the two names that are not files.
  const encoded = encodeURIComponent(segment).replace(/\*/g, '%2A');
  return encoded === '.' ? '%2E' : encoded === '..' ? '%2E%2E' : encoded;
}
