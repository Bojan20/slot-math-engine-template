// Vite config for the investor-pitch mini-app (CORTI W205-PITCH).
// Mirrors the conventions used by web/marketplace + web/operator + web/regulator:
// dependency-free boot, dist tree written into ../../dist/pitch.

import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

function copyStaticAssets(): Plugin {
  return {
    name: 'pitch-copy-static',
    apply: 'build',
    closeBundle() {
      const root = fileURLToPath(new URL('.', import.meta.url));
      const out = fileURLToPath(new URL('../../dist/pitch', import.meta.url));
      mkdirSync(out, { recursive: true });
      const targets = ['assets'];
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
  plugins: [copyStaticAssets()],
  build: {
    outDir: fileURLToPath(new URL('../../dist/pitch', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5177,
    strictPort: false,
    open: false,
    fs: {
      allow: ['..', '../..'],
    },
  },
});
