import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { devVault } from './dev-vault-plugin.ts';

// MOSAIC_VAULT picks the folder `pnpm dev` runs against. Default: the sample vault
// at the repo root. Set it to `opfs` to use the browser's private file system.
const requested = process.env.MOSAIC_VAULT ?? resolve(import.meta.dirname, '../../dev-vault');
const vaultDir = requested === 'opfs' ? undefined : resolve(requested);

export default defineConfig(({ command }) => ({
  define: { __MOSAIC_DEV_VAULT__: JSON.stringify(command === 'serve' && vaultDir !== undefined) },
  plugins: [
    react(),
    devVault(vaultDir),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 8_000_000,
      },
      manifest: {
        name: 'Mosaic',
        short_name: 'Mosaic',
        description:
          'Local-first notes: capture, notebooks, databases and canvas over plain files.',
        display: 'standalone',
        background_color: '#f7f7f8',
        theme_color: '#5b5bd6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  // wa-sqlite locates its .wasm relative to its own module; pre-bundling breaks that.
  optimizeDeps: { exclude: ['@journeyapps/wa-sqlite'] },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
}));
