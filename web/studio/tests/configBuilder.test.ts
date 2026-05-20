// W216 Faza 11.1 — Config Builder UI tests (25 specs).
//
// Pure-DOM coverage for `src/components/ConfigBuilder.ts`. Runs under
// the happy-dom environment (configured per-file via /** @vitest-environment **/).
//
//   * Mount lifecycle (idempotent, reversible)
//   * Field rendering (meta, topology, symbols, paytable)
//   * Change propagation via `onChange`
//   * Validation via zod (`onValidate`)
//   * Edit round-trip (mutate via UI → getValue → parseGameIR)
//   * Helpers: deepClone, esc (HTML injection guard)
//
// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SlotGameIR } from '@engine/ir/types.js';
import { parseGameIR } from '@engine/ir/index.js';
import { ConfigBuilder, deepClone, esc } from '../src/components/ConfigBuilder.js';

// happy-dom mangles import.meta.url; resolve relative to vitest's CWD
// (the `web/studio` package root) instead.
const FIXTURE_PATH = resolve(
  process.cwd(),
  'ir-library',
  'classics',
  'classic-5x3-20lines.ir.json',
);

function loadFixture(): SlotGameIR {
  const r = parseGameIR(JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')));
  if (!r.ok) throw new Error('fixture failed parseGameIR: ' + JSON.stringify(r.issues));
  return r.ir;
}

function setupDom() {
  document.body.innerHTML = '<div id="host"></div>';
  const host = document.getElementById('host') as HTMLElement;
  return { host };
}

describe('ConfigBuilder', () => {
  let host: HTMLElement;
  let ir: SlotGameIR;

  beforeEach(() => {
    ({ host } = setupDom());
    ir = loadFixture();
  });

  it('mount() injects exactly one cb-root into the host', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    expect(host.querySelectorAll('.cb-root').length).toBe(1);
  });

  it('mount() is idempotent — second call is a no-op', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    cb.mount();
    expect(host.querySelectorAll('.cb-root').length).toBe(1);
  });

  it('unmount() removes the cb-root', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    cb.unmount();
    expect(host.querySelectorAll('.cb-root').length).toBe(0);
  });

  it('unmount() before mount is a safe no-op', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    expect(() => cb.unmount()).not.toThrow();
  });

  it('renders 4 sections: meta, topology, symbols, paytable + actions', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const sections = host.querySelectorAll('section.cb-section');
    expect(sections.length).toBeGreaterThanOrEqual(5);
  });

  it('meta inputs reflect the initial IR values', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const idInput = host.querySelector('input[data-label="Game ID"]') as HTMLInputElement;
    expect(idInput.value).toBe(ir.meta.id);
    const nameInput = host.querySelector('input[data-label="Display Name"]') as HTMLInputElement;
    expect(nameInput.value).toBe(ir.meta.name);
  });

  it('editing the Game ID propagates to getValue()', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const idInput = host.querySelector('input[data-label="Game ID"]') as HTMLInputElement;
    idInput.value = 'edited-id';
    idInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cb.getValue().meta.id).toBe('edited-id');
  });

  it('onChange fires when a field is edited', () => {
    let count = 0;
    const cb = new ConfigBuilder({
      host,
      initial: ir,
      onChange: () => count++,
    });
    cb.mount();
    const nameInput = host.querySelector('input[data-label="Display Name"]') as HTMLInputElement;
    nameInput.value = 'New Name';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(count).toBe(1);
  });

  it('onChange handler receives a *cloned* IR (mutation by caller is safe)', () => {
    let received: SlotGameIR | null = null;
    const cb = new ConfigBuilder({
      host,
      initial: ir,
      onChange: (next) => { received = next; },
    });
    cb.mount();
    const nameInput = host.querySelector('input[data-label="Display Name"]') as HTMLInputElement;
    nameInput.value = 'X';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    // Mutating the received IR must not affect the builder's draft.
    expect(received).not.toBeNull();
    (received as SlotGameIR).meta.name = 'mutated-externally';
    expect(cb.getValue().meta.name).toBe('X');
  });

  it('reset() restores the initial IR', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const idInput = host.querySelector('input[data-label="Game ID"]') as HTMLInputElement;
    idInput.value = 'changed';
    idInput.dispatchEvent(new Event('input', { bubbles: true }));
    cb.reset();
    expect(cb.getValue().meta.id).toBe(ir.meta.id);
  });

  it('reset() also re-renders the DOM input', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const idInput = host.querySelector('input[data-label="Game ID"]') as HTMLInputElement;
    idInput.value = 'changed';
    idInput.dispatchEvent(new Event('input', { bubbles: true }));
    cb.reset();
    const after = host.querySelector('input[data-label="Game ID"]') as HTMLInputElement;
    expect(after.value).toBe(ir.meta.id);
  });

  it('setValue() replaces the draft and re-renders', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const replacement = deepClone(ir);
    replacement.meta.name = 'Wholly New';
    cb.setValue(replacement);
    expect(cb.getValue().meta.name).toBe('Wholly New');
    const after = host.querySelector('input[data-label="Display Name"]') as HTMLInputElement;
    expect(after.value).toBe('Wholly New');
  });

  it('validate() returns valid=true for an unedited valid IR', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    expect(cb.validate().valid).toBe(true);
  });

  it('validate() returns valid=false after the IR is broken', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const next = deepClone(ir) as unknown as { meta: { version: string } };
    next.meta.version = 'not-a-version';
    cb.setValue(next as SlotGameIR);
    const v = cb.validate();
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it('onValidate fires on explicit validate button click', () => {
    let received: { valid: boolean } | null = null;
    const cb = new ConfigBuilder({
      host,
      initial: ir,
      onValidate: (r) => { received = r; },
    });
    cb.mount();
    const btn = host.querySelector('button.cb-validate-btn') as HTMLButtonElement;
    btn.click();
    expect(received).not.toBeNull();
    expect((received as { valid: boolean }).valid).toBe(true);
  });

  it('validateLive=true emits one validation event per field change', () => {
    let count = 0;
    const cb = new ConfigBuilder({
      host,
      initial: ir,
      validateLive: true,
      onValidate: () => count++,
    });
    cb.mount();
    // One event from initial mount.
    expect(count).toBe(1);
    const nameInput = host.querySelector('input[data-label="Display Name"]') as HTMLInputElement;
    nameInput.value = 'X';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(count).toBe(2);
  });

  it('symbols list renders one row per symbol', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const rows = host.querySelectorAll('.cb-symbol-row');
    expect(rows.length).toBe(ir.symbols.length);
  });

  it('Add Symbol button appends a row and pushes a default symbol', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const before = ir.symbols.length;
    const btn = host.querySelector('button.cb-add-symbol') as HTMLButtonElement;
    btn.click();
    expect(cb.getValue().symbols.length).toBe(before + 1);
    expect(host.querySelectorAll('.cb-symbol-row').length).toBe(before + 1);
  });

  it('Remove Symbol button removes the row from the draft', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const removeBtns = host.querySelectorAll('button.cb-remove-symbol');
    const firstId = cb.getValue().symbols[0].id;
    (removeBtns[0] as HTMLButtonElement).click();
    expect(cb.getValue().symbols[0].id).not.toBe(firstId);
  });

  it('paytable cells are editable number inputs', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const inputs = host.querySelectorAll('table.cb-paytable input[type="number"]');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('paytable edit propagates to getValue()', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const firstSym = Object.keys(ir.paytable)[0];
    const firstCount = Object.keys(ir.paytable[firstSym])[0];
    const inputs = host.querySelectorAll('table.cb-paytable input[type="number"]') as NodeListOf<HTMLInputElement>;
    inputs[0].value = '42';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    expect(cb.getValue().paytable[firstSym][firstCount]).toBe(42);
  });

  it('paytable refuses negative values silently (no propagation)', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const firstSym = Object.keys(ir.paytable)[0];
    const firstCount = Object.keys(ir.paytable[firstSym])[0];
    const originalMult = ir.paytable[firstSym][firstCount];
    const inputs = host.querySelectorAll('table.cb-paytable input[type="number"]') as NodeListOf<HTMLInputElement>;
    inputs[0].value = '-5';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    expect(cb.getValue().paytable[firstSym][firstCount]).toBe(originalMult);
  });

  it('round-trip: get → parseGameIR → ok on an unedited mount', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const r = parseGameIR(cb.getValue());
    expect(r.ok).toBe(true);
  });

  it('round-trip survives a complete benign edit', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const nameInput = host.querySelector('input[data-label="Display Name"]') as HTMLInputElement;
    nameInput.value = 'Renamed Title';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    const r = parseGameIR(cb.getValue());
    expect(r.ok).toBe(true);
  });

  it('theme tags are split on comma and trimmed', () => {
    const cb = new ConfigBuilder({ host, initial: ir });
    cb.mount();
    const tagsInput = host.querySelector('input[data-label="Theme Tags (comma)"]') as HTMLInputElement;
    tagsInput.value = ' a , b ,c, ';
    tagsInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cb.getValue().meta.theme_tags).toEqual(['a', 'b', 'c']);
  });

  it('label overrides are applied to section headers', () => {
    const cb = new ConfigBuilder({
      host,
      initial: ir,
      labels: { meta: 'OVERRIDE_META' } as Partial<{ meta: string }> as never,
    });
    cb.mount();
    const headers = Array.from(host.querySelectorAll('section.cb-section h3')).map((h) =>
      h.textContent ?? '',
    );
    expect(headers).toContain('OVERRIDE_META');
  });

  it('esc() escapes the four HTML metacharacters', () => {
    expect(esc('<a href="b">&</a>')).toBe('&lt;a href=&quot;b&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('deepClone() returns an independent object', () => {
    const a = { x: 1, y: [1, 2] };
    const b = deepClone(a);
    b.x = 99;
    b.y.push(3);
    expect(a.x).toBe(1);
    expect(a.y).toEqual([1, 2]);
  });

  it('the IR fixture round-trips JSON → parseGameIR (sanity)', () => {
    const r = parseGameIR(loadFixture());
    expect(r.ok).toBe(true);
  });
});
