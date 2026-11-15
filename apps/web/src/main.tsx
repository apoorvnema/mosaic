import { createWebPlatform } from '@mosaic/adapters/web';
import { mountMosaic } from '@mosaic/ui';
import '@mosaic/ui/styles.css';

/**
 * The web shell. In development the vault is a real local folder served by the
 * Vite dev server (see ../dev-vault-plugin.ts); in production it is the Origin
 * Private File System. The dev adapter is imported dynamically so it is never
 * part of a production bundle.
 */
mountMosaic(document.getElementById('root')!, async () => {
  if (import.meta.env.DEV && __MOSAIC_DEV_VAULT__) {
    const { HttpFileSystem } = await import('@mosaic/adapters/devserver');
    return createWebPlatform({ fs: new HttpFileSystem(), vaultName: 'dev' });
  }
  return createWebPlatform();
});
