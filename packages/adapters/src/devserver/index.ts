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
import { DEV_VAULT_BASE } from './protocol';

export * from './protocol';

/**
 * Development only. A FileSystem that talks to the Vite dev server, which serves
 * a real local folder (see apps/web/dev-vault-plugin.ts). This is what lets
 * `pnpm dev` run the web app against a folder on disk, external edits included,
 * in an environment with no native shell. Never bundled into a production build.
 */
export class HttpFileSystem implements FileSystem {
  readonly capabilities = { watch: true };

  constructor(private base = DEV_VAULT_BASE) {}

  private async call(
    op: string,
    params: Record<string, string>,
    body?: BodyInit,
  ): Promise<Response> {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(
      `${this.base}/${op}?${query}`,
      body === undefined ? {} : { method: 'POST', body },
    );
    if (response.status === 404) throw new FileNotFoundError(params.path ?? '');
    if (!response.ok) throw new Error(`Dev vault ${op} failed: ${await response.text()}`);
    return response;
  }

  async read(path: VaultPath): Promise<Uint8Array> {
    const response = await this.call('read', { path: normalizeVaultPath(path) });
    return new Uint8Array(await response.arrayBuffer());
  }
  async readText(path: VaultPath): Promise<string> {
    return new TextDecoder().decode(await this.read(path));
  }
  async write(path: VaultPath, data: Uint8Array | string): Promise<void> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    await this.call(
      'write',
      { path: normalizeVaultPath(path) },
      bytes.slice() as Uint8Array<ArrayBuffer>,
    );
  }
  async list(dir: VaultPath, options?: { recursive?: boolean }): Promise<FileEntry[]> {
    const response = await this.call('list', {
      path: normalizeVaultPath(dir),
      recursive: options?.recursive ? '1' : '',
    });
    return (await response.json()) as FileEntry[];
  }
  async stat(path: VaultPath): Promise<FileStat | undefined> {
    const response = await this.call('stat', { path: normalizeVaultPath(path) });
    return ((await response.json()) as FileStat | null) ?? undefined;
  }
  async exists(path: VaultPath): Promise<boolean> {
    return (await this.stat(path)) !== undefined;
  }
  async mkdir(path: VaultPath): Promise<void> {
    await this.call('mkdir', { path: normalizeVaultPath(path) }, '');
  }
  async move(from: VaultPath, to: VaultPath): Promise<void> {
    await this.call('move', { path: normalizeVaultPath(from), to: normalizeVaultPath(to) }, '');
  }
  async delete(path: VaultPath): Promise<void> {
    await this.call('delete', { path: normalizeVaultPath(path) }, '');
  }

  /** Server-sent events read through fetch, so the same code runs in browsers and node. */
  watch(dir: VaultPath, listener: (change: FileChange) => void): Unsubscribe {
    const base = normalizeVaultPath(dir);
    const abort = new AbortController();
    void (async () => {
      const response = await fetch(`${this.base}/watch`, { signal: abort.signal });
      const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const message = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (!message.startsWith('data: ')) continue;
          const change = JSON.parse(message.slice(6)) as FileChange;
          if (base === '' || change.path.startsWith(base + '/')) listener(change);
        }
      }
    })().catch(() => undefined);
    return () => abort.abort();
  }
}
