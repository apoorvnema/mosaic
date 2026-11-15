import { defineConfig } from 'vitest/config';

// `pnpm test:core` — node environment, zero browser. Pending specs are excluded
// here and run by vitest.pending.config.ts (see docs/adr/0006).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.pending.test.ts'],
  },
});
