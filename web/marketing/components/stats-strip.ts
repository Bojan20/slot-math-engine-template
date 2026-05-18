/**
 * W214 Faza 800.1 Agent C — stats strip.
 *
 * Six headline numbers, single horizontal band. These are the same
 * proof points the one-pager and pitch deck lead with — kept here as
 * a single immutable export so updates land in one place.
 */

export interface StatItem {
  num: string;
  label: string;
}

export const DEFAULT_STATS: ReadonlyArray<StatItem> = Object.freeze([
  { num: '7,679', label: 'Vitest specs passing' },
  { num: '77', label: 'Closed-form solvers' },
  { num: '16 / 16', label: 'L&W mechanics covered' },
  { num: '15', label: 'Jurisdictions live' },
  { num: '4', label: 'Cert labs plugged' },
  { num: '8', label: 'Reference themes' },
]);

export function renderStatsStripHtml(
  items: ReadonlyArray<StatItem> = DEFAULT_STATS
): string {
  const tiles = items
    .map(
      (s) => `
        <div class="stat">
          <div class="num">${escape(s.num)}</div>
          <div class="lbl">${escape(s.label)}</div>
        </div>`
    )
    .join('');
  return `
    <section class="stats-strip" data-component="stats-strip" aria-label="Key metrics">
      <div class="grid">${tiles}</div>
    </section>`;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
