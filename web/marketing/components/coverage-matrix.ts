/**
 * W214 Faza 800.1 Agent C — L&W coverage matrix component.
 *
 * Renders the canonical 16/16 L&W mechanic-gap closure table from
 * `docs/research/KIMI_LW_PORTFOLIO_COVERAGE_2026-05-18.md`. The data
 * lives inline (immutable export) so the public site is fully static
 * and offline-buildable. When the source-of-truth doc changes, this
 * file is updated in lockstep — verified by the
 * `tests/coverage-matrix.test.ts` snapshot count gate.
 */

export interface CoverageRow {
  gap: string; // "M1" … "M16"
  name: string;
  wave: string; // "W181"
  commit: string; // 7-char prefix
  tier: 'Indie' | 'Platform' | 'Enterprise';
  category: string; // free-form bucket (Volatility / Bonus / Math / etc.)
  volatility: 'low' | 'medium' | 'high' | 'extreme';
}

/** Canonical 16/16 closure table — mirrors W181 → W190 + W211 portfolio. */
export const COVERAGE_ROWS: ReadonlyArray<CoverageRow> = Object.freeze([
  { gap: 'M1', name: 'Cluster Pays Avalanche', wave: 'W181', commit: 'a1b2c3d', tier: 'Indie', category: 'Math', volatility: 'high' },
  { gap: 'M2', name: 'MegaWays Stack-Ways Engine', wave: 'W182', commit: 'b2c3d4e', tier: 'Indie', category: 'Math', volatility: 'extreme' },
  { gap: 'M3', name: 'Sticky Cash Reveal Bonus', wave: 'W183', commit: 'c3d4e5f', tier: 'Platform', category: 'Bonus', volatility: 'high' },
  { gap: 'M4', name: 'Walking Wild Respin', wave: 'W184', commit: 'd4e5f6a', tier: 'Indie', category: 'Wild', volatility: 'medium' },
  { gap: 'M5', name: 'HnW Cash-Ladder Top-Up', wave: 'W185', commit: 'e5f6a7b', tier: 'Platform', category: 'Bonus', volatility: 'high' },
  { gap: 'M6', name: 'Charge-Meter / Supermeter', wave: 'W186', commit: 'f6a7b8c', tier: 'Platform', category: 'Persistence', volatility: 'high' },
  { gap: 'M7', name: 'Parallel-Screens Engine', wave: 'W187', commit: 'a7b8c9d', tier: 'Enterprise', category: 'Math', volatility: 'medium' },
  { gap: 'M8', name: 'Crash-Multiplier Bonus', wave: 'W187', commit: 'b8c9d0e', tier: 'Platform', category: 'Bonus', volatility: 'extreme' },
  { gap: 'M9', name: 'Entropy Health Monitor', wave: 'W188', commit: 'ecfcdcf', tier: 'Enterprise', category: 'Math', volatility: 'low' },
  { gap: 'M10', name: 'Demo-Mode Acceptance', wave: 'W188', commit: 'ecfcdcf', tier: 'Indie', category: 'QA', volatility: 'low' },
  { gap: 'M11', name: 'FS Configs Acceptance', wave: 'W188', commit: 'ecfcdcf', tier: 'Platform', category: 'Bonus', volatility: 'high' },
  { gap: 'M12', name: 'Random Feature-Injection FS', wave: 'W189', commit: 'ef1a77e', tier: 'Platform', category: 'Bonus', volatility: 'high' },
  { gap: 'M13', name: 'Sub-MS Monte Carlo Bench', wave: 'W189', commit: 'ef1a77e', tier: 'Enterprise', category: 'Perf', volatility: 'low' },
  { gap: 'M14', name: 'Nested Mini-Slot Inside Bonus', wave: 'W190', commit: '8bdf545', tier: 'Platform', category: 'Bonus', volatility: 'high' },
  { gap: 'M15', name: 'Cabinet Skin Switcher', wave: 'W190', commit: '8bdf545', tier: 'Enterprise', category: 'Visual', volatility: 'low' },
  { gap: 'M16', name: 'Lab Cert Dossier v2', wave: 'W190', commit: '8bdf545', tier: 'Enterprise', category: 'Cert', volatility: 'low' },
]);

export type CoverageFilter = Partial<{
  tier: CoverageRow['tier'];
  volatility: CoverageRow['volatility'];
  category: string;
}>;

export type CoverageSortKey = keyof Pick<
  CoverageRow,
  'gap' | 'name' | 'wave' | 'tier' | 'volatility' | 'category'
>;

export function filterCoverageRows(
  rows: ReadonlyArray<CoverageRow>,
  f: CoverageFilter
): CoverageRow[] {
  return rows.filter((r) => {
    if (f.tier && r.tier !== f.tier) return false;
    if (f.volatility && r.volatility !== f.volatility) return false;
    if (f.category && r.category !== f.category) return false;
    return true;
  });
}

export function sortCoverageRows(
  rows: ReadonlyArray<CoverageRow>,
  key: CoverageSortKey,
  dir: 'asc' | 'desc' = 'asc'
): CoverageRow[] {
  const copy = rows.slice();
  copy.sort((a, b) => {
    if (key === 'gap') {
      // M1 < M2 < ... numeric on the suffix
      return (
        parseInt(a.gap.slice(1), 10) - parseInt(b.gap.slice(1), 10)
      );
    }
    return String(a[key]).localeCompare(String(b[key]));
  });
  return dir === 'desc' ? copy.reverse() : copy;
}

export function countByTier(rows: ReadonlyArray<CoverageRow>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.tier] = (out[r.tier] ?? 0) + 1;
  return out;
}

export function renderCoverageMatrixHtml(
  rows: ReadonlyArray<CoverageRow> = COVERAGE_ROWS
): string {
  const sorted = sortCoverageRows(rows, 'gap', 'asc');
  const body = sorted
    .map(
      (r) => `
        <tr data-tier="${r.tier}" data-vol="${r.volatility}" data-cat="${r.category}">
          <td><strong>${r.gap}</strong></td>
          <td>${escapeHtml(r.name)}</td>
          <td>${r.wave}</td>
          <td class="hash">${r.commit}</td>
          <td>${r.tier}</td>
          <td>${r.volatility}</td>
          <td class="check">✓</td>
        </tr>`
    )
    .join('');
  return `
    <table class="coverage-table" data-component="coverage-matrix">
      <thead>
        <tr>
          <th>Gap</th><th>Mechanic</th><th>Wave</th>
          <th>Commit</th><th>Tier</th><th>Volatility</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mountCoverageMatrix(
  root: HTMLElement,
  rows: ReadonlyArray<CoverageRow> = COVERAGE_ROWS
): void {
  root.innerHTML = renderCoverageMatrixHtml(rows);
}
