// Vite config for the support portal mini-app (CORTI W206-ONBOARDING).
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

function copyStaticAssets(): Plugin {
  return {
    name: 'support-copy-static',
    apply: 'build',
    closeBundle() {
      const root = fileURLToPath(new URL('.', import.meta.url));
      const out = fileURLToPath(new URL('../../dist/support', import.meta.url));
      mkdirSync(out, { recursive: true });
      const src = resolve(root, 'data');
      if (existsSync(src)) {
        const dst = resolve(out, 'data');
        mkdirSync(dirname(dst), { recursive: true });
        cpSync(src, dst, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  root: '.',
  base: './',
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  plugins: [copyStaticAssets()],
  build: {
    outDir: fileURLToPath(new URL('../../dist/support', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5180,
    strictPort: false,
    open: false,
    fs: { allow: ['..', '../..'] },
  },
});
