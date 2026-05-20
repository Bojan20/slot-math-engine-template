// Quick parity check: Rust ≡ JS for xoshiro128** at SEED=0 (the fallback
// path).  qa-mtl-wasm tests seeds 1, 7, 42, ... but skips 0.  W218 found
// that seed=0 spin diverges Rust vs JS → this isolates whether the RNG
// itself is at fault or the spin pipeline.

import { test, expect } from '@playwright/test';

test('xoshiro128** seed=0 fallback — Rust ≡ JS first 32 outputs', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !!(window as any).MTLOracle && !!(window as any).MTLWasmOracle, { timeout: 10_000 });
  await page.evaluate(async () => { await (window as any).MTLWasmOracle.ready; });

  const result = await page.evaluate(async () => {
    const w = (window as any);
    const jsRng = w.MTLOracle.makeRng(0);
    const jsHead: number[] = [];
    for (let i = 0; i < 32; i++) jsHead.push(jsRng());
    const wasmHead = await w.MTLWasmOracle.rngHead(0, 32);
    const diffs: any[] = [];
    for (let i = 0; i < 32; i++) {
      if (jsHead[i] !== wasmHead[i]) diffs.push({ idx: i, js: jsHead[i], wasm: wasmHead[i] });
    }
    return { jsHead, wasmHead, diffs };
  });
  if (result.diffs.length > 0) {
    console.log('First 4 JS  :', result.jsHead.slice(0, 4));
    console.log('First 4 WASM:', result.wasmHead.slice(0, 4));
    console.log('Diffs:', JSON.stringify(result.diffs.slice(0, 5)));
  }
  expect(result.diffs).toHaveLength(0);
});
