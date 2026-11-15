import { fileSystemContract } from '@mosaic/core/contracts';
import * as fsp from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import * as nodePath from 'node:path';
import { HttpFileSystem } from '../src/devserver/index';
import { createDevVaultMiddleware } from '../src/devserver/server';

// The dev-folder bridge must behave exactly like a local file system, or the web
// app would be developed against something no shipped platform resembles.
fileSystemContract(
  'devserver (HTTP bridge to a real folder)',
  async () => {
    const dir = await fsp.mkdtemp(nodePath.join(tmpdir(), 'mosaic-dev-'));
    const vault = createDevVaultMiddleware(dir);
    const server = createServer((req, res) => void vault.middleware(req, res, () => res.end()));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return {
      fs: new HttpFileSystem(`http://127.0.0.1:${port}/__vault`),
      cleanup: async () => {
        vault.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        await fsp.rm(dir, { recursive: true, force: true });
      },
    };
  },
  { watchSettleMs: 200 },
);
