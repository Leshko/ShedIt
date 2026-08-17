import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Nest's decorators need the whole module graph up before each suite.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    server: {
      deps: {
        // pdfkit loads its .afm font metrics by path at runtime, which breaks
        // when the bundler rewrites the module. Require it natively instead.
        external: ['pdfkit'],
      },
    },
  },
  esbuild: {
    target: 'es2022',
  },
});
