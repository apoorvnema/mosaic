import type { FileEntry, Platform } from '@mosaic/core';
import { useEffect, useState } from 'react';
import { NOTE_COLORS, noteColorVar } from '../theme';
import { FileIcon } from './icons';

type Check = { state: 'pending' | 'ok' | 'error'; value: string; detail?: string };
const PENDING: Check = { state: 'pending', value: 'Checking…' };

interface VaultFile extends FileEntry {
  size: number;
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

async function failed(error: unknown): Promise<Check> {
  return {
    state: 'error',
    value: 'Failed',
    detail: error instanceof Error ? error.message : String(error),
  };
}

/** Exercise each adapter once, the way core will, and report what happened. */
function useAdapterChecks(platform: Platform) {
  const [database, setDatabase] = useState<Check>(PENDING);
  const [crypto, setCrypto] = useState<Check>(PENDING);
  const [storage, setStorage] = useState<Check>(PENDING);

  useEffect(() => {
    let live = true;
    const set = (setter: (c: Check) => void) => (check: Check) => live && setter(check);

    (async (): Promise<Check> => {
      const [row] = await platform.db.query<{ version: string }>(
        'select sqlite_version() as version',
      );
      await platform.db.exec(
        'create virtual table if not exists temp.m_fts_probe using fts5(body)',
      );
      return { state: 'ok', value: `SQLite ${row?.version ?? '?'}`, detail: 'FTS5 available' };
    })()
      .catch(failed)
      .then(set(setDatabase));

    (async (): Promise<Check> => {
      const key = platform.crypto.randomBytes(32);
      const message = new TextEncoder().encode('mosaic');
      const opened = await platform.crypto.decrypt(
        key,
        await platform.crypto.encrypt(key, message),
      );
      if (new TextDecoder().decode(opened) !== 'mosaic') throw new Error('round-trip mismatch');
      return { state: 'ok', value: 'libsodium', detail: 'XChaCha20-Poly1305 round-trip' };
    })()
      .catch(failed)
      .then(set(setCrypto));

    (async (): Promise<Check> => {
      await platform.storage.set(
        'diagnostics/last-open',
        new TextEncoder().encode(String(platform.clock.now())),
      );
      const keys = await platform.storage.list('diagnostics/');
      return {
        state: 'ok',
        value: 'Key-value + blobs',
        detail: `${keys.length} key under .mosaic/`,
      };
    })()
      .catch(failed)
      .then(set(setStorage));

    return () => {
      live = false;
    };
  }, [platform]);

  return { database, crypto, storage };
}

/** The vault's files, kept current by the file watcher — external edits included. */
function useVaultFiles(platform: Platform) {
  const [files, setFiles] = useState<VaultFile[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let live = true;
    const load = async () => {
      const entries = await platform.fs.list('', { recursive: true });
      const visible = entries.filter((e) => e.kind === 'file' && !e.path.startsWith('.mosaic/'));
      const withSize = await Promise.all(
        visible.map(async (e) => ({ ...e, size: (await platform.fs.stat(e.path))?.size ?? 0 })),
      );
      if (live) setFiles(withSize);
    };
    const refresh = () => void load().catch((e: unknown) => live && setError(String(e)));
    refresh();
    const stop = platform.fs.watch('', (change) => {
      if (!change.path.startsWith('.mosaic/')) refresh();
    });
    return () => {
      live = false;
      stop();
    };
  }, [platform]);

  return { files, error };
}

function StatusCard({ label, check }: { label: string; check: Check }) {
  return (
    <div
      className="m-card m-status"
      data-testid={`status-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="m-status-label">
        <span className="m-dot" data-state={check.state} />
        {label}
      </div>
      <div className="m-status-value">{check.value}</div>
      {check.detail && <div className="m-status-detail">{check.detail}</div>}
    </div>
  );
}

/**
 * The skeleton's only screen: proof that the shell is wired to a real platform
 * through the adapter interfaces. It is replaced by the Board in a later session.
 */
export function FoundationStatus({ platform }: { platform: Platform }) {
  const checks = useAdapterChecks(platform);
  const { files, error } = useVaultFiles(platform);
  const fileCheck: Check = error
    ? { state: 'error', value: 'Failed', detail: error }
    : files
      ? {
          state: 'ok',
          value: `${files.length} ${files.length === 1 ? 'file' : 'files'}`,
          detail: platform.fs.capabilities.watch ? 'Watching for changes' : 'No file watching here',
        }
      : PENDING;

  return (
    <>
      <header className="m-page-head">
        <h1>Foundation</h1>
        <p>
          The skeleton is running on <strong>{platform.name}</strong>. Every check below goes
          through the adapter interfaces in <code>packages/core</code>.
        </p>
      </header>

      <section aria-labelledby="adapters-title">
        <h2 id="adapters-title" className="m-section-title">
          Adapters
        </h2>
        <div className="m-status-grid">
          <StatusCard label="File system" check={fileCheck} />
          <StatusCard label="Database" check={checks.database} />
          <StatusCard label="Storage" check={checks.storage} />
          <StatusCard label="Crypto" check={checks.crypto} />
        </div>
      </section>

      <section aria-labelledby="files-title">
        <h2 id="files-title" className="m-section-title">
          Vault files
        </h2>
        <div className="m-card m-file-list" data-testid="vault-files">
          {files?.length === 0 && (
            <div className="m-empty">This vault is empty. Add a markdown file to the folder.</div>
          )}
          {files?.map((file) => {
            const slash = file.path.lastIndexOf('/');
            return (
              <div className="m-file" key={file.path} data-path={file.path}>
                <FileIcon />
                <span className="m-file-name">{file.path.slice(slash + 1)}</span>
                {slash !== -1 && <span className="m-file-folder">{file.path.slice(0, slash)}</span>}
                <span className="m-file-size">{formatSize(file.size)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="colors-title">
        <h2 id="colors-title" className="m-section-title">
          Note colours
        </h2>
        <div className="m-swatches">
          {NOTE_COLORS.map((color) => (
            <div key={color} className="m-swatch" style={{ background: noteColorVar(color) }}>
              {color}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
