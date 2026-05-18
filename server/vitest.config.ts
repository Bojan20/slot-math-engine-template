import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  test: {
    globals: true,
    environment: 'node',
    include: [resolve(here, 'tests/**/*.test.ts')],
    exclude: ['**/._*', '**/node_modules/**', '**/dist/**'],
    testTimeout: 30000,
  },
});
