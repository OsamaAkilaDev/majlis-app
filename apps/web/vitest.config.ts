import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors tsconfig's "@/*" path so a test can import a module that uses the alias.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  // apps/web/tsconfig.json sets jsx: preserve, which oxc cannot emit for an imported .tsx module.
  oxc: { jsx: { runtime: 'automatic' } },
});
