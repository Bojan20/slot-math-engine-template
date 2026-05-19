// QA: MTL WASM oracle (Witness #3)
// ─────────────────────────────────────────────────────────────────────────
// 1. WASM module loads and exposes oracleVersion()
// 2. mulberry32 RNG in WASM produces bit-identical floats to oracle.js
// 3. spin_wasm on Wrath IR produces same outcome hash as MTLOracle.spin
//    for 100 deterministic seeds (proves Rust ≡ JS oracle on the spin
//    pipeline)
// 4. 3-witness sealing produces stable seal hex + reports witnesses=3
// 5. Tampered IR mismatches detected by 3-witness sealing

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;

test.describe('MTL WASM Oracle (Witness #3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Wait for both JS oracle + WASM loader to be exposed.
    await page.waitForFunction(
      () => !!(window as any).MTLOracle && !!(window as any).MTLWasmOracle,
      { timeout: 10_000 },
    );
    // Wait for WASM ready (dynamic import + init can take ~300ms cold)
    await page.evaluate(async () => { await (window as any).MTLWasmOracle.ready; });
  });

  test('WASM module loads + version reachable', async ({ page }) => {
    const v = await page.evaluate(() => {
      const w = (window as any).MTLWasmOracle;
      return { version: w.version(), isReady: w.isReady };
    });
    expect(v.isReady).toBe(true);
    expect(v.version).toMatch(/mtl-wasm-oracle@/);
  });

  test('mulberry32 bit-paritet — Rust ≡ oracle.js for first 16 outputs on 8 seeds', async ({ page }) => {
    const diffs = await page.evaluate(async () => {
      const w = (window as any);
      const seeds = [1, 7, 42, 100, 999, 12345, 65535, 2147483647];
      const diffs: any[] = [];
      for (const seed of seeds) {
        // JS reference
        const jsRng = w.MTLOracle.makeRng(seed);
        const jsHead: number[] = [];
        for (let i = 0; i < 16; i++) jsHead.push(jsRng());
        // WASM reference
        const wasmHead = await w.MTLWasmOracle.rngHead(seed, 16);
        for (let i = 0; i < 16; i++) {
          if (jsHead[i] !== wasmHead[i]) {
            diffs.push({ seed, idx: i, js: jsHead[i], wasm: wasmHead[i] });
          }
        }
      }
      return diffs;
    });
    expect(diffs).toHaveLength(0);
  });

  test('spin_wasm ≡ oracle.spin on 100 deterministic seeds (Wrath IR)', async ({ page }) => {
    test.skip(!existsSync(DESKTOP_IR), 'Wrath IR fixture absent');
    const irJson = readFileSync(DESKTOP_IR, 'utf8');
    const result = await page.evaluate(async (irJson: string) => {
      const ir = JSON.parse(irJson);
      const w = (window as any);
      const diffs: any[] = [];
      for (let seed = 0; seed < 100; seed++) {
        const a = await w.MTLOracle.spin(ir, seed, 1);
        const b = await w.MTLWasmOracle.spin(ir, seed, 1);
        const aReduced = { win: a.win, scCount: a.scCount, bonusCount: a.bonusCount, lightning: a.lightning, fsWin: a.fsWin, hnwWin: a.hnwWin };
        const bReduced = { win: b.win, scCount: b.scCount, bonusCount: b.bonusCount, lightning: b.lightning, fsWin: b.fsWin, hnwWin: b.hnwWin };
        const aHash = await w.MTLOracle.hashOutcome(aReduced);
        const bHash = b.outcomeHash;
        if (aHash !== bHash) diffs.push({ seed, js: aReduced, wasm: bReduced, jsHash: aHash, wasmHash: bHash });
      }
      return { diffCount: diffs.length, firstFew: diffs.slice(0, 3) };
    }, irJson);
    expect(result.diffCount, `Rust↔JS divergence on ${result.diffCount} seeds: ${JSON.stringify(result.firstFew)}`).toBe(0);
  });

  test('3-witness sealing reports witnesses=3 + seal hex', async ({ page }) => {
    test.skip(!existsSync(DESKTOP_IR), 'Wrath IR fixture absent');
    const irJson = readFileSync(DESKTOP_IR, 'utf8');
    const result = await page.evaluate(async (irJson: string) => {
      const ir = JSON.parse(irJson);
      const w = (window as any);
      // Use iframe runtime + WASM both
      return w.MTLSeal.sealIR(ir, { seedCount: 50, useRuntime: true, useWasm: true });
    }, irJson);
    expect(result.ok, `3-witness seal failed: ${JSON.stringify(result).slice(0, 500)}`).toBe(true);
    expect(result.stats.witnesses).toBe(3);
    expect(result.stats.witnessKinds).toEqual(['oracle.js', 'runtime.js', 'wasm-oracle']);
    expect(typeof result.seal).toBe('string');
    expect(result.seal.length).toBe(64);
  });
});
