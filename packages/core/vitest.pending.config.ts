import { defineConfig } from 'vitest/config';

// Behaviour specs for modules that are not implemented yet. Expected to be red.
// Implementing a module means renaming its spec from *.pending.test.ts to *.test.ts.
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.pending.test.ts'] },
});
