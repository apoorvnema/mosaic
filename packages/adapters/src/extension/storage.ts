import type { Storage } from '@mosaic/core';

/** The slice of chrome.storage.StorageArea this adapter uses; lets tests pass a fake. */
export interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

const KV = 'kv:';
const BLOB = 'blob:';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Storage over chrome.storage.local. Values are base64 because the area holds JSON. */
export class ChromeStorage implements Storage {
  constructor(private area: StorageAreaLike) {}

  private async read(key: string): Promise<Uint8Array | undefined> {
    const value = (await this.area.get(key))[key];
    return typeof value === 'string' ? fromBase64(value) : undefined;
  }

  get = (key: string) => this.read(KV + key);
  set = (key: string, value: Uint8Array) => this.area.set({ [KV + key]: toBase64(value) });
  delete = (key: string) => this.area.remove(KV + key);

  async list(prefix = ''): Promise<string[]> {
    return Object.keys(await this.area.get(null))
      .filter((k) => k.startsWith(KV + prefix))
      .map((k) => k.slice(KV.length))
      .sort();
  }

  putBlob = (hash: string, data: Uint8Array) => this.area.set({ [BLOB + hash]: toBase64(data) });
  getBlob = (hash: string) => this.read(BLOB + hash);
  hasBlob = async (hash: string) => BLOB + hash in (await this.area.get(BLOB + hash));
  deleteBlob = (hash: string) => this.area.remove(BLOB + hash);
}
