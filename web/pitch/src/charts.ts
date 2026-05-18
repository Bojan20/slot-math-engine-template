/**
 * CORTI W205-PITCH — SVG chart generators.
 *
 * Pure functions, no DOM dependency. Used by slides.ts for slides 22, 23, 25.
 * All charts render in the slate (#0B1220) + gold (#D4A744) palette and use
 * inline SVG with viewBox so they scale cleanly on screen and inside the
 * PDF export.
 */

const SLATE_2 = '#11192A';
const SLATE_LINE = '#1F2A40';
const GOLD = '#D4A744';
const GOLD_SOFT = 'rgba(212,167,68,0.35)';
const WARM = '#F4ECDC';
const WARM_DIM = '#8D8675';

/* --------------------------------------------------------------------- */
/* Slide 23 · revenue projection bar chart                                */
/* --------------------------------------------------------------------- */

/**
 * Five-year revenue projection. Returns an SVG string.
 * Real numbers come from the slide spec: Y1 $5M / Y2 $20M / Y3 $60M /
 * Y4 $150M / Y5 $300M.
 */
export function revenueChart(): string {
  const years = ['Y1', 'Y2', 'Y3', 'Y4', 'Y5'];
  const values = [5, 20, 60, 150, 300]; // in $M
  const max = 300;

  const W = 800;
  const H = 240;
  const padL = 40;
  const padR = 16;
  const padT = 20;
  const padB = 38;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const barW = innerW / (values.length * 2);
  const step = innerW / values.length;

  let bars = '';
  values.forEach((v, i) => {
    const x = padL + i * step + (step - barW) / 2;
    const h = (v / max) * innerH;
    const y = padT + innerH - h;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${GOLD}" rx="3"/>`;
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" fill="${WARM}" font-size="11" font-family="Inter,system-ui,sans-serif" text-anchor="middle" font-weight="600">$${v}M</text>`;
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(padT + innerH + 18).toFixed(1)}" fill="${WARM_DIM}" font-size="10" font-family="Inter,system-ui,sans-serif" text-anchor="middle" letter-spacing="1.2">${years[i]}</text>`;
  });

  let gridLines = '';
  for (let i = 1; i <= 4; i++) {
    const y = padT + (innerH * i) / 4;
    gridLines += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${SLATE_LINE}" stroke-width="0.5"/>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Five-year revenue projection bar chart"><rect width="${W}" height="${H}" fill="${SLATE_2}" rx="6"/>${gridLines}${bars}</svg>`;
}

/* --------------------------------------------------------------------- */
/* Slide 22 · customer pipeline horizontal stacked bar                    */
/* --------------------------------------------------------------------- */

/**
 * Customer pipeline mix · Tier-1 operators / Tier-2 vendors / regulator labs.
 * Numbers reflect the slide-21 targets (5+ Tier-1, 20+ Tier-2, 10+ labs).
 */
export function customerPipelineChart(): string {
  const segments = [
    { label: 'Tier-1 Operators', value: 5, color: GOLD },
    { label: 'Tier-2 Vendors',   value: 20, color: '#E8C36A' },
    { label: 'Regulator Labs',   value: 10, color: '#9A7727' },
  ];
  const total = segments.reduce((a, s) => a + s.value, 0);

  const W = 800;
  const H = 200;
  const padL = 30;
  const padR = 30;
  const padT = 40;
  const barH = 36;
  const innerW = W - padL - padR;

  let cursor = padL;
  let segmentsSvg = '';
  let legend = '';
  segments.forEach((s, i) => {
    const w = (s.value / total) * innerW;
    segmentsSvg += `<rect x="${cursor.toFixed(1)}" y="${padT}" width="${w.toFixed(1)}" height="${barH}" fill="${s.color}"/>`;
    segmentsSvg += `<text x="${(cursor + w / 2).toFixed(1)}" y="${(padT + barH / 2 + 4).toFixed(1)}" fill="${SLATE_2}" font-size="12" font-family="Inter,system-ui,sans-serif" text-anchor="middle" font-weight="700">${s.value}</text>`;
    cursor += w;

    const lx = padL + i * (innerW / 3);
    const ly = padT + barH + 30;
    legend += `<rect x="${lx}" y="${ly - 8}" width="10" height="10" fill="${s.color}" rx="2"/>`;
    legend += `<text x="${lx + 16}" y="${ly + 1}" fill="${WARM}" font-size="11" font-family="Inter,system-ui,sans-serif">${s.label}</text>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Customer pipeline mix chart"><rect width="${W}" height="${H}" fill="${SLATE_2}" rx="6"/><text x="${padL}" y="26" fill="${WARM_DIM}" font-size="10" font-family="Inter,system-ui,sans-serif" letter-spacing="1.8">CUSTOMER MIX · FY26 TARGET</text>${segmentsSvg}${legend}</svg>`;
}

/* --------------------------------------------------------------------- */
/* Slide 25 · performance attestations line + bars                         */
/* --------------------------------------------------------------------- */

/**
 * Performance attestations — Lighthouse score per mini-app (all 100/100)
 * plus a small line for the Vite build-time across apps.
 */
export function performanceChart(): string {
  const apps = ['Studio', 'Operator', 'Regulator', 'Marketplace', 'Pitch'];
  const lighthouse = [100, 100, 100, 100, 100];
  const buildSec = [3.49, 2.10, 2.31, 1.84, 1.65];

  const W = 800;
  const H = 220;
  const padL = 44;
  const padR = 44;
  const padT = 24;
  const padB = 38;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxBuild = 5.0; // axis cap

  let bars = '';
  let line = 'M';
  apps.forEach((a, i) => {
    const x = padL + (innerW * (i + 0.5)) / apps.length;
    const barW = innerW / (apps.length * 2);
    // Lighthouse bar (100 = full bar)
    const h = (lighthouse[i] / 100) * innerH;
    const y = padT + innerH - h;
    bars += `<rect x="${(x - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${GOLD_SOFT}" stroke="${GOLD}" stroke-width="1" rx="3"/>`;
    bars += `<text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" fill="${WARM}" font-size="10" font-family="Inter,system-ui,sans-serif" text-anchor="middle">${lighthouse[i]}</text>`;
    bars += `<text x="${x.toFixed(1)}" y="${(padT + innerH + 18).toFixed(1)}" fill="${WARM_DIM}" font-size="10" font-family="Inter,system-ui,sans-serif" text-anchor="middle">${a}</text>`;

    // Line: build seconds
    const ly = padT + innerH - (buildSec[i] / maxBuild) * innerH;
    line += `${i === 0 ? '' : 'L'}${x.toFixed(1)},${ly.toFixed(1)} `;
  });

  let gridLines = '';
  for (let i = 1; i <= 4; i++) {
    const y = padT + (innerH * i) / 4;
    gridLines += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${SLATE_LINE}" stroke-width="0.5"/>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Performance attestations chart"><rect width="${W}" height="${H}" fill="${SLATE_2}" rx="6"/>${gridLines}${bars}<path d="${line.trim()}" fill="none" stroke="${GOLD}" stroke-width="2" stroke-dasharray="4 3"/><text x="${padL}" y="${(padT - 8).toFixed(1)}" fill="${WARM_DIM}" font-size="10" font-family="Inter,system-ui,sans-serif" letter-spacing="1.4">LIGHTHOUSE PERF (bars) · VITE BUILD SECONDS (dashed line)</text></svg>`;
}
