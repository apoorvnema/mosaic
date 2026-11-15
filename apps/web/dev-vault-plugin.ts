import type * as DevVaultServer from '@mosaic/adapters/devserver/server';
import { mkdirSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Serves a local folder to the web app during `pnpm dev`, so the browser build
 * can be developed against real files on disk — the only surface that can be
 * exercised in a headless cloud environment. Dev server only.
 */
export function devVault(vaultDir: string | undefined): Plugin {
  return {
    name: 'mosaic-dev-vault',
    apply: 'serve',
    async configureServer(server) {
      if (!vaultDir) return;
      mkdirSync(vaultDir, { recursive: true });
      // Loaded through Vite so the workspace's TypeScript source needs no build step.
      const { createDevVaultMiddleware } = (await server.ssrLoadModule(
        '@mosaic/adapters/devserver/server',
      )) as typeof DevVaultServer;
      const vault = createDevVaultMiddleware(vaultDir);
      server.middlewares.use((req, res, next) => void vault.middleware(req, res, next));
      server.httpServer?.once('close', vault.close);
      server.config.logger.info(`  ➜  Vault:   ${vaultDir}`);
    },
  };
}
