/**
 * @mosaic/core — pure TypeScript. No DOM, no React, no platform imports.
 * Everything a shell needs crosses the adapter interfaces in ./platform.
 */
export * from './errors';
export * from './platform/index';

export * from './store/index';
export * from './crdt/index';
export * from './filebridge/index';
export * from './indexer/index';
export * from './search/index';
export * from './schema/index';
export * as vaultCrypto from './crypto/index';
export * from './sync/index';
export * from './plugins/index';
export * from './vault/index';
