/**
 * W215 Faza 1200.0 — Kernel Sandbox Runtime CORE (Agent A, restart).
 *
 * Source-level validator. Runs BEFORE the kernel touches `vm`. The goal is
 * to reject the obvious foot-guns (`eval`, `new Function`, `require`,
 * dynamic `import()`, prototype-pollution paths, reflection / proxy) with
 * a clear violation list before we pay the cost of `vm.compileFunction`.
 *
 * Why regex (not full AST):
 *   • Fast (<1ms on a 50KB source).
 *   • Zero dependencies — matches Constraint "Node native vm only".
 *   • The deny patterns are narrow lexical tokens that don't need scope
 *     analysis to be dangerous.
 *
 * False-positive policy: a violation halts validation immediately for the
 * *critical* tier, but `medium` violations are accumulated so the caller
 * can show all problems in one round-trip.
 */

import type { SourceValidationResult, SourceViolation, SourceSeverity } from './types.js';

interface DenyRule {
  rule: string;
  pattern: RegExp;
  severity: SourceSeverity;
  message: string;
}

/**
 * Deny list. Patterns are intentionally anchored on the most common
 * vector (e.g. `eval(` rather than the identifier `eval`, which legitimate
 * code may reference in comments / strings).
 *
 * NOTE: every pattern uses the `g` flag so we can report ALL occurrences,
 * not just the first.
 */
const DENY_RULES: ReadonlyArray<DenyRule> = Object.freeze([
  {
    rule: 'eval-call',
    pattern: /\beval\s*\(/g,
    severity: 'critical',
    message: '`eval(...)` is forbidden — kernels must be pure closed-form math',
  },
  {
    rule: 'new-function',
    pattern: /\bnew\s+Function\s*\(/g,
    severity: 'critical',
    message: '`new Function(...)` is forbidden — code generation is not allowed',
  },
  {
    rule: 'dynamic-import',
    pattern: /(?<![.\w$])import\s*\(/g,
    severity: 'critical',
    message: '`import(...)` is forbidden — kernels may not pull modules at runtime',
  },
  {
    rule: 'require-call',
    pattern: /(?<![.\w$])require\s*\(/g,
    severity: 'critical',
    message: '`require(...)` is forbidden — the sandbox exposes no module loader',
  },
  {
    rule: 'proto-property',
    pattern: /__proto__/g,
    severity: 'high',
    message: '`__proto__` access is forbidden — prototype-pollution vector',
  },
  {
    rule: 'constructor-index',
    pattern: /\bconstructor\s*\[/g,
    severity: 'high',
    message: '`constructor[…]` is forbidden — reflective ctor lookup vector',
  },
  {
    rule: 'reflect-namespace',
    pattern: /\bReflect\s*\./g,
    severity: 'high',
    message: '`Reflect.*` is forbidden — kernels may not introspect host scope',
  },
  {
    rule: 'proxy-ctor',
    pattern: /\bnew\s+Proxy\s*\(/g,
    severity: 'high',
    message: '`new Proxy(...)` is forbidden — trap-based foot-gun',
  },
  {
    rule: 'process-access',
    pattern: /(?<![.\w$])process\s*\./g,
    severity: 'critical',
    message: '`process.*` is forbidden — host runtime is hidden from sandbox',
  },
  {
    rule: 'fs-import',
    pattern: /from\s+['"](?:fs|fs\/promises|child_process|net|http|https|os|path)['"]/g,
    severity: 'critical',
    message: 'Node core module imports are forbidden inside kernels',
  },
  {
    rule: 'global-this',
    pattern: /\bglobalThis\s*\./g,
    severity: 'high',
    message: '`globalThis.*` is forbidden — global mutation is not allowed',
  },
  {
    rule: 'with-statement',
    pattern: /\bwith\s*\(/g,
    severity: 'medium',
    message: '`with(...)` is forbidden — disables strict scope analysis',
  },
]);

/**
 * Allowed exports — the kernel convention is that ONLY `analyze*`,
 * `simulate*`, or `solve*` functions are exported. Anything else is
 * an unknown contract and we reject it.
 */
const ALLOWED_EXPORT_PREFIXES = ['analyze', 'simulate', 'solve'];

/**
 * Validate a kernel source string. Always inspects the full source — even
 * if a critical rule fires — so the author sees every problem at once.
 */
export function validateKernelSource(source: string): SourceValidationResult {
  if (typeof source !== 'string') {
    return {
      ok: false,
      violations: [
        {
          rule: 'input-type',
          severity: 'critical',
          message: 'source must be a string',
          line: 0,
          excerpt: '',
        },
      ],
    };
  }
  if (source.length === 0) {
    return {
      ok: false,
      violations: [
        {
          rule: 'empty-source',
          severity: 'critical',
          message: 'source must not be empty',
          line: 0,
          excerpt: '',
        },
      ],
    };
  }

  const violations: SourceViolation[] = [];
  // Pre-compute line offsets so we can map an index → 1-based line cheaply.
  const lineOffsets = computeLineOffsets(source);

  for (const rule of DENY_RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(source)) !== null) {
      violations.push({
        rule: rule.rule,
        severity: rule.severity,
        message: rule.message,
        line: indexToLine(lineOffsets, match.index),
        excerpt: truncate(match[0], 120),
      });
      // Defensive: in case of zero-width match (shouldn't happen) bump.
      if (match.index === rule.pattern.lastIndex) rule.pattern.lastIndex++;
    }
  }

  // Export-shape check — must have at least one `export function analyze*`
  // or `export function simulate*` / `solve*`. Disallow `export *` (wildcard
  // re-export hides shape) and `export default` (anonymous contract).
  const exportNames = collectExportedNames(source);
  if (exportNames.length === 0) {
    violations.push({
      rule: 'no-exports',
      severity: 'critical',
      message: 'kernel must export at least one analyze*/simulate*/solve* function',
      line: 0,
      excerpt: '',
    });
  } else {
    for (const name of exportNames) {
      const allowed = ALLOWED_EXPORT_PREFIXES.some((p) => name.startsWith(p));
      if (!allowed) {
        violations.push({
          rule: 'disallowed-export',
          severity: 'high',
          message: `export "${name}" — only analyze*/simulate*/solve* exports are allowed`,
          line: 0,
          excerpt: name,
        });
      }
    }
  }

  if (/\bexport\s+\*/.test(source)) {
    violations.push({
      rule: 'wildcard-reexport',
      severity: 'high',
      message: '`export *` is forbidden — shape must be explicit',
      line: 0,
      excerpt: 'export *',
    });
  }
  if (/\bexport\s+default\b/.test(source)) {
    violations.push({
      rule: 'default-export',
      severity: 'high',
      message: '`export default` is forbidden — kernels must use named exports',
      line: 0,
      excerpt: 'export default',
    });
  }

  return { ok: violations.length === 0, violations };
}

/** Extract names of `export function NAME` and `export const NAME = ...`. */
export function collectExportedNames(source: string): string[] {
  const names: string[] = [];
  const reFn = /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
  const reConst = /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = reFn.exec(source)) !== null) names.push(m[1]);
  while ((m = reConst.exec(source)) !== null) names.push(m[1]);
  return names;
}

function computeLineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) offsets.push(i + 1);
  }
  return offsets;
}

function indexToLine(offsets: number[], index: number): number {
  // Binary search.
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (offsets[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

/** Pretty-print a violation list (newline-joined). */
export function formatViolations(violations: SourceViolation[]): string {
  if (violations.length === 0) return '(no violations)';
  return violations
    .map((v) => `  [${v.severity.toUpperCase()}] ${v.rule} (line ${v.line}) — ${v.message}`)
    .join('\n');
}
