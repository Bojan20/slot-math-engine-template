// Vite config for the public marketing site (web/marketing).
// W214 Faza 800.1 Agent C — same conventions as web/pitch / web/marketplace:
//   * static-first, dependency-free boot
//   * dist tree written into ../../dist/marketing
//   * multi-page entries via rollupOptions.input (landing + sub-pages)

import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

function copyStaticAssets(): Plugin {
  return {
    name: 'marketing-copy-static',
    apply: 'build',
    closeBundle() {
      const root = fileURLToPath(new URL('.', import.meta.url));
      const out = fileURLToPath(new URL('../../dist/marketing', import.meta.url));
      mkdirSync(out, { recursive: true });
      const targets = ['sitemap.xml', 'robots.txt'];
      for (const rel of targets) {
        const src = resolve(root, rel);
        if (!existsSync(src)) continue;
        const dst = resolve(out, rel);
        mkdirSync(dirname(dst), { recursive: true });
        cpSync(src, dst, { recursive: false });
      }
    },
  };
}

export default defineConfig({
  root: '.',
  base: './',
  plugins: [copyStaticAssets()],
  build: {
    outDir: fileURLToPath(new URL('../../dist/marketing', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(fileURLToPath(new URL('.', import.meta.url)), 'index.html'),
        howItWorks: resolve(
          fileURLToPath(new URL('.', import.meta.url)),
          'pages/how-it-works.html'
        ),
        pricing: resolve(
          fileURLToPath(new URL('.', import.meta.url)),
          'pages/pricing.html'
        ),
        coverage: resolve(
          fileURLToPath(new URL('.', import.meta.url)),
          'pages/coverage.html'
        ),
        demo: resolve(fileURLToPath(new URL('.', import.meta.url)), 'pages/demo.html'),
        docs: resolve(fileURLToPath(new URL('.', import.meta.url)), 'pages/docs.html'),
        contact: resolve(
          fileURLToPath(new URL('.', import.meta.url)),
          'pages/contact.html'
        ),
      },
    },
  },
  server: {
    port: 5179,
    strictPort: false,
    open: false,
    fs: {
      allow: ['..', '../..'],
    },
  },
});
