import type { Platform } from '@mosaic/core';
import * as fsp from 'node:fs/promises';
import * as nodePath from 'node:path';
import {
  consoleLogger,
  FileSystemStorage,
  noopTelemetry,
  systemClock,
} from '../shared/basics-and-storage';
import { createSodiumCrypto } from '../shared/sodium-crypto';
import { createNodeDatabase } from './database';
import { NodeFileSystem } from './fs';

export { createNodeDatabase } from './database';
export { NodeFileSystem } from './fs';

/**
 * The node platform: a real folder and better-sqlite3. For tests, the dev server
 * and command-line tools — never shipped inside an app shell.
 */
export async function createNodePlatform(vaultDir: string): Promise<Platform> {
  const fs = new NodeFileSystem(vaultDir);
  await fsp.mkdir(nodePath.join(fs.root, '.mosaic'), { recursive: true });
  return {
    name: 'node',
    fs,
    db: createNodeDatabase(nodePath.join(fs.root, '.mosaic', 'index.sqlite')),
    storage: new FileSystemStorage(fs),
    crypto: await createSodiumCrypto(),
    clock: systemClock,
    logger: consoleLogger(),
    telemetry: noopTelemetry,
  };
}
