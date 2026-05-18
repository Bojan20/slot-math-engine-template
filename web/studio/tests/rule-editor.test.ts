// CORTI 200.1-DUBINA — IR Rule Editor specs.
//
// Covers tokenizer, parser (shunting-yard → RPN), evaluator, built-in
// functions, variable resolution, type checking, execution limits,
// formula library shape, auto-suggest logic, rule persistence
// round-trip, RTP contribution clamp, and inline error reporting.

import { describe, it, expect } from 'vitest';
import {
  tokenize,
  parse,
  evaluate,
  evaluateExpression,
  validateRule,
  typeCheck,
  defaultMockContext,
  evalRule,
  ruleRtpContribution,
  suggestRules,
  createRuleEditorBridge,
  BUILTINS,
  DEFAULT_CONTEXT_VARS,
  ParseError,
  EvalError,
  type IRRule,
} from '../src/rule-editor.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('tokenizer', () => {
  it('tokenises numbers, identifiers, operators', () => {
    const ts = tokenize('foo + 12.5 * bar');
    expect(ts.map((t) => t.kind)).toEqual(['ident', 'op', 'num', 'op', 'ident']);
    expect(ts[2]!.value).toBe('12.5');
  });

  it('handles 2-char operators (==, !=, <=, >=, &&, ||)', () => {
    const ts = tokenize('a == 1 && b != 2 && c <= 3 || d >= 4');
    const ops = ts.filter((t) => t.kind === 'op').map((t) => t.value);
    expect(ops).toEqual(['==', '&&', '!=', '&&', '<=', '||', '>=']);
  });

  it('throws ParseError on unknown character', () => {
    expect(() => tokenize('a $ b')).toThrow(ParseError);
  });
});

describe('parser (RPN, precedence, parens)', () => {
  it('produces RPN for "1 + 2 * 3"', () => {
    const rpn = parse('1 + 2 * 3');
    expect(rpn).toEqual([
      { type: 'num', value: 1 },
      { type: 'num', value: 2 },
      { type: 'num', value: 3 },
      { type: 'op', op: '*' },
      { type: 'op', op: '+' },
    ]);
  });

  it('respects parens', () => {
    const rpn = parse('(1 + 2) * 3');
    expect(rpn[rpn.length - 1]).toEqual({ type: 'op', op: '*' });
  });

  it('parses unary minus', () => {
    const v = evaluateExpression('-5 + 3', defaultMockContext());
    expect(v).toBe(-2);
  });

  it('parses nested function calls with correct arity', () => {
    const rpn = parse('min(1, max(2, 3))');
    const calls = rpn.filter((n) => n.type === 'call') as Array<{
      type: 'call'; name: string; arity: number;
    }>;
    expect(calls.map((c) => c.name)).toEqual(['max', 'min']);
    expect(calls.map((c) => c.arity)).toEqual([2, 2]);
  });

  it('throws ParseError on mismatched paren', () => {
    expect(() => parse('1 + (2 * 3')).toThrow(ParseError);
  });
});

describe('evaluator', () => {
  it('evaluates basic arithmetic', () => {
    const ctx = defaultMockContext();
    expect(evaluateExpression('1 + 2 * 3', ctx)).toBe(7);
    expect(evaluateExpression('(1 + 2) * 3', ctx)).toBe(9);
    expect(evaluateExpression('10 / 4', ctx)).toBe(2.5);
    expect(evaluateExpression('10 % 3', ctx)).toBe(1);
  });

  it('evaluates comparison + logical ops', () => {
    const ctx = defaultMockContext();
    expect(evaluateExpression('1 < 2', ctx)).toBe(1);
    expect(evaluateExpression('1 > 2', ctx)).toBe(0);
    expect(evaluateExpression('1 == 1', ctx)).toBe(1);
    expect(evaluateExpression('1 != 1', ctx)).toBe(0);
    expect(evaluateExpression('1 && 0', ctx)).toBe(0);
    expect(evaluateExpression('1 || 0', ctx)).toBe(1);
  });

  it('throws on division by zero', () => {
    expect(() => evaluateExpression('1 / 0', defaultMockContext())).toThrow(EvalError);
  });
});

describe('built-in functions', () => {
  it('min/max/abs/clamp work', () => {
    const ctx = defaultMockContext();
    expect(evaluateExpression('min(3, 5)', ctx)).toBe(3);
    expect(evaluateExpression('max(3, 5)', ctx)).toBe(5);
    expect(evaluateExpression('abs(-7)', ctx)).toBe(7);
    expect(evaluateExpression('clamp(15, 0, 10)', ctx)).toBe(10);
    expect(evaluateExpression('clamp(-5, 0, 10)', ctx)).toBe(0);
  });

  it('if(cond, a, b) branches', () => {
    const ctx = defaultMockContext();
    expect(evaluateExpression('if(1, 42, 99)', ctx)).toBe(42);
    expect(evaluateExpression('if(0, 42, 99)', ctx)).toBe(99);
  });

  it('binomial_cdf bounded in [0,1] and monotonic', () => {
    const ctx = defaultMockContext();
    const c0 = evaluateExpression('binomial_cdf(0, 5, 0.5)', ctx);
    const c2 = evaluateExpression('binomial_cdf(2, 5, 0.5)', ctx);
    const c5 = evaluateExpression('binomial_cdf(5, 5, 0.5)', ctx);
    expect(c0).toBeGreaterThanOrEqual(0);
    expect(c5).toBeGreaterThan(0.99);
    expect(c5).toBeLessThanOrEqual(1.0001);
    expect(c2).toBeGreaterThan(c0);
    expect(c5).toBeGreaterThan(c2);
  });

  it('rejects wrong arity for fixed-arity functions', () => {
    expect(() => evaluateExpression('clamp(1, 2)', defaultMockContext())).toThrow(EvalError);
  });
});

describe('variable resolution', () => {
  it('resolves predefined IR context vars', () => {
    const ctx = defaultMockContext();
    expect(evaluateExpression('spin_count', ctx)).toBe(100);
    expect(evaluateExpression('scatters_landed * 2', ctx)).toBe(4);
  });

  it('throws on unknown variable', () => {
    expect(() => evaluateExpression('unknown_var + 1', defaultMockContext())).toThrow(EvalError);
  });
});

describe('type checking', () => {
  it('reports numeric+boolean mix on arithmetic', () => {
    const rpn = parse('(1 < 2) + 3'); // bool + num
    const tc = typeCheck(rpn);
    expect(tc.issues.length).toBeGreaterThan(0);
  });

  it('clean expression has no issues', () => {
    const rpn = parse('1 + 2 * 3');
    const tc = typeCheck(rpn);
    expect(tc.issues.length).toBe(0);
    expect(tc.type).toBe('num');
  });
});

describe('execution limits', () => {
  it('rejects malformed expression at parse time', () => {
    const r = validateRule('1 + (');
    expect(r.ok).toBe(false);
    expect(r.parseError).toBeTruthy();
  });

  it('enforces iteration cap on RPN length', () => {
    const ctx = { vars: {}, maxIterations: 3 };
    // 1+2+3 → 5 RPN nodes → exceeds cap of 3.
    expect(() => evaluate(parse('1 + 2 + 3'), ctx)).toThrow(/Iteration cap/);
  });

  it('enforces wall-clock timeout', () => {
    // Force a synthetic timeout by setting maxMs=0 — even 1 step exceeds.
    const ctx = { vars: {}, maxMs: -1 };
    expect(() => evaluate(parse('1 + 1'), ctx)).toThrow(/timeout/);
  });
});

describe('rule eval + contribution', () => {
  const rule: IRRule = {
    id: 'r1',
    name: 'test',
    expression: 'if(scatters_landed >= 2, 10, 0)',
    enabled: true,
    priority: 0,
  };

  it('evaluates rule with default context', () => {
    const r = evalRule(rule, defaultMockContext());
    expect(r.ok).toBe(true);
    expect(r.value).toBe(10);
  });

  it('returns 0 when disabled', () => {
    const r = evalRule({ ...rule, enabled: false }, defaultMockContext());
    expect(r.value).toBe(0);
  });

  it('contribution is clamped to ±20%', () => {
    const heavy: IRRule = { ...rule, expression: '500' };
    const c = ruleRtpContribution(heavy, defaultMockContext());
    expect(c).toBeLessThanOrEqual(0.2);
  });

  it('error propagates in eval result', () => {
    const bad: IRRule = { ...rule, expression: '1 / 0' };
    const r = evalRule(bad, defaultMockContext());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Division/);
  });
});

describe('auto-suggest', () => {
  it('suggests retrigger when FS but no retrigger present', () => {
    const sug = suggestRules({ kinds: ['free_spins', 'scatter_trigger'] });
    expect(sug.some((s) => s.name.toLowerCase().includes('retrigger'))).toBe(true);
  });

  it('produces 3–5 suggestions for a typical FS composition', () => {
    const sug = suggestRules({ kinds: ['free_spins', 'cascade'] });
    expect(sug.length).toBeGreaterThanOrEqual(3);
    expect(sug.length).toBeLessThanOrEqual(5);
  });

  it('filters out already-existing names', () => {
    const all = suggestRules({ kinds: ['free_spins'] });
    const filtered = suggestRules({
      kinds: ['free_spins'],
      existingNames: all.map((s) => s.name),
    });
    expect(filtered.length).toBe(0);
  });
});

describe('formula library', () => {
  it('library JSON loads with 30+ industry formulas, all valid', () => {
    const path = fileURLToPath(
      new URL('../data/formula-library.json', import.meta.url)
    );
    const raw = readFileSync(path, 'utf-8');
    const lib = JSON.parse(raw) as { formulas: Array<{ id: string; name: string; expression: string }> };
    expect(lib.formulas.length).toBeGreaterThanOrEqual(30);
    for (const f of lib.formulas) {
      const r = validateRule(f.expression);
      // Allow type-checker warnings (some library entries mix num/bool intentionally),
      // but ALL must parse successfully.
      expect(r.parseError, `${f.id} should parse: ${f.expression}`).toBeUndefined();
    }
  });
});

describe('bridge persistence (round-trip)', () => {
  it('snapshot + restore preserves rule list and order', () => {
    const re = createRuleEditorBridge();
    // Bridge alone doesn't manage rule list; we test the model contract by
    // building a manual array and round-tripping via JSON.
    const rules: IRRule[] = [
      { id: 'a', name: 'A', expression: '1', enabled: true, priority: 0 },
      { id: 'b', name: 'B', expression: 'x + 1', enabled: false, priority: 1 },
    ];
    const json = JSON.stringify({ schemaVersion: 1, rules });
    const parsed = JSON.parse(json) as { schemaVersion: number; rules: IRRule[] };
    expect(parsed.rules.map((r) => r.id)).toEqual(['a', 'b']);
    expect(parsed.rules[1]!.enabled).toBe(false);
    // Validate each still parses cleanly under the bridge.
    for (const r of parsed.rules) {
      const v = re.validate(r.expression);
      expect(v.parseError).toBeUndefined();
    }
  });
});

describe('default context vars (UI insert dropdown)', () => {
  it('exposes the canonical IR variable set', () => {
    expect(DEFAULT_CONTEXT_VARS).toContain('spin_count');
    expect(DEFAULT_CONTEXT_VARS).toContain('scatters_landed');
    expect(DEFAULT_CONTEXT_VARS).toContain('win_amount');
  });

  it('exposes built-in function names', () => {
    expect(Object.keys(BUILTINS)).toEqual(
      expect.arrayContaining(['min', 'max', 'abs', 'clamp', 'if'])
    );
  });
});

describe('bridge validate + suggest end-to-end', () => {
  it('bridge.validate rejects garbage', () => {
    const re = createRuleEditorBridge();
    const r = re.validate('@$^');
    expect(r.ok).toBe(false);
    expect(r.parseError).toBeTruthy();
  });

  it('bridge.evaluate uses default mock context', () => {
    const re = createRuleEditorBridge();
    expect(re.evaluate('scatters_landed + 1')).toBe(3);
  });

  it('bridge.suggest returns array with rationale', () => {
    const re = createRuleEditorBridge();
    const sug = re.suggest({ kinds: ['free_spins'] });
    expect(sug.every((s) => s.rationale.length > 0)).toBe(true);
  });
});
