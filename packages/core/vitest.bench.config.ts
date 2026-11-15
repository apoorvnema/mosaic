import { defineConfig } from 'vitest/config';

// Performance budgets. Kept out of `pnpm test` because they are slow; CI runs them
// as their own job and the numbers are printed in the log.
export default defineConfig({
  test: { environment: 'node', include: ['test/bench/**/*.bench.test.ts'] },
});
