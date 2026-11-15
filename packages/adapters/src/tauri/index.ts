import type { Platform } from '@mosaic/core';
import {
  consoleLogger,
  FileSystemStorage,
  noopTelemetry,
  systemClock,
} from '../shared/basics-and-storage';
import { createSodiumCrypto } from '../shared/sodium-crypto';
import { createTauriDatabase } from './database';
import { TauriFileSystem } from './fs';

export { createTauriDatabase } from './database';
export { TauriFileSystem } from './fs';

/** Desktop (Linux, Windows, macOS) and mobile (Android, iOS) share this platform. */
export async function createTauriPlatform(
  vaultDir: string,
  kind: 'desktop' | 'mobile',
): Promise<Platform> {
  const fs = new TauriFileSystem(vaultDir);
  await fs.mkdir('.mosaic');
  return {
    name: kind,
    fs,
    db: await createTauriDatabase(`${vaultDir.replace(/[\\/]+$/, '')}/.mosaic/index.sqlite`),
    storage: new FileSystemStorage(fs),
    crypto: await createSodiumCrypto(),
    clock: systemClock,
    logger: consoleLogger(),
    telemetry: noopTelemetry,
  };
}
