import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // macOS writes AppleDouble (`._foo.test.ts`) twins onto ExFAT volumes
    // (T7 external). They match `*.test.ts` and vitest blows up trying to
    // load them as TS — same root problem the .gitignore solves for git.
    // Excluding here keeps the runner sane on the source machine.
    exclude: ['**/._*', '**/node_modules/**', '**/dist/**'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', '**/._*']
    }
  }
});
