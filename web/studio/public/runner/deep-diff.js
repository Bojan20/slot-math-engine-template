/*
 * ════════════════════════════════════════════════════════════════════════════
 *   DEEP-DIFF  —  Structured JSON diff with field path
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Walks two objects in parallel and returns the FIRST divergence as
 * { path: "paytable.ZEUS.3", a: 10, b: 5, kind: "value" }
 * or all divergences when called with collectAll=true.
 *
 * Used by Lockstep mismatch logging — when oracle.spin and runtime.spin
 * disagree, this tells you the EXACT field (e.g. "fsWin" or "lightning")
 * that drifted, so the fix is mechanical, not detective work.
 *
 * Public API:
 *   MTLDiff.firstDiff(a, b)               → { path, a, b, kind } | null
 *   MTLDiff.allDiffs(a, b, maxResults=50) → Array<{ path, a, b, kind }>
 *   MTLDiff.formatReport(diff)            → multi-line string for console.log
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (root) {
  'use strict';

  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  // Walk `a` and `b` in lockstep; collect diffs; respect maxResults.
  function walk(a, b, path, out, maxResults) {
    if (out.length >= maxResults) return;
    const ta = typeOf(a), tb = typeOf(b);
    if (ta !== tb) {
      out.push({ path: path || '$', a: a, b: b, kind: 'type:' + ta + '/' + tb });
      return;
    }
    if (ta === 'object') {
      const ka = Object.keys(a).sort();
      const kb = Object.keys(b).sort();
      const all = new Set(ka.concat(kb));
      for (const k of all) {
        if (out.length >= maxResults) return;
        if (!(k in a)) { out.push({ path: path ? path + '.' + k : k, a: undefined, b: b[k], kind: 'missing:a' }); continue; }
        if (!(k in b)) { out.push({ path: path ? path + '.' + k : k, a: a[k], b: undefined, kind: 'missing:b' }); continue; }
        walk(a[k], b[k], path ? path + '.' + k : k, out, maxResults);
      }
    } else if (ta === 'array') {
      const len = Math.max(a.length, b.length);
      for (let i = 0; i < len; i++) {
        if (out.length >= maxResults) return;
        const p = path ? path + '[' + i + ']' : '[' + i + ']';
        if (i >= a.length) { out.push({ path: p, a: undefined, b: b[i], kind: 'missing:a' }); continue; }
        if (i >= b.length) { out.push({ path: p, a: a[i], b: undefined, kind: 'missing:b' }); continue; }
        walk(a[i], b[i], p, out, maxResults);
      }
    } else {
      // primitives — number / string / bool / null
      // Number equality uses Object.is to catch NaN-vs-NaN edge case (Object.is
      // says NaN===NaN; === says false).  Lockstep needs Object.is semantics
      // so two NaN outcomes don't fire a false mismatch.
      if (!Object.is(a, b)) {
        out.push({ path: path || '$', a: a, b: b, kind: 'value' });
      }
    }
  }

  function firstDiff(a, b) {
    const out = [];
    walk(a, b, '', out, 1);
    return out.length ? out[0] : null;
  }
  function allDiffs(a, b, maxResults) {
    if (maxResults == null) maxResults = 50;
    const out = [];
    walk(a, b, '', out, maxResults);
    return out;
  }

  function fmtVal(v) {
    if (v === undefined) return '<missing>';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return JSON.stringify(v);
    if (v === null) return 'null';
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  }

  function formatReport(diff) {
    if (!diff) return 'no diffs';
    if (Array.isArray(diff)) {
      return diff.map(formatReport).join('\n');
    }
    return diff.path + '  →  oracle: ' + fmtVal(diff.a) + '  vs  runner: ' + fmtVal(diff.b) + '  [' + diff.kind + ']';
  }

  root.MTLDiff = {
    firstDiff: firstDiff,
    allDiffs: allDiffs,
    formatReport: formatReport,
  };
})(typeof window !== 'undefined' ? window : globalThis);
