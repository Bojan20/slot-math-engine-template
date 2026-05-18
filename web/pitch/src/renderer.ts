/**
 * CORTI W205-PITCH — slide renderer.
 *
 * Renders a single slide into the `.slide-frame` element. Stateless: the
 * caller drives state transitions in navigation.ts and calls renderSlide()
 * with the current Slide object. No reactive framework — plain string-based
 * DOM patching to keep the mini-app dependency-free.
 */

import type { Slide } from './types.js';

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderMetrics(slide: Slide): string {
  if (!slide.metrics || slide.metrics.length === 0) return '';
  const cols = slide.metrics.length >= 4 ? 'cols-4' : slide.metrics.length === 3 ? 'cols-3' : 'cols-2';
  const tiles = slide.metrics
    .map(
      (m) =>
        `<div class="metric"><div class="label">${escapeHtml(m.label)}</div><div class="value">${escapeHtml(m.value)}</div>${
          m.sub ? `<div class="sub">${escapeHtml(m.sub)}</div>` : ''
        }</div>`,
    )
    .join('');
  return `<div class="slide-grid ${cols}">${tiles}</div>`;
}

function renderBullets(slide: Slide): string {
  if (!slide.bullets || slide.bullets.length === 0) return '';
  const items = slide.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('');
  return `<ul class="slide-bullets">${items}</ul>`;
}

function renderBody(slide: Slide): string {
  if (!slide.body || slide.body.length === 0) return '';
  return slide.body.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
}

function renderCallout(slide: Slide): string {
  if (!slide.callout) return '';
  return `<div class="callout">${escapeHtml(slide.callout)}</div>`;
}

function renderChart(slide: Slide): string {
  if (!slide.chart) return '';
  // Chart SVG strings are trusted (compiled in charts.ts).
  const caption = slide.chartCaption ? `<div class="chart-caption">${escapeHtml(slide.chartCaption)}</div>` : '';
  return `<div class="chart-wrap">${slide.chart}${caption}</div>`;
}

function renderDemoLinks(slide: Slide): string {
  if (!slide.demoLinks || slide.demoLinks.length === 0) return '';
  const links = slide.demoLinks
    .map(
      (l) =>
        `<a class="demo-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">Live demo · ${escapeHtml(l.label)}</a>`,
    )
    .join('');
  return `<div class="demo-links">${links}</div>`;
}

function frameClass(slide: Slide): string {
  if (slide.kind === 'cover' || slide.kind === 'close') return 'slide-frame cover';
  if (slide.kind === 'hero') return 'slide-frame hero';
  return 'slide-frame';
}

export function renderSlide(slide: Slide): string {
  const eyebrow = `<div class="slide-eyebrow">${escapeHtml(slide.section)} · ${String(slide.index).padStart(2, '0')} of ${SLIDE_COUNT}</div>`;
  const title = `<h2 class="slide-title">${escapeHtml(slide.title)}</h2>`;
  const subtitle = slide.subtitle ? `<p class="slide-subtitle">${escapeHtml(slide.subtitle)}</p>` : '';
  const body = `<div class="slide-body">${renderBody(slide)}${renderCallout(slide)}${renderMetrics(slide)}${renderBullets(slide)}${renderChart(slide)}${renderDemoLinks(slide)}</div>`;
  return `<article class="${frameClass(slide)}">${eyebrow}${title}${subtitle}${body}</article>`;
}

// Updated at runtime by main.ts so renderSlide can show "N of M" without
// circular import from slides.ts.
let SLIDE_COUNT = 30;
export function setSlideCount(n: number): void { SLIDE_COUNT = n; }

export function renderOverview(slides: Slide[]): string {
  return slides
    .map(
      (s) =>
        `<button type="button" class="overview-card" data-index="${s.index - 1}" aria-label="Jump to slide ${s.index}"><div class="ov-num">${String(s.index).padStart(2, '0')} · ${escapeHtml(s.section)}</div><div class="ov-title">${escapeHtml(s.title)}</div></button>`,
    )
    .join('');
}

export function renderCounter(index: number, total: number): string {
  return `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
}
