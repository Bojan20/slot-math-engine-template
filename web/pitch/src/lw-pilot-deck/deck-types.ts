/**
 * W211 Agent B — L&W Pilot Deck shared types.
 *
 * Each slide module exports a single `slide` object of shape `LwSlide`.
 * The HTML composer in `lw-deck.html` builds the full deck by walking the
 * slides registry in `index.ts`.
 *
 * Visual palette = cyan (#00d9ff accent) + onyx (#0a0e14 background), same
 * design language as the W205 investor deck v5. Slides are static — no
 * runtime nav, no autoplay — they are linear sections of a sales document.
 */

export interface LwSlide {
  /** 1..12 slide index. */
  index: number;
  /** Eyebrow tag (small caps) — "01 · TITLE", "02 · 3-SLIDE REALITY", etc. */
  section: string;
  /** Primary heading. */
  title: string;
  /** Optional one-line subtitle / lede. */
  subtitle?: string;
  /** Inline HTML for the slide body. */
  bodyHtml: string;
}

/**
 * Wrap a slide body in a consistent shell so individual slide modules only
 * need to author the inner body markup. Headings + frame chrome are
 * supplied centrally.
 */
export function renderLwSlide(s: LwSlide): string {
  const eyebrow = `<div class="lw-slide-eyebrow">${escapeHtml(
    `${String(s.index).padStart(2, '0')} · ${s.section}`,
  )}</div>`;
  const title = `<h2 class="lw-slide-title">${escapeHtml(s.title)}</h2>`;
  const subtitle = s.subtitle
    ? `<p class="lw-slide-subtitle">${escapeHtml(s.subtitle)}</p>`
    : '';
  return `<section class="lw-slide" id="lw-slide-${s.index}" data-slide-index="${s.index}">
  ${eyebrow}
  ${title}
  ${subtitle}
  <div class="lw-slide-body">${s.bodyHtml}</div>
</section>`;
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
