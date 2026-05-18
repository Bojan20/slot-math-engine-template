// Vite config for the operator dashboard (web/operator). Same shape as
// web/studio/vite.config.ts but trimmed: no @engine alias (the operator
// app only needs the shared/ helpers under web/shared/) and the static
// data/ tree is copied into dist verbatim.

import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

function copyStaticAssets(): Plugin {
  return {
    name: 'operator-copy-static',
    apply: 'build',
    closeBundle() {
      const root = fileURLToPath(new URL('.', import.meta.url));
      const out = fileURLToPath(new URL('../../dist/operator', import.meta.url));
      mkdirSync(out, { recursive: true });
      const targets = ['data'];
      for (const rel of targets) {
        const src = resolve(root, rel);
        if (!existsSync(src)) continue;
        const dst = resolve(out, rel);
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
    outDir: fileURLToPath(new URL('../../dist/operator', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5174,
    strictPort: false,
    open: false,
    fs: {
      allow: ['..', '../..'],
    },
  },
});
