import {
  cryptoContract,
  databaseContract,
  fileSystemContract,
  storageContract,
} from '@mosaic/core/contracts';
import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNodeDatabase, createNodePlatform, NodeFileSystem } from '../src/node/index';
import { createSodiumCrypto, FileSystemStorage } from '../src/shared/index';

async function tempDir() {
  const dir = await fsp.mkdtemp(nodePath.join(tmpdir(), 'mosaic-test-'));
  return { dir, cleanup: () => fsp.rm(dir, { recursive: true, force: true }) };
}

fileSystemContract(
  'node (real fs in a temp dir)',
  async () => {
    const { dir, cleanup } = await tempDir();
    return { fs: new NodeFileSystem(dir), cleanup };
  },
  { watchSettleMs: 150 },
);

storageContract('FileSystemStorage over node fs', async () => {
  const { dir, cleanup } = await tempDir();
  return { storage: new FileSystemStorage(new NodeFileSystem(dir)), cleanup };
});

databaseContract('node (better-sqlite3)', async () => {
  const { dir, cleanup } = await tempDir();
  return { db: createNodeDatabase(nodePath.join(dir, 'index.sqlite')), cleanup };
});

cryptoContract('libsodium', createSodiumCrypto);

describe('node platform', () => {
  it('works on a folder it has never seen, and keeps its own state under .mosaic/', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await fsp.writeFile(nodePath.join(dir, 'existing.md'), '# Already here\n');
      const platform = await createNodePlatform(dir);
      expect(await platform.fs.readText('existing.md')).toBe('# Already here\n');
      await platform.storage.set('oplog/doc/1', new Uint8Array([1]));
      await platform.db.exec('create table t (x)');
      await platform.db.close();
      const top = (await fsp.readdir(dir)).sort();
      expect(top).toEqual(['.mosaic', 'existing.md']);
    } finally {
      await cleanup();
    }
  });

  it('sees edits made by another program', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      const fs = new NodeFileSystem(dir);
      const seen: string[] = [];
      const stop = fs.watch('', (c) => seen.push(`${c.kind}:${c.path}`));
      await new Promise((r) => setTimeout(r, 150));
      await fsp.writeFile(nodePath.join(dir, 'from-vim.md'), 'external');
      await new Promise((r) => setTimeout(r, 150));
      stop();
      expect(seen[0]).toBe('created:from-vim.md');
    } finally {
      await cleanup();
    }
  });
});
