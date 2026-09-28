import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.integration.test.ts'],
    environment: 'node',
    globals: false,
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // The test database is shared state; serial files keep truncation honest.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
