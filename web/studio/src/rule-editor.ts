// CORTI 200.1-DUBINA — IR Rule Editor (tokenizer + parser + evaluator).
//
// Safe expression evaluator with NO use of `eval()` or `Function()`. Used by
// the COMPOSE-tab "Custom Rule Editor" so designers can write small numeric/
// boolean expressions against an IR context (spin_count, scatters_landed,
// win_amount, …) which feed back into the closed-form composed-RTP path.
//
// Pipeline: source → tokenizer → shunting-yard parser → RPN tokens →
// stack-based evaluator. Includes a small standard library (min, max, abs,
// clamp, if, floor, ceil, round, exp, log, sqrt, pow, normal_pdf,
// binomial_cdf) plus a per-call iteration cap (10 000) so a runaway
// expression cannot DoS the studio tab.

// ── Token model ────────────────────────────────────────────────────

export type TokenKind =
  | 'num'
  | 'ident'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma';

export interface Token {
  kind: TokenKind;
  value: string;
  pos: number;
}

const OPS = ['==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!'];

function isDigit(ch: string): boolean { return ch >= '0' && ch <= '9'; }
function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}
function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    if (ch === '(') { out.push({ kind: 'lparen', value: '(', pos: i }); i++; continue; }
    if (ch === ')') { out.push({ kind: 'rparen', value: ')', pos: i }); i++; continue; }
    if (ch === ',') { out.push({ kind: 'comma', value: ',', pos: i }); i++; continue; }
    // 2-char operators first
    const two = src.slice(i, i + 2);
    if (OPS.includes(two)) {
      out.push({ kind: 'op', value: two, pos: i });
      i += 2;
      continue;
    }
    if (OPS.includes(ch)) {
      out.push({ kind: 'op', value: ch, pos: i });
      i++;
      continue;
    }
    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i;
      let sawDot = false;
      while (j < src.length) {
        const c = src[j]!;
        if (isDigit(c)) { j++; continue; }
        if (c === '.' && !sawDot) { sawDot = true; j++; continue; }
        break;
      }
      out.push({ kind: 'num', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < src.length && isIdentPart(src[j]!)) j++;
      out.push({ kind: 'ident', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    throw new ParseError(`Unexpected character "${ch}" at ${i}`, i);
  }
  return out;
}

// ── Errors ─────────────────────────────────────────────────────────

export class ParseError extends Error {
  pos: number;
  constructor(msg: string, pos: number) {
    super(msg);
    this.pos = pos;
    this.name = 'ParseError';
  }
}
export class EvalError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'EvalError';
  }
}

// ── Operator table ─────────────────────────────────────────────────

interface OpMeta {
  prec: number;
  assoc: 'left' | 'right';
  arity: 1 | 2;
}

// Unary minus is internally renamed to 'u-'; same for unary '!'.
const OP_TABLE: Record<string, OpMeta> = {
  '||': { prec: 1, assoc: 'left', arity: 2 },
  '&&': { prec: 2, assoc: 'left', arity: 2 },
  '==': { prec: 3, assoc: 'left', arity: 2 },
  '!=': { prec: 3, assoc: 'left', arity: 2 },
  '<':  { prec: 4, assoc: 'left', arity: 2 },
  '>':  { prec: 4, assoc: 'left', arity: 2 },
  '<=': { prec: 4, assoc: 'left', arity: 2 },
  '>=': { prec: 4, assoc: 'left', arity: 2 },
  '+':  { prec: 5, assoc: 'left', arity: 2 },
  '-':  { prec: 5, assoc: 'left', arity: 2 },
  '*':  { prec: 6, assoc: 'left', arity: 2 },
  '/':  { prec: 6, assoc: 'left', arity: 2 },
  '%':  { prec: 6, assoc: 'left', arity: 2 },
  'u-': { prec: 8, assoc: 'right', arity: 1 },
  'u!': { prec: 8, assoc: 'right', arity: 1 },
};

// ── RPN parser (shunting-yard) ─────────────────────────────────────

export type RpnNode =
  | { type: 'num'; value: number }
  | { type: 'ident'; name: string }
  | { type: 'op'; op: string }
  | { type: 'call'; name: string; arity: number };

export function parse(src: string): RpnNode[] {
  const tokens = tokenize(src);
  const out: RpnNode[] = [];

  // Frame represents a `(` context. `isCall` true when paired with a
  // function name on the stack. `commaCount` is the number of commas seen
  // in this frame (each comma separates two args). `hasContent` flips true
  // the moment we see the first operand-producing token. Final arity for a
  // call is computed at the matching rparen: arity = commaCount + (hasContent ? 1 : 0).
  interface Frame {
    kind: 'paren' | 'call';
    fnName?: string;
    commaCount: number;
    hasContent: boolean;
  }
  type Entry = { type: 'op'; op: string } | { type: 'frame'; frame: Frame };

  const stack: Entry[] = [];
  // expectOperand: true at start / after operator / after lparen / after comma.
  let expectOperand = true;

  function curFrame(): Frame | null {
    for (let i = stack.length - 1; i >= 0; i--) {
      const e = stack[i]!;
      if (e.type === 'frame') return e.frame;
    }
    return null;
  }
  function emit(node: RpnNode): void {
    out.push(node);
    const f = curFrame();
    if (f) f.hasContent = true;
  }

  for (let ti = 0; ti < tokens.length; ti++) {
    const t = tokens[ti]!;
    if (t.kind === 'num') {
      emit({ type: 'num', value: Number(t.value) });
      expectOperand = false;
      continue;
    }
    if (t.kind === 'ident') {
      const next = tokens[ti + 1];
      if (next && next.kind === 'lparen') {
        // function call — push a call frame; consume the lparen too.
        stack.push({ type: 'frame', frame: { kind: 'call', fnName: t.value, commaCount: 0, hasContent: false } });
        ti++; // skip lparen
        expectOperand = true;
        continue;
      }
      emit({ type: 'ident', name: t.value });
      expectOperand = false;
      continue;
    }
    if (t.kind === 'op') {
      let opStr = t.value;
      if (expectOperand) {
        if (opStr === '-') opStr = 'u-';
        else if (opStr === '!') opStr = 'u!';
        else if (opStr === '+') { /* unary plus — no-op */ continue; }
        else throw new ParseError(`Operator "${opStr}" cannot start an expression`, t.pos);
      }
      const cur = OP_TABLE[opStr];
      if (!cur) throw new ParseError(`Unknown operator "${opStr}"`, t.pos);
      while (stack.length) {
        const top = stack[stack.length - 1]!;
        if (top.type !== 'op') break;
        const topMeta = OP_TABLE[top.op]!;
        const shouldPop =
          topMeta.prec > cur.prec ||
          (topMeta.prec === cur.prec && cur.assoc === 'left');
        if (!shouldPop) break;
        stack.pop();
        out.push({ type: 'op', op: top.op });
      }
      stack.push({ type: 'op', op: opStr });
      expectOperand = true;
      continue;
    }
    if (t.kind === 'lparen') {
      stack.push({ type: 'frame', frame: { kind: 'paren', commaCount: 0, hasContent: false } });
      expectOperand = true;
      continue;
    }
    if (t.kind === 'comma') {
      // Drain operators down to the current frame.
      while (stack.length) {
        const top = stack[stack.length - 1]!;
        if (top.type === 'frame') break;
        stack.pop();
        out.push({ type: 'op', op: top.op });
      }
      const top = stack[stack.length - 1];
      if (!top || top.type !== 'frame' || top.frame.kind !== 'call') {
        throw new ParseError('Comma outside function call', t.pos);
      }
      top.frame.commaCount++;
      expectOperand = true;
      continue;
    }
    if (t.kind === 'rparen') {
      while (stack.length) {
        const top = stack[stack.length - 1]!;
        if (top.type === 'frame') break;
        stack.pop();
        out.push({ type: 'op', op: top.op });
      }
      const top = stack[stack.length - 1];
      if (!top || top.type !== 'frame') throw new ParseError('Mismatched ")"', t.pos);
      stack.pop(); // pop frame
      if (top.frame.kind === 'call') {
        const arity = top.frame.commaCount + (top.frame.hasContent ? 1 : 0);
        emit({ type: 'call', name: top.frame.fnName!, arity });
      } else {
        // plain paren — its content has already been emitted in-place.
        // If we had content, propagate hasContent up to outer frame.
        if (top.frame.hasContent) {
          const outer = curFrame();
          if (outer) outer.hasContent = true;
        }
      }
      expectOperand = false;
      continue;
    }
  }
  while (stack.length) {
    const top = stack.pop()!;
    if (top.type === 'frame') throw new ParseError('Mismatched "("', 0);
    out.push({ type: 'op', op: top.op });
  }
  return out;
}

// ── Built-in functions ─────────────────────────────────────────────

export interface BuiltinSpec {
  arity: number | 'variadic';
  fn: (args: number[]) => number;
}

function normalPdf(x: number, mu = 0, sigma = 1): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

// Simple binomial CDF — direct sum of pmf for small n. O(n) so we cap n.
function binomialCdf(k: number, n: number, p: number): number {
  if (n < 0 || n > 10000) throw new EvalError('binomial_cdf: n out of range');
  if (k < 0) return 0;
  if (k >= n) return 1;
  // Compute via log to avoid overflow.
  let logFact: number[] = [0];
  for (let i = 1; i <= n; i++) logFact.push(logFact[i - 1]! + Math.log(i));
  let sum = 0;
  const lp = Math.log(p);
  const l1p = Math.log(1 - p);
  for (let i = 0; i <= Math.floor(k); i++) {
    const logC = logFact[n]! - logFact[i]! - logFact[n - i]!;
    sum += Math.exp(logC + i * lp + (n - i) * l1p);
  }
  return Math.min(1, Math.max(0, sum));
}

export const BUILTINS: Record<string, BuiltinSpec> = {
  min: { arity: 'variadic', fn: (a) => {
    if (a.length === 0) throw new EvalError('min: at least 1 arg required');
    return Math.min(...a);
  }},
  max: { arity: 'variadic', fn: (a) => {
    if (a.length === 0) throw new EvalError('max: at least 1 arg required');
    return Math.max(...a);
  }},
  abs:   { arity: 1, fn: (a) => Math.abs(a[0]!) },
  floor: { arity: 1, fn: (a) => Math.floor(a[0]!) },
  ceil:  { arity: 1, fn: (a) => Math.ceil(a[0]!) },
  round: { arity: 1, fn: (a) => Math.round(a[0]!) },
  sqrt:  { arity: 1, fn: (a) => Math.sqrt(a[0]!) },
  exp:   { arity: 1, fn: (a) => Math.exp(a[0]!) },
  log:   { arity: 1, fn: (a) => Math.log(a[0]!) },
  pow:   { arity: 2, fn: (a) => Math.pow(a[0]!, a[1]!) },
  sin:   { arity: 1, fn: (a) => Math.sin(a[0]!) },
  cos:   { arity: 1, fn: (a) => Math.cos(a[0]!) },
  tan:   { arity: 1, fn: (a) => Math.tan(a[0]!) },
  clamp: { arity: 3, fn: (a) => Math.min(Math.max(a[0]!, a[1]!), a[2]!) },
  if:    { arity: 3, fn: (a) => (a[0]! ? a[1]! : a[2]!) },
  normal_pdf:    { arity: 'variadic', fn: (a) => normalPdf(a[0] ?? 0, a[1] ?? 0, a[2] ?? 1) },
  binomial_cdf:  { arity: 3, fn: (a) => binomialCdf(a[0]!, a[1]!, a[2]!) },
};

// ── Evaluator ──────────────────────────────────────────────────────

export interface EvalContext {
  vars: Record<string, number>;
  /** Optional cap on stack-step iterations (default 10 000). */
  maxIterations?: number;
  /** Optional millisecond timeout (default 100ms). */
  maxMs?: number;
}

export function evaluate(rpn: RpnNode[], ctx: EvalContext): number {
  const stack: number[] = [];
  const maxIter = ctx.maxIterations ?? 10000;
  const maxMs = ctx.maxMs ?? 100;
  const start = Date.now();
  let iter = 0;

  for (const n of rpn) {
    iter++;
    if (iter > maxIter) throw new EvalError(`Iteration cap (${maxIter}) exceeded`);
    if (Date.now() - start > maxMs) throw new EvalError(`Execution timeout (${maxMs}ms)`);
    if (n.type === 'num') {
      stack.push(n.value);
    } else if (n.type === 'ident') {
      const v = ctx.vars[n.name];
      if (v === undefined) throw new EvalError(`Unknown variable "${n.name}"`);
      stack.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
    } else if (n.type === 'op') {
      if (OP_TABLE[n.op]?.arity === 1) {
        const a = stack.pop();
        if (a === undefined) throw new EvalError(`Stack underflow at op ${n.op}`);
        if (n.op === 'u-') stack.push(-a);
        else if (n.op === 'u!') stack.push(a ? 0 : 1);
        else throw new EvalError(`Unknown unary op ${n.op}`);
      } else {
        const b = stack.pop();
        const a = stack.pop();
        if (a === undefined || b === undefined) throw new EvalError(`Stack underflow at op ${n.op}`);
        switch (n.op) {
          case '+':  stack.push(a + b); break;
          case '-':  stack.push(a - b); break;
          case '*':  stack.push(a * b); break;
          case '/':
            if (b === 0) throw new EvalError('Division by zero');
            stack.push(a / b); break;
          case '%':
            if (b === 0) throw new EvalError('Modulo by zero');
            stack.push(a % b); break;
          case '==': stack.push(a === b ? 1 : 0); break;
          case '!=': stack.push(a !== b ? 1 : 0); break;
          case '<':  stack.push(a < b ? 1 : 0); break;
          case '>':  stack.push(a > b ? 1 : 0); break;
          case '<=': stack.push(a <= b ? 1 : 0); break;
          case '>=': stack.push(a >= b ? 1 : 0); break;
          case '&&': stack.push(a && b ? 1 : 0); break;
          case '||': stack.push(a || b ? 1 : 0); break;
          default: throw new EvalError(`Unknown binary op ${n.op}`);
        }
      }
    } else if (n.type === 'call') {
      const spec = BUILTINS[n.name];
      if (!spec) throw new EvalError(`Unknown function "${n.name}"`);
      if (spec.arity !== 'variadic' && spec.arity !== n.arity) {
        throw new EvalError(`Function "${n.name}" expects ${spec.arity} arg(s), got ${n.arity}`);
      }
      if (stack.length < n.arity) throw new EvalError(`Stack underflow in call ${n.name}`);
      const args: number[] = [];
      for (let i = 0; i < n.arity; i++) args.unshift(stack.pop()!);
      stack.push(spec.fn(args));
    }
  }
  if (stack.length !== 1) throw new EvalError(`Expected 1 result, got ${stack.length}`);
  return stack[0]!;
}

export function evaluateExpression(src: string, ctx: EvalContext): number {
  const rpn = parse(src);
  return evaluate(rpn, ctx);
}

// ── Rule model ─────────────────────────────────────────────────────

export interface IRRule {
  id: string;
  name: string;
  expression: string;
  enabled: boolean;
  priority: number;
}

export interface RuleEvalResult {
  ok: boolean;
  value?: number;
  error?: string;
}

export function evalRule(rule: IRRule, ctx: EvalContext): RuleEvalResult {
  if (!rule.enabled) return { ok: true, value: 0 };
  try {
    const v = evaluateExpression(rule.expression, ctx);
    return { ok: true, value: v };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Type checking (lightweight) ────────────────────────────────────
// Walks the RPN once and infers per-stack-slot type. Catches mixing
// numeric + boolean inappropriately, like `5 && 10` (still legal in JS
// truthy sense but we want to surface a warning).

export type StaticType = 'num' | 'bool' | 'unknown';

export interface TypeCheckIssue {
  message: string;
}
export interface TypeCheckResult {
  ok: boolean;
  type: StaticType;
  issues: TypeCheckIssue[];
}

const BOOL_OPS = new Set(['==', '!=', '<', '>', '<=', '>=', '&&', '||', 'u!']);
const NUM_OPS = new Set(['+', '-', '*', '/', '%', 'u-']);

export function typeCheck(rpn: RpnNode[]): TypeCheckResult {
  const issues: TypeCheckIssue[] = [];
  const stack: StaticType[] = [];
  for (const n of rpn) {
    if (n.type === 'num') stack.push('num');
    else if (n.type === 'ident') stack.push('unknown');
    else if (n.type === 'op') {
      const meta = OP_TABLE[n.op];
      if (!meta) { issues.push({ message: `unknown op ${n.op}` }); continue; }
      if (meta.arity === 1) {
        const a = stack.pop() ?? 'unknown';
        if (BOOL_OPS.has(n.op)) {
          if (a === 'num') issues.push({ message: `unary "!" applied to numeric value` });
          stack.push('bool');
        } else {
          if (a === 'bool') issues.push({ message: `unary "-" applied to boolean` });
          stack.push('num');
        }
      } else {
        const b = stack.pop() ?? 'unknown';
        const a = stack.pop() ?? 'unknown';
        if (NUM_OPS.has(n.op)) {
          if (a === 'bool' || b === 'bool') issues.push({ message: `arithmetic op "${n.op}" mixes boolean` });
          stack.push('num');
        } else if (BOOL_OPS.has(n.op)) {
          stack.push('bool');
        } else {
          stack.push('unknown');
        }
      }
    } else if (n.type === 'call') {
      for (let i = 0; i < n.arity; i++) stack.pop();
      // Almost all builtins return num; 'if' propagates - call it unknown.
      if (n.name === 'if') stack.push('unknown');
      else stack.push('num');
    }
  }
  const top = stack.pop() ?? 'unknown';
  return { ok: issues.length === 0, type: top, issues };
}

// ── Rule validation ────────────────────────────────────────────────

export interface RuleValidationReport {
  ok: boolean;
  parseError?: string;
  typeIssues: string[];
}

export function validateRule(expression: string): RuleValidationReport {
  try {
    const rpn = parse(expression);
    const tc = typeCheck(rpn);
    return {
      ok: tc.ok,
      typeIssues: tc.issues.map((i) => i.message),
    };
  } catch (err) {
    return { ok: false, parseError: (err as Error).message, typeIssues: [] };
  }
}

// ── Default context (well-known IR variables) ──────────────────────

export const DEFAULT_CONTEXT_VARS: string[] = [
  'spin_count',
  'day_of_week',
  'win_amount',
  'scatters_landed',
  'wilds_landed',
  'free_spins',
  'current_mult',
  'max_win',
  'player_session_loss',
  'last_bonus',
  'bet',
  'rtp',
  'volatility',
  'reel_count',
  'row_count',
  'paylines',
  'tier',
];

export function defaultMockContext(): EvalContext {
  return {
    vars: {
      spin_count: 100,
      day_of_week: 3,
      win_amount: 5,
      scatters_landed: 2,
      wilds_landed: 1,
      free_spins: 10,
      current_mult: 2,
      max_win: 5000,
      player_session_loss: 25,
      last_bonus: 80,
      bet: 1,
      rtp: 0.96,
      volatility: 5,
      reel_count: 5,
      row_count: 3,
      paylines: 20,
      tier: 2,
    },
    maxIterations: 10000,
    maxMs: 100,
  };
}

// ── Auto-suggest rules (heuristic) ─────────────────────────────────
//
// Inspects a "current IR" sketch (just the node-kinds present) and proposes
// 3–5 rules the designer likely wants. Used by the "Suggest rule" button.

export interface IRSketch {
  /** Flat list of feature kinds (from compose graph nodes). */
  kinds: string[];
  /** Existing rule names so we don't suggest duplicates. */
  existingNames?: string[];
}

export interface RuleSuggestion {
  name: string;
  expression: string;
  rationale: string;
}

export function suggestRules(ir: IRSketch): RuleSuggestion[] {
  const has = (k: string) => ir.kinds.includes(k);
  const existing = new Set(ir.existingNames ?? []);
  const suggestions: RuleSuggestion[] = [];

  if (has('free_spins') && !has('retrigger')) {
    suggestions.push({
      name: 'FS retrigger bonus',
      expression: 'if(scatters_landed >= 3, free_spins + 5, 0)',
      rationale: 'FS feature without retrigger rule — add +5 spins on 3+ scatter.',
    });
  }
  if (has('free_spins')) {
    suggestions.push({
      name: 'FS multiplier cap',
      expression: 'clamp(current_mult * 2, 1, 100)',
      rationale: 'Compound FS multiplier with a 100× cap (typical L&W ceiling).',
    });
  }
  if (has('hold_and_win')) {
    suggestions.push({
      name: 'H&W respin reset',
      expression: 'if(scatters_landed >= 1, 3, 0)',
      rationale: 'Standard Hold & Win — reset respin counter to 3 on every blocker.',
    });
  }
  if (has('cascade')) {
    suggestions.push({
      name: 'Cascade win scaling',
      expression: 'clamp(win_amount * 1.1, 0, max_win)',
      rationale: 'Cascade chains often boost subsequent wins ~10%.',
    });
  }
  if (!has('mystery_trigger')) {
    suggestions.push({
      name: 'Pity bonus',
      expression: 'if(spin_count - last_bonus > 200, 1, 0)',
      rationale: 'No mystery trigger — add a pity bonus after 200 dry spins.',
    });
  }
  // Loss compensation always handy.
  suggestions.push({
    name: 'Loss-streak compensation',
    expression: 'if(player_session_loss > 50, 0.01, 0)',
    rationale: 'Soft RTP boost (+1%) after deep loss streak (responsible-gaming hook).',
  });

  // Cap 5, filter existing names.
  return suggestions.filter((s) => !existing.has(s.name)).slice(0, 5);
}

// ── RTP contribution estimator ─────────────────────────────────────
//
// Cheap heuristic: given a rule and a "with vs without" base RTP, estimate
// the delta. We evaluate the rule once with mock context, then treat its
// numeric output as a multiplicative bump (`delta = value / 100`) and
// clamp to ±20% so a single rule cannot dominate.

export function ruleRtpContribution(rule: IRRule, ctx: EvalContext): number {
  const r = evalRule(rule, ctx);
  if (!r.ok || r.value === undefined) return 0;
  // Interpret raw output as %ΔRTP / 100.
  const raw = r.value / 100;
  return Math.max(-0.2, Math.min(0.2, raw));
}

// ── Public bridge ──────────────────────────────────────────────────

export interface RuleEditorBridge {
  contextVars: string[];
  parse(expr: string): RpnNode[];
  tokenize(expr: string): Token[];
  evaluate(expr: string, ctx?: EvalContext): number;
  validate(expr: string): RuleValidationReport;
  defaultContext(): EvalContext;
  evalRule(rule: IRRule, ctx?: EvalContext): RuleEvalResult;
  suggest(ir: IRSketch): RuleSuggestion[];
  builtins(): string[];
  contribution(rule: IRRule, ctx?: EvalContext): number;
}

export function createRuleEditorBridge(): RuleEditorBridge {
  return {
    contextVars: DEFAULT_CONTEXT_VARS.slice(),
    parse,
    tokenize,
    evaluate: (e, c) => evaluateExpression(e, c ?? defaultMockContext()),
    validate: validateRule,
    defaultContext: defaultMockContext,
    evalRule: (r, c) => evalRule(r, c ?? defaultMockContext()),
    suggest: suggestRules,
    builtins: () => Object.keys(BUILTINS),
    contribution: (r, c) => ruleRtpContribution(r, c ?? defaultMockContext()),
  };
}
