#!/usr/bin/env node
/**
 * CORTI W205-PITCH — CLI PDF export.
 *
 * Renders the investor deck to ../../dist/pitch/SlotMathEngine-InvestorDeck-2026.pdf.
 * Imports the TypeScript modules via the local Vitest/Vite runtime since this
 * is invoked after `npm run pitch:build`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument } from 'pdf-lib';

// The mini-app source modules are TypeScript. Use tsx via the parent
// repo's binary if available. Otherwise, dynamic-import the compiled JS
// from the dist/pitch tree.
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../../../dist/pitch');
const OUT_FILE = resolve(OUT_DIR, 'SlotMathEngine-InvestorDeck-2026.pdf');

async function main() {
  // Load the TS sources via tsx-like loader. The simplest portable path is
  // to copy the bytes from the in-browser export by re-running the
  // pdf-export module under Node. We use a dynamic ESM import — Node can
  // import the TS source directly only when run via `tsx`, so this script
  // is wired into the parent `package.json` as a regular Node ESM module
  // that imports the pre-built js if available; otherwise it falls back
  // to importing pdf-lib directly and stitching a placeholder.
  let exportDeck;
  let SLIDES;
  try {
    // First try the compiled dist/pitch bundle (after `npm run pitch:build`).
    const builtMain = resolve(OUT_DIR, 'assets/main.js');
    // eslint-disable-next-line no-unused-vars
    const _ignored = await import(builtMain).catch(() => null);
    // The Vite build is a browser bundle, so we always fall through to the
    // source-import path below — kept here for future compiled-bundle reuse.
    throw new Error('skip-built');
  } catch (_e) {
    // Source-import via tsx — assumes the repo root runs this through `tsx`.
    const slidesMod = await import('../src/slides.ts').catch(() => null);
    const pdfMod = await import('../src/pdf-export.ts').catch(() => null);
    if (!slidesMod || !pdfMod) {
      console.warn('[pitch:export-pdf] TS source not loadable from Node; writing a minimal placeholder PDF.');
      const placeholder = await PDFDocument.create();
      placeholder.addPage();
      mkdirSync(OUT_DIR, { recursive: true });
      const bytes = await placeholder.save();
      writeFileSync(OUT_FILE, bytes);
      console.log(`[pitch:export-pdf] wrote placeholder ${OUT_FILE}`);
      return;
    }
    SLIDES = slidesMod.SLIDES;
    exportDeck = pdfMod.exportDeck;
  }

  const bytes = await exportDeck(SLIDES, { includeNotes: true });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, bytes);
  console.log(`[pitch:export-pdf] wrote ${OUT_FILE} · ${bytes.byteLength.toLocaleString()} bytes`);
}

main().catch((err) => {
  console.error('[pitch:export-pdf] failed:', err);
  process.exit(1);
});
