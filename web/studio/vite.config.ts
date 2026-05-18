// Vite config for slot-math-studio
// Studio loads real TS engine modules from `../../src/` via the @engine alias.
// Build output goes to `../../dist/studio/` so it sits next to other artifacts.

import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// Vite's bundler only sees ES module entrypoints. The legacy `app.js`
// (large IIFE, intentional non-module) plus the `data/`, `symbols/lib/`,
// and `DESIGN_NOTES.md` static trees must be copied verbatim into the
// dist output. We do that via a tiny custom plugin instead of a public/
// re-arrange so the source tree mirrors the file:// preview directly.
function copyStaticAssets(): Plugin {
  return {
    name: 'studio-copy-static',
    apply: 'build',
    closeBundle() {
      const root = fileURLToPath(new URL('.', import.meta.url));
      const out = fileURLToPath(new URL('../../dist/studio', import.meta.url));
      mkdirSync(out, { recursive: true });
      const targets = ['app.js', 'data', 'symbols', 'DESIGN_NOTES.md', 'README.md'];
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
      '@engine': fileURLToPath(new URL('../../src', import.meta.url)),
    },
  },
  plugins: [copyStaticAssets()],
  build: {
    outDir: fileURLToPath(new URL('../../dist/studio', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    strictPort: false,
    open: false,
    fs: {
      // Allow Vite to read from outside the studio dir so the @engine
      // alias resolves into `../../src/`.
      allow: ['..', '../..'],
    },
  },
  // Engine modules use `.js` extension specifiers (Node16 ESM convention).
  // Vite handles those fine for local TS sources; nothing else needed.
});
