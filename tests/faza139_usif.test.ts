/**
 * Faza 13.9 — USIF v1.0 JSON Schema tests (USIF-01..20).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  getUSIFSchema,
  validateUSIF,
  isUSIFCompatible,
} from '../src/usif/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFixture(name: string): unknown {
  const p = join(__dirname, 'fixtures', 'reference', name);
  return JSON.parse(readFileSync(p, 'utf8'));
}

const validIR = loadFixture('classic-3x3-lines.json');

// ─── Schema object tests ───────────────────────────────────────────────

describe('USIF-01: getUSIFSchema has $id, title, version', () => {
  it('schema has $id', () => {
    const schema = getUSIFSchema();
    expect(schema.$id).toBe('https://usif.slotmath.io/v1/schema.json');
  });
  it('schema has title', () => {
    const schema = getUSIFSchema();
    expect(schema.title).toMatch(/Universal Slot Interchange Format/);
  });
  it('schema has version', () => {
    const schema = getUSIFSchema();
    expect(schema.version).toBe('1.0.0');
  });
});

describe('USIF-02: schema has required array', () => {
  it('required is an array', () => {
    const schema = getUSIFSchema();
    expect(Array.isArray(schema.required)).toBe(true);
  });
});

describe('USIF-03: required array has 9 fields', () => {
  it('required has exactly 9 elements', () => {
    const schema = getUSIFSchema();
    expect(schema.required).toHaveLength(9);
  });
});

// ─── validateUSIF ──────────────────────────────────────────────────────

describe('USIF-04: validateUSIF({}) → valid=false with missing field errors', () => {
  it('returns valid=false', () => {
    const result = validateUSIF({});
    expect(result.valid).toBe(false);
  });
  it('has errors for missing required fields', () => {
    const result = validateUSIF({});
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('USIF-05: validateUSIF(validIR) → valid=true', () => {
  it('returns valid=true for classic-3x3-lines fixture', () => {
    const result = validateUSIF(validIR);
    expect(result.valid).toBe(true);
  });
  it('has no errors', () => {
    const result = validateUSIF(validIR);
    expect(result.errors).toHaveLength(0);
  });
});

describe('USIF-06: missing schema_version → error', () => {
  it('reports error for missing schema_version', () => {
    const ir = { ...(validIR as Record<string, unknown>) };
    delete ir['schema_version'];
    const result = validateUSIF(ir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('schema_version'))).toBe(true);
  });
});

describe('USIF-07: bad semver "1.0" → error', () => {
  it('reports error for non-semver schema_version', () => {
    const ir = { ...(validIR as Record<string, unknown>), schema_version: '1.0' };
    const result = validateUSIF(ir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('schema_version'))).toBe(true);
  });
});

describe('USIF-08: empty symbols → error', () => {
  it('reports error when symbols is empty array', () => {
    const ir = { ...(validIR as Record<string, unknown>), symbols: [] };
    const result = validateUSIF(ir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('symbols'))).toBe(true);
  });
});

describe('USIF-09: invalid win_evaluator.mode → error', () => {
  it('reports error for invalid win_evaluator.mode', () => {
    const ir = {
      ...(validIR as Record<string, unknown>),
      win_evaluator: { mode: 'invalid_mode' },
    };
    const result = validateUSIF(ir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('win_evaluator'))).toBe(true);
  });
});

describe('USIF-10: negative bet values → error', () => {
  it('reports error for negative base_bet', () => {
    const origBet = (validIR as Record<string, unknown>)['bet'] as Record<string, unknown>;
    const ir = {
      ...(validIR as Record<string, unknown>),
      bet: { ...origBet, base_bet: -1 },
    };
    const result = validateUSIF(ir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('bet'))).toBe(true);
  });
});

describe('USIF-11: validateUSIF(null) → valid=false', () => {
  it('returns valid=false for null', () => {
    const result = validateUSIF(null);
    expect(result.valid).toBe(false);
  });
});

describe('USIF-12: validateUSIF(42) → valid=false', () => {
  it('returns valid=false for number', () => {
    const result = validateUSIF(42);
    expect(result.valid).toBe(false);
  });
});

// ─── isUSIFCompatible ──────────────────────────────────────────────────

describe('USIF-13: isUSIFCompatible(validIR) → true', () => {
  it('returns true for classic-3x3-lines fixture', () => {
    expect(isUSIFCompatible(validIR)).toBe(true);
  });
});

describe('USIF-14: isUSIFCompatible({}) → false', () => {
  it('returns false for empty object', () => {
    expect(isUSIFCompatible({})).toBe(false);
  });
});

// ─── Result shape ──────────────────────────────────────────────────────

describe('USIF-15: result has valid, errors, schemaVersion', () => {
  it('result object has all required fields', () => {
    const result = validateUSIF(validIR);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('schemaVersion');
  });
});

describe('USIF-16: errors have path (starts with $) and message', () => {
  it('error objects have path starting with $ and message', () => {
    const result = validateUSIF({});
    expect(result.errors.length).toBeGreaterThan(0);
    for (const e of result.errors) {
      expect(e.path).toMatch(/^\$/);
      expect(typeof e.message).toBe('string');
    }
  });
});

// ─── Feature / Compliance IR tests ────────────────────────────────────

describe('USIF-17: IR with features → valid=true', () => {
  it('validates a fixture with features', () => {
    const result = validateUSIF(validIR);
    expect(result.valid).toBe(true);
  });
});

describe('USIF-18: IR with compliance → valid=true', () => {
  it('validates a fixture with compliance field', () => {
    const ir = validIR as Record<string, unknown>;
    expect('compliance' in ir).toBe(true);
    const result = validateUSIF(ir);
    expect(result.valid).toBe(true);
  });
});

// ─── Schema definitions enum sizes ────────────────────────────────────

describe('USIF-19: SymbolBehavior enum in schema has >=10 entries', () => {
  it('SymbolBehavior kind enum has at least 10 entries', () => {
    const schema = getUSIFSchema();
    const sb = schema.definitions.SymbolBehavior as { properties: { kind: { enum: string[] } } };
    expect(sb.properties.kind.enum.length).toBeGreaterThanOrEqual(10);
  });
});

describe('USIF-20: WinEvaluator mode enum has 6 entries', () => {
  it('WinEvaluator mode enum has exactly 6 entries', () => {
    const schema = getUSIFSchema();
    const we = schema.definitions.WinEvaluator as { properties: { mode: { enum: string[] } } };
    expect(we.properties.mode.enum).toHaveLength(6);
  });
});
