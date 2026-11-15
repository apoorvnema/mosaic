import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// TAURI_DEV_HOST is set by `tauri android dev` so a device can reach the dev server.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  optimizeDeps: { exclude: ['@journeyapps/wa-sqlite'] },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    ...(host ? { hmr: { protocol: 'ws', host, port: 1421 } } : {}),
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
