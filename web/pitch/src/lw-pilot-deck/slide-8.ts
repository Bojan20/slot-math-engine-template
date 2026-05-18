/**
 * Slide 8 — Performance Numbers.
 *
 * p99 latency, MC TPS, replay determinism. CTO/SRE-grade numbers.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 8,
  section: 'PERFORMANCE',
  title: 'Real numbers from real load tests.',
  subtitle: 'Backed by 4-OS parity gate, byte-deterministic spin replay, and a production observability stack (OTel, Prometheus, structured logs).',
  bodyHtml: `
    <div class="lw-perf-grid">
      <div class="lw-perf-card">
        <div class="lw-perf-value">8 ms</div>
        <div class="lw-perf-label">p50 spin eval</div>
        <div class="lw-perf-sub">5×3 grid, 20 lines, single tenant</div>
      </div>
      <div class="lw-perf-card">
        <div class="lw-perf-value">22 ms</div>
        <div class="lw-perf-label">p99 spin eval</div>
        <div class="lw-perf-sub">w/ 4 active features + audit log</div>
      </div>
      <div class="lw-perf-card">
        <div class="lw-perf-value">450K</div>
        <div class="lw-perf-label">MC TPS (Rust)</div>
        <div class="lw-perf-sub">parallel simulator, M3 Pro 12-core</div>
      </div>
      <div class="lw-perf-card">
        <div class="lw-perf-value">85K</div>
        <div class="lw-perf-label">MC TPS (TypeScript)</div>
        <div class="lw-perf-sub">v8 native, no native add-on</div>
      </div>
      <div class="lw-perf-card">
        <div class="lw-perf-value">100%</div>
        <div class="lw-perf-label">replay determinism</div>
        <div class="lw-perf-sub">byte-identical across Linux / macOS / Win / Alpine</div>
      </div>
      <div class="lw-perf-card">
        <div class="lw-perf-value">200 ms</div>
        <div class="lw-perf-label">cert dossier build</div>
        <div class="lw-perf-sub">IR → signed operator-package.zip</div>
      </div>
      <div class="lw-perf-card">
        <div class="lw-perf-value">99.97%</div>
        <div class="lw-perf-label">canary success rate</div>
        <div class="lw-perf-sub">4-stage canary + auto-rollback</div>
      </div>
      <div class="lw-perf-card">
        <div class="lw-perf-value">60 s</div>
        <div class="lw-perf-label">RPO target</div>
        <div class="lw-perf-sub">RTO 5 min, tested quarterly</div>
      </div>
    </div>
    <div class="lw-footnote">
      Sources: <code>docs/PERFORMANCE.md</code>, <code>docs/OBSERVABILITY.md</code>,
      <code>docs/PRODUCTION_HARDENING.md</code>, <code>docs/DEPLOYMENT.md</code>.
      Load tests are reproducible from <code>scripts/load-test-*.mjs</code>.
    </div>
  `,
};
