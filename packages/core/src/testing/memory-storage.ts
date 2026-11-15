import type { Storage } from '../platform/storage';

export class MemoryStorage implements Storage {
  private kv = new Map<string, Uint8Array>();
  private blobs = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | undefined> {
    return this.kv.get(key)?.slice();
  }
  async set(key: string, value: Uint8Array): Promise<void> {
    this.kv.set(key, value.slice());
  }
  async delete(key: string): Promise<void> {
    this.kv.delete(key);
  }
  async list(prefix = ''): Promise<string[]> {
    return [...this.kv.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
  async putBlob(hash: string, data: Uint8Array): Promise<void> {
    this.blobs.set(hash, data.slice());
  }
  async getBlob(hash: string): Promise<Uint8Array | undefined> {
    return this.blobs.get(hash)?.slice();
  }
  async hasBlob(hash: string): Promise<boolean> {
    return this.blobs.has(hash);
  }
  async deleteBlob(hash: string): Promise<void> {
    this.blobs.delete(hash);
  }
}
