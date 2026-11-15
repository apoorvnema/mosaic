import { createTauriPlatform } from '@mosaic/adapters/tauri';
import { mountMosaic } from '@mosaic/ui';
import '@mosaic/ui/styles.css';
import { appDataDir, join } from '@tauri-apps/api/path';

/**
 * The mobile shell. Until the folder picker lands, the vault is a folder inside
 * the app's data directory. Everything else is the shared app from packages/ui.
 */
mountMosaic(document.getElementById('root')!, async () =>
  createTauriPlatform(await join(await appDataDir(), 'vault'), 'mobile'),
);
