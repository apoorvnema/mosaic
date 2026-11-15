import type { RelayOnlyPlatform } from '@mosaic/core';
import { consoleLogger, noopTelemetry, systemClock } from '../shared/basics';
import { createSodiumCrypto } from '../shared/sodium-crypto';
import { ChromeStorage, type StorageAreaLike } from './storage';

export { ChromeStorage, type StorageAreaLike } from './storage';

/**
 * The Chrome extension platform. It deliberately returns RelayOnlyPlatform: there
 * is no `fs` and no `db`. An extension cannot own a vault folder, so it is a sync
 * client only — it queues notes in chrome.storage and talks to the relay. Code
 * that needs a vault will not type-check against this platform, which is the point.
 */
export async function createExtensionPlatform(
  area: StorageAreaLike = chrome.storage.local,
): Promise<RelayOnlyPlatform> {
  return {
    name: 'extension',
    storage: new ChromeStorage(area),
    crypto: await createSodiumCrypto(),
    clock: systemClock,
    logger: consoleLogger(),
    telemetry: noopTelemetry,
  };
}
