// QA: MTL Sealing Ceremony
// ─────────────────────────────────────────────────────────────────────────
// Drives the Studio Sealing Ceremony directly in the browser (no DOM clicks)
// to verify:
//   1. Wrath IR seals successfully with a deterministic seal hex
//   2. Same IR seals to the SAME hex twice (determinism)
//   3. Tampered IR (modified paytable) seals to a DIFFERENT hex
//   4. After sealing, MTLSeal.isSealed() returns true
//
// Phase A — oracle-only ceremony is sufficient here.  Dual-witness mode
// (oracle + runtime via iframe) is exercised in qa-mtl-lockstep.spec.ts.

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

const DESKTOP_IR = `${process.env.HOME}/Desktop/wrath-of-olympus.ir.json`;

test.describe('MTL Sealing Ceremony', () => {
  test.beforeAll(() => {
    expect(existsSync(DESKTOP_IR), 'Wrath IR fixture on Desktop').toBe(true);
  });

  test('seals Wrath IR deterministically + tampered IR diverges', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for MTL modules to load
    await page.waitForFunction(
      () => !!(window as any).MTLOracle && !!(window as any).MTLDNA && !!(window as any).MTLSeal && !!(window as any).MTLDiff,
      { timeout: 10_000 },
    );

    const irJson = readFileSync(DESKTOP_IR, 'utf8');

    // ── Phase A: oracle-only seal (fast, no iframe) ────────────────────
    const first = await page.evaluate(async (irJson: string) => {
      const ir = JSON.parse(irJson);
      const w = window as any;
      const result = await w.MTLSeal.sealIR(ir, { seedCount: 200, useRuntime: false, useWasm: false });
      return { result, dna: ir.meta?.seal?.dna || null };
    }, irJson);

    expect(first.result.ok, `ceremony should pass; got ${JSON.stringify(first.result).slice(0, 400)}`).toBe(true);
    expect(typeof first.result.seal).toBe('string');
    expect(first.result.seal.length).toBe(64); // SHA-256 hex
    expect(first.result.stats.witnesses).toBe(1);

    // Determinism — same IR, same seedCount → same seal hex
    const second = await page.evaluate(async (irJson: string) => {
      const ir = JSON.parse(irJson);
      const w = window as any;
      const result = await w.MTLSeal.sealIR(ir, { seedCount: 200, useRuntime: false, useWasm: false });
      return result;
    }, irJson);
    expect(second.ok).toBe(true);
    expect(second.seal).toBe(first.result.seal);

    // Tamper — mutate paytable, seal should diverge
    const tampered = await page.evaluate(async (irJson: string) => {
      const ir = JSON.parse(irJson);
      const pt = ir.paytable || {};
      const firstSym = Object.keys(pt)[0];
      if (firstSym && pt[firstSym]) {
        // bump one paytable value by 1 — math drift
        const k = Object.keys(pt[firstSym])[0];
        pt[firstSym][k] = Number(pt[firstSym][k]) + 1;
      }
      const w = window as any;
      const result = await w.MTLSeal.sealIR(ir, { seedCount: 200, useRuntime: false, useWasm: false });
      return result;
    }, irJson);
    expect(tampered.ok).toBe(true);
    expect(tampered.seal).not.toBe(first.result.seal);

    console.log(`\n  MTL seal hex (Wrath):    ${first.result.seal}`);
    console.log(`  MTL seal hex (tampered): ${tampered.seal}`);
    console.log(`  DNA: ${first.result.dna}`);
    console.log(`  Burn-in: 200 seeds, ${first.result.stats.durationMs}ms (${first.result.stats.hashesPerSec} hashes/s)`);
  });

  test('isSealed() reflects ir.meta.seal state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !!(window as any).MTLSeal, { timeout: 10_000 });

    const irJson = readFileSync(DESKTOP_IR, 'utf8');

    const { unsealedBefore, sealedAfter, sealedAfterTamper } = await page.evaluate(async (irJson: string) => {
      const ir = JSON.parse(irJson);
      const w = window as any;
      const unsealedBefore = await w.MTLSeal.isSealed(ir);
      const result = await w.MTLSeal.sealIR(ir, { seedCount: 100, useRuntime: false, useWasm: false });
      w.MTLSeal.storeSeal(ir, result);
      const sealedAfter = await w.MTLSeal.isSealed(ir);
      // Tamper — should invalidate
      ir.paytable[Object.keys(ir.paytable)[0]]['3'] = 9999;
      const sealedAfterTamper = await w.MTLSeal.isSealed(ir);
      return { unsealedBefore, sealedAfter, sealedAfterTamper };
    }, irJson);

    expect(unsealedBefore).toBe(false);
    expect(sealedAfter).toBe(true);
    expect(sealedAfterTamper).toBe(false); // DNA changed → seal invalidated
  });
});
