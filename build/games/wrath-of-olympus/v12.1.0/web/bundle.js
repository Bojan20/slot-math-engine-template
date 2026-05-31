/* slot-math production runtime — auto-emitted by tools/par_deploy/web_emit.py
   IR-driven deterministic spin loop. Math mode overlay (Cmd+M / Ctrl+M).
*/
(async function() {{
  const IR_PATH = './game.ir.json';
  const ir = await fetch(IR_PATH).then(r => r.json());

  // Reel grid render
  const reels = ir.topology.reels;
  const rows = ir.topology.rows || 3;
  const grid = document.getElementById('reels');
  const cells = [];
  for (let r = 0; r < reels; r++) {{
    for (let row = 0; row < rows; row++) {{
      const c = document.createElement('div');
      c.className = 'cell';
      c.textContent = '?';
      grid.appendChild(c);
      cells.push(c);
    }}
  }}

  // Reel strips → flat symbol pool per reel (weighted)
  const reelPools = ir.reels.base.map(reelMap => {{
    const pool = [];
    Object.entries(reelMap).forEach(([sym, w]) => {{
      for (let i = 0; i < Math.round(w * 10); i++) pool.push(sym);
    }});
    return pool;
  }});

  // Mulberry32 deterministic PRNG (seeded from IR.rng.default_seed)
  let seed = ir.rng.default_seed || 12345;
  function rng() {{
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }}

  // Math-mode running stats
  let totalSpins = 0;
  let totalPayout = 0;
  let totalHits = 0;
  let sumSq = 0;
  let maxWin = 0;

  const baseBet = ir.bet.base_bet || 1.0;
  let balance = 1000.0;

  function spin() {{
    let payout = 0;
    const drawn = [];
    for (let r = 0; r < reels; r++) {{
      const reelDraw = [];
      for (let row = 0; row < rows; row++) {{
        const pool = reelPools[r];
        const sym = pool[Math.floor(rng() * pool.length)];
        reelDraw.push(sym);
        cells[r * rows + row].textContent = sym;
      }}
      drawn.push(reelDraw);
    }}

    // Synthetic payout: count first-reel symbol on payline 0
    const firstSym = drawn[0][Math.floor(rows / 2)];
    let matchCount = 0;
    for (let r = 0; r < reels; r++) {{
      if (drawn[r].includes(firstSym)) matchCount++;
      else break;
    }}
    const paytable = ir.paytable[firstSym];
    if (paytable && paytable[String(matchCount)]) {{
      payout = paytable[String(matchCount)] * baseBet;
    }}

    balance += payout - baseBet;
    totalSpins++;
    totalPayout += payout;
    if (payout > 0) totalHits++;
    sumSq += payout * payout;
    if (payout > maxWin) maxWin = payout;

    document.getElementById('balance').textContent = balance.toFixed(2);
    document.getElementById('last-win').textContent = payout.toFixed(2);
    document.getElementById('spin-count').textContent = totalSpins;
    updateMathMode();
  }}

  function updateMathMode() {{
    if (!totalSpins) return;
    const runningRtp = totalPayout / (totalSpins * baseBet);
    const runningHf = totalHits / totalSpins;
    const ex = runningRtp * baseBet;
    const variance = sumSq / totalSpins - ex * ex;

    document.getElementById('math-running-rtp').textContent = (runningRtp * 100).toFixed(4) + '%';
    document.getElementById('math-running-hf').textContent = (runningHf * 100).toFixed(2) + '%';
    document.getElementById('math-variance').textContent = variance.toFixed(2);
    document.getElementById('math-max-win').textContent = maxWin.toFixed(2) + 'x';
    document.getElementById('math-total-spins').textContent = totalSpins;

    // Wilson CI gate (99%, z=2.5758)
    const z = 2.5758;
    const p = runningHf;
    const n = totalSpins;
    const denom = 1 + (z * z) / n;
    const centre = (p + (z * z) / (2 * n)) / denom;
    const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    const lower = centre - margin;
    const upper = centre + margin;
    const target = ir.limits.hit_freq_target;
    const inCi = lower <= target && target <= upper;
    const el = document.getElementById('math-ci-pass');
    el.textContent = inCi ? '✓ inside' : '✗ outside';
    el.className = inCi ? 'math-pass' : 'math-fail';
  }}

  document.getElementById('spin').addEventListener('click', spin);
  document.getElementById('math-toggle').addEventListener('click', () => {{
    document.getElementById('math-mode').classList.toggle('active');
  }});
  document.addEventListener('keydown', (e) => {{
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {{
      e.preventDefault();
      document.getElementById('math-mode').classList.toggle('active');
    }}
  }});
}})();
