/* slot-math · Variant Compare · auto-emitted UI driver.
   - Reads reports/par-library/<game>/<variant>/canonical.par.yaml manifest
   - Renders N-pane (1..N) grid w/ iframe + metric diff
   - Promote button → POST /promote endpoint or write to promotions.log
*/
(async function () {
  const PAR_LIBRARY_BASE = '../../reports/par-library';
  const BUILDS_BASE = '../../build/games';

  let activeGame = null;
  let activeVariants = [];   // [{id, par, ir, mc_attestation}, ...]
  let selectedVariantId = null;

  // ─── Game library discovery ──────────────────────────────────────────
  async function discoverGames() {
    // In real deployment this hits a /api/games endpoint. For static
    // fallback: load games.index.json or hardcoded sample.
    try {
      const idx = await fetch(`${PAR_LIBRARY_BASE}/games.index.json`).then(r => r.json());
      return idx.games || [];
    } catch {
      // Fallback: assume known sample games
      return [
        { id: 'crimson-tiger', name: 'Crimson Tiger (sample)', variants: ['a', 'b', 'c', 'd'] },
      ];
    }
  }

  async function loadVariantData(gameId, variantId) {
    // Try to load canonical PAR + IR + MC attestation
    const paths = {
      par: `${PAR_LIBRARY_BASE}/${gameId}/${variantId}/canonical.par.yaml`,
      ir: `${BUILDS_BASE}/${gameId}/${variantId}/game.ir.json`,
      mc: `${BUILDS_BASE}/${gameId}/${variantId}/mc_sweep.attestation.json`,
      web: `${BUILDS_BASE}/${gameId}/${variantId}/web/index.html`,
    };
    const result = { id: variantId, paths };

    try {
      const irRes = await fetch(paths.ir);
      if (irRes.ok) result.ir = await irRes.json();
    } catch {}
    try {
      const mcRes = await fetch(paths.mc);
      if (mcRes.ok) result.mc = await mcRes.json();
    } catch {}
    return result;
  }

  // ─── Render ──────────────────────────────────────────────────────────
  function renderGrid() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    if (!activeVariants.length) {
      grid.innerHTML = '<div style="color:#666;padding:40px;text-align:center;grid-column:1/-1;">no variants loaded — select a game</div>';
      return;
    }

    // Compute baseline = highest RTP for delta highlight
    const rtps = activeVariants.map(v => v.ir?.limits?.target_rtp ?? 0);
    const baselineRtp = Math.max(...rtps);

    activeVariants.forEach((v) => {
      const pane = document.createElement('div');
      pane.className = 'pane';
      if (v.id === selectedVariantId) pane.classList.add('winner');

      const rtp = v.ir?.limits?.target_rtp ?? 0;
      const hitFreq = v.ir?.limits?.hit_freq_target ?? 0;
      const maxWin = v.ir?.limits?.max_win_x ?? 0;
      const vol = v.ir?.limits?.target_volatility ?? '—';
      const juris = v.ir?.compliance?.jurisdictions?.join(' / ') ?? '—';
      const mcPass = v.mc?.comparison?.overall_pass;
      const mcTier = v.mc?.tier ?? '—';

      const rtpDelta = rtp - baselineRtp;
      const deltaCls = rtpDelta > 0 ? '' : rtpDelta < 0 ? 'neg' : 'neu';
      const deltaSign = rtpDelta >= 0 ? '+' : '';

      pane.innerHTML = `
        <h2>Variant ${v.id.toUpperCase()} <span class="label">${v.ir?.meta?.name ?? '(no build)'}</span></h2>
        <div class="frame-host">
          ${v.ir ? `<iframe src="${v.paths.web}" loading="lazy" title="Variant ${v.id}"></iframe>` : '(not built yet — run slot-math build)'}
        </div>
        <div class="metric-grid">
          <div class="metric">
            <div class="label">Target RTP</div>
            <div class="value">${(rtp * 100).toFixed(2)}%</div>
            <div class="delta ${deltaCls}">${deltaSign}${(rtpDelta * 100).toFixed(2)} pp vs best</div>
          </div>
          <div class="metric">
            <div class="label">Hit-freq target</div>
            <div class="value">${(hitFreq * 100).toFixed(1)}%</div>
          </div>
          <div class="metric">
            <div class="label">Max win cap</div>
            <div class="value">${maxWin}×</div>
          </div>
          <div class="metric">
            <div class="label">Volatility</div>
            <div class="value">${vol.toUpperCase()}</div>
          </div>
          <div class="metric">
            <div class="label">Jurisdictions</div>
            <div class="value" style="font-size:11px;">${juris}</div>
          </div>
          <div class="metric">
            <div class="label">MC gate (${mcTier})</div>
            <div class="value" style="color:${mcPass === true ? '#00ff88' : mcPass === false ? '#ff6666' : '#888'};">
              ${mcPass === true ? '✓ PASS' : mcPass === false ? '✗ FAIL' : '— not run'}
            </div>
          </div>
        </div>
        <div class="actions">
          <label class="promote-radio">
            <input type="radio" name="winner" value="${v.id}" ${v.id === selectedVariantId ? 'checked' : ''}/>
            Mark as winner
          </label>
          <span style="color:#666;font-size:10px;">PAR: ${(v.ir?.provenance?.par_sha256 ?? '').slice(0, 12)}…</span>
        </div>
      `;
      grid.appendChild(pane);
    });

    // Wire radio buttons
    document.querySelectorAll('input[name="winner"]').forEach((r) => {
      r.addEventListener('change', (e) => {
        selectedVariantId = e.target.value;
        document.getElementById('promote-btn').disabled = false;
        renderGrid();
      });
    });
  }

  async function refreshAuditLog() {
    if (!activeGame) return;
    try {
      const res = await fetch(`${BUILDS_BASE}/${activeGame}/promotions.log`);
      if (res.ok) {
        const text = await res.text();
        document.getElementById('audit-pre').textContent = text || '(no promotions yet)';
      }
    } catch {
      document.getElementById('audit-pre').textContent = '(audit log unavailable)';
    }
  }

  function toast(msg, color = '#00ff88') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = color;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  // ─── Wiring ──────────────────────────────────────────────────────────
  async function selectGame(gameId) {
    activeGame = gameId;
    activeVariants = [];
    selectedVariantId = null;

    const games = await discoverGames();
    const game = games.find((g) => g.id === gameId);
    if (!game) return;

    document.getElementById('meta-line').textContent = `loading ${game.variants.length} variants…`;
    activeVariants = await Promise.all(
      game.variants.map((v) => loadVariantData(gameId, v))
    );
    document.getElementById('meta-line').textContent =
      `${game.name} · ${activeVariants.length} variants · ${activeVariants.filter(v => v.ir).length} built`;

    document.getElementById('promote-btn').disabled = true;
    renderGrid();
    refreshAuditLog();
  }

  async function init() {
    const games = await discoverGames();
    const select = document.getElementById('game-select');
    games.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${g.name} (${g.variants.length} variants)`;
      select.appendChild(opt);
    });
    select.addEventListener('change', (e) => {
      if (e.target.value) selectGame(e.target.value);
    });
    document.getElementById('refresh').addEventListener('click', () => {
      if (activeGame) selectGame(activeGame);
    });
    document.getElementById('promote-btn').addEventListener('click', async () => {
      if (!selectedVariantId || !activeGame) return;
      // POST to backend (or local file system via CLI bridge)
      try {
        const res = await fetch('/api/promote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game: activeGame, variant: selectedVariantId }),
        });
        if (res.ok) {
          toast(`✓ Promoted ${activeGame}/${selectedVariantId} to live`);
        } else {
          toast(`✗ Promote failed — use CLI: slot-math promote ${activeGame} --variant ${selectedVariantId}`, '#ff6666');
        }
      } catch {
        // No backend available — show CLI fallback
        toast(`CLI: slot-math promote ${activeGame} --variant ${selectedVariantId}`, '#ffcc00');
      }
      setTimeout(refreshAuditLog, 500);
    });

    renderGrid();
  }

  init();
})();
