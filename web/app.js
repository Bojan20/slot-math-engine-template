// W152 Faza 11.1 — Web Config Builder UI (MVP).
//
// Vanilla ES module, no build pipeline, no npm runtime deps. The UI is a
// drop-zone for IR JSON files that:
//   1. Validates the IR against a minimal in-browser schema check (the
//      full Zod validator lives server-side; the MVP catches the most
//      common shape errors locally so the user doesn't wait on a CLI
//      round-trip).
//   2. Renders the configuration: meta, symbols, paytable, reel weights.
//   3. Computes a closed-form base-game RTP estimate using the per-reel
//      symbol probabilities × paytable. Captures the lines / ways path
//      exactly; feature contribution is additive and out of scope for
//      the MVP — surfaced as "base only" so the user understands the
//      number is a lower bound for feature games.
//   4. Renders a CLI handoff command for the full Monte Carlo sim.
//
// Everything is intentionally framework-free so any maintainer can read
// the entire UI in one file and any browser with ES2020 + File API can
// host it. No React, no Vite, no bundler.

/** Render helpers */
const $ = (id) => document.getElementById(id);
const setStatus = (msg, kind = 'ok') => {
  const el = $('status');
  el.textContent = msg;
  el.className = kind;
};

const fmt = {
  pct: (x) => (x * 100).toFixed(3) + ' %',
  hit: (x) => '1 in ' + (x > 0 ? (1 / x).toFixed(2) : '∞'),
  num: (x) => (typeof x === 'number' ? x.toLocaleString() : String(x)),
};

/** Minimal IR shape check — catches the most common file-drop bugs
 *  without re-implementing the Zod validator. Returns an array of
 *  human-readable issues. Empty array = looks plausible. */
export function validateIRShape(ir) {
  const issues = [];
  if (!ir || typeof ir !== 'object') {
    issues.push('Top-level value is not an object.');
    return issues;
  }
  for (const key of ['schema_version', 'meta', 'topology', 'symbols', 'reels', 'evaluation', 'paytable']) {
    if (!(key in ir)) issues.push(`Missing required field: ${key}`);
  }
  if (ir.symbols && !Array.isArray(ir.symbols)) issues.push('symbols must be an array');
  if (ir.topology && typeof ir.topology.kind !== 'string') issues.push('topology.kind must be a string');
  if (ir.evaluation && typeof ir.evaluation.kind !== 'string') issues.push('evaluation.kind must be a string');
  if (ir.reels && typeof ir.reels.mode !== 'string') issues.push('reels.mode must be a string');
  return issues;
}

/** Topology → (reels, rows) for grid sizing. */
export function topologyDims(t) {
  if (!t || typeof t !== 'object') return [0, 0];
  switch (t.kind) {
    case 'rectangular':
      return [t.reels ?? 0, t.rows ?? 0];
    case 'variable_rows': {
      const rows = Array.isArray(t.row_range_per_reel)
        ? Math.max(0, ...t.row_range_per_reel.map((r) => r[1] ?? 0))
        : 0;
      return [t.reels ?? 0, rows];
    }
    case 'cluster_grid':
      return [t.columns ?? 0, t.rows ?? 0];
    default:
      return [0, 0];
  }
}

/** Per-reel { symbol → probability } from IR.reels. */
export function reelProbabilities(ir) {
  const reels = ir.reels;
  if (!reels) return [];
  if (reels.mode === 'weighted') {
    return (reels.base ?? []).map((map) => {
      const total = Object.values(map).reduce((a, b) => a + (b || 0), 0);
      const out = {};
      for (const [sym, w] of Object.entries(map)) {
        out[sym] = total > 0 ? (w || 0) / total : 0;
      }
      return out;
    });
  }
  if (reels.mode === 'strips') {
    return (reels.base ?? []).map((strip) => {
      const counts = {};
      for (const sym of strip) counts[sym] = (counts[sym] || 0) + 1;
      const total = strip.length;
      const out = {};
      for (const [sym, c] of Object.entries(counts)) {
        out[sym] = total > 0 ? c / total : 0;
      }
      return out;
    });
  }
  return [];
}

/**
 * Closed-form base-game RTP estimate for lines / ways games.
 *
 *   E[RTP] = Σ_symbols ( pay_5  × P(symbol on 5 reels)
 *                      + pay_4  × P(exactly 4 leftmost reels) × P(non-match on reel 5)
 *                      + pay_3  × P(exactly 3 leftmost reels) × P(non-match on reel 4) )
 *
 * Wild substitution is approximated by treating wild probability as
 * additive to every paying symbol's per-reel probability. Numerically
 * identical to "wild as full substitute" only when wilds don't have
 * their own paytable entry, which is the engine's default.
 *
 * Hit-rate estimate: P(any winning 3-of-a-kind starting from leftmost).
 */
export function estimateBaseRtp(ir) {
  const probs = reelProbabilities(ir);
  if (probs.length < 3) return { rtp: 0, hitRate: 0 };
  const paytable = ir.paytable ?? {};
  const symbols = Object.keys(paytable);
  const wildIds = (ir.symbols ?? [])
    .filter((s) => s.kind === 'wild' || s.kind === 'expanding' || s.kind === 'chain_wild')
    .map((s) => s.id);
  const pWildPerReel = probs.map((reel) => wildIds.reduce((a, w) => a + (reel[w] ?? 0), 0));

  const pSymPerReel = (sym, reelIdx) => {
    const direct = probs[reelIdx]?.[sym] ?? 0;
    // Treat wilds as substitutes (mirrors line evaluator semantics).
    return Math.min(1, direct + pWildPerReel[reelIdx]);
  };

  let rtp = 0;
  let hitRate = 0;
  for (const sym of symbols) {
    if (wildIds.includes(sym)) continue;
    const pays = paytable[sym] ?? {};
    const pay3 = Number(pays['3'] ?? pays['3+'] ?? 0);
    const pay4 = Number(pays['4'] ?? pays['4+'] ?? 0);
    const pay5 = Number(pays['5'] ?? pays['5+'] ?? 0);
    const p1 = pSymPerReel(sym, 0);
    const p2 = pSymPerReel(sym, 1);
    const p3 = pSymPerReel(sym, 2);
    const p4 = probs.length > 3 ? pSymPerReel(sym, 3) : 0;
    const p5 = probs.length > 4 ? pSymPerReel(sym, 4) : 0;

    const probAny3 = p1 * p2 * p3 * (1 - p4);
    const probAny4 = p1 * p2 * p3 * p4 * (1 - p5);
    const probAny5 = p1 * p2 * p3 * p4 * p5;

    rtp += pay3 * probAny3 + pay4 * probAny4 + pay5 * probAny5;
    hitRate += probAny3 + probAny4 + probAny5;
  }
  return { rtp, hitRate };
}

/** Render the IR into the page. */
export function render(ir) {
  // Meta
  $('game-id').textContent = ir.meta?.id ?? '—';
  $('game-version').textContent = ir.meta?.version ?? '—';
  const [reels, rows] = topologyDims(ir.topology);
  $('topology').textContent = `${ir.topology?.kind ?? '?'} (${reels}×${rows})`;
  $('evaluation').textContent = ir.evaluation?.kind ?? '?';
  const target = ir.limits?.target_rtp;
  $('target-rtp').textContent =
    typeof target === 'number' ? (target * 100).toFixed(2) + ' %' : '—';
  $('max-win').textContent = `${ir.limits?.max_win_x ?? '—'}×`;
  $('jurisdictions').textContent = (ir.compliance?.jurisdictions ?? []).join(', ') || '—';
  $('ir-summary').hidden = false;

  // Symbols
  const symTbody = $('symbols-table').querySelector('tbody');
  symTbody.innerHTML = '';
  for (const s of ir.symbols ?? []) {
    const tr = document.createElement('tr');
    const subs = Array.isArray(s.substitutes)
      ? s.substitutes.join(', ')
      : (s.substitutes ?? '—');
    tr.innerHTML = `<td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.kind)}</td><td>${esc(subs)}</td>`;
    symTbody.appendChild(tr);
  }
  $('symbols-panel').hidden = false;

  // Reels
  const reelsHost = $('reels-grid');
  reelsHost.innerHTML = '';
  const probs = reelProbabilities(ir);
  probs.forEach((reel, i) => {
    const card = document.createElement('div');
    card.className = 'reel-card';
    const items = Object.entries(reel)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([sym, p]) =>
          `<li><span class="sym">${esc(sym)}</span><span class="w">${(p * 100).toFixed(2)}%</span></li>`,
      )
      .join('');
    card.innerHTML = `<h4>Reel ${i + 1}</h4><ul>${items}</ul>`;
    reelsHost.appendChild(card);
  });
  $('reels-panel').hidden = false;

  // Paytable
  const ptTbody = $('paytable-table').querySelector('tbody');
  ptTbody.innerHTML = '';
  for (const [sym, pays] of Object.entries(ir.paytable ?? {})) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(sym)}</td><td>${esc(pays['3'] ?? pays['3+'] ?? '—')}</td><td>${esc(pays['4'] ?? pays['4+'] ?? '—')}</td><td>${esc(pays['5'] ?? pays['5+'] ?? '—')}</td>`;
    ptTbody.appendChild(tr);
  }
  $('paytable-panel').hidden = false;

  // RTP estimate
  const { rtp, hitRate } = estimateBaseRtp(ir);
  $('reel-probs').textContent = `${probs.length} reels, ${Object.keys(probs[0] ?? {}).length} symbols/reel`;
  $('rtp-estimate').textContent = fmt.pct(rtp) + ' (base game only)';
  $('hit-rate-estimate').textContent = fmt.hit(hitRate);
  const pctOf100 = Math.max(0, Math.min(100, rtp * 100));
  $('rtp-bar-fill').style.width = pctOf100.toFixed(2) + '%';
  $('rtp-panel').hidden = false;

  // CLI handoff
  $('cli-cmd').textContent = `npm run sim -- --config ${ir.meta?.id ?? 'your-config'}.json`;
  $('cli-panel').hidden = false;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Parse a JSON file/string and render — used by tests and the UI. */
export async function loadIRText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('JSON parse failed: ' + (e instanceof Error ? e.message : String(e)));
  }
  const issues = validateIRShape(parsed);
  if (issues.length > 0) {
    throw new Error('IR shape issues: ' + issues.join('; '));
  }
  return parsed;
}

// ─── Browser-only wiring ──────────────────────────────────────────────────

function bindUI() {
  if (typeof document === 'undefined') return;
  const drop = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  if (!drop || !fileInput) return;

  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) await handleFile(file);
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) await handleFile(file);
  });
}

async function handleFile(file) {
  try {
    const text = await file.text();
    const ir = await loadIRText(text);
    setStatus(`Loaded ${file.name} — ${ir.meta?.id ?? 'unnamed'} v${ir.meta?.version ?? '?'}`, 'ok');
    render(ir);
  } catch (e) {
    setStatus('Failed: ' + (e instanceof Error ? e.message : String(e)), 'err');
  }
}

if (typeof document !== 'undefined') {
  bindUI();
}
