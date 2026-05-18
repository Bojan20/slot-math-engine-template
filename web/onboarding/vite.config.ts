// Vite config for the onboarding mini-app (CORTI W206-ONBOARDING).
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: '.',
  base: './',
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../../dist/onboarding', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5179,
    strictPort: false,
    open: false,
    fs: { allow: ['..', '../..'] },
  },
});
