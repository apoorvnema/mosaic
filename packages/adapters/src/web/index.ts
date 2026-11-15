import type { FileSystem, Platform } from '@mosaic/core';
import {
  consoleLogger,
  FileSystemStorage,
  noopTelemetry,
  systemClock,
} from '../shared/basics-and-storage';
import { createSodiumCrypto } from '../shared/sodium-crypto';
import { createWebDatabase } from './database';
import { OpfsFileSystem } from './opfs-fs';

export { createWebDatabase } from './database';
export { OpfsFileSystem } from './opfs-fs';

/**
 * The browser platform. The vault lives in the Origin Private File System unless
 * a different FileSystem is supplied (the dev server passes one backed by a real
 * local folder). The SQLite index always lives in OPFS — it is derived data.
 */
export async function createWebPlatform(
  options: { fs?: FileSystem; vaultName?: string } = {},
): Promise<Platform> {
  const fs = options.fs ?? (await OpfsFileSystem.open(options.vaultName));
  return {
    name: options.fs ? 'web (local folder)' : 'web',
    fs,
    db: await createWebDatabase(`${options.vaultName ?? 'vault'}-index.sqlite`),
    storage: new FileSystemStorage(fs),
    crypto: await createSodiumCrypto(),
    clock: systemClock,
    logger: consoleLogger(),
    telemetry: noopTelemetry,
  };
}
