// CORTI W207-DOCS - Vite config for the public documentation site.
//
// Mirrors the conventions used by web/pitch + web/onboarding: dependency-free
// boot, copies content/ markdown into the build, dist tree written into
// ../../dist/docs. Markdown is loaded at runtime via fetch from /content/ so
// the same files serve both `npm run docs:dev` and `npm run docs:build`.

import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function copyContent(): Plugin {
  return {
    name: 'docs-copy-content',
    apply: 'build',
    closeBundle() {
      const out = fileURLToPath(new URL('../../dist/docs', import.meta.url));
      mkdirSync(out, { recursive: true });
      const src = fileURLToPath(new URL('./content', import.meta.url));
      if (!existsSync(src)) return;
      const dst = resolve(out, 'content');
      cpSync(src, dst, { recursive: true });
    },
  };
}

// Serves /content/<rel> from ./content/<rel> during `vite dev`.
// Vite's built-in `publicDir` flattens onto root which is not what we want;
// a tiny middleware is more readable than a custom virtual fs.
function serveContent(): Plugin {
  return {
    name: 'docs-serve-content',
    configureServer(server) {
      const root = fileURLToPath(new URL('./content', import.meta.url));
      server.middlewares.use('/content', (req, res, next) => {
        if (!req.url) return next();
        const rel = req.url.split('?')[0].replace(/\.\./g, '');
        const full = resolve(root, '.' + rel);
        if (!existsSync(full)) return next();
        const ext = full.split('.').pop() ?? '';
        const ct: Record<string, string> = {
          md: 'text/markdown; charset=utf-8',
          ts: 'text/plain; charset=utf-8',
          html: 'text/html; charset=utf-8',
          json: 'application/json; charset=utf-8',
        };
        res.setHeader('content-type', ct[ext] ?? 'text/plain; charset=utf-8');
        res.end(readFileSync(full));
      });
    },
  };
}

export default defineConfig({
  root: '.',
  base: './',
  plugins: [serveContent(), copyContent()],
  build: {
    outDir: fileURLToPath(new URL('../../dist/docs', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5181,
    strictPort: false,
    open: false,
    fs: {
      allow: ['..', '../..'],
    },
  },
});
