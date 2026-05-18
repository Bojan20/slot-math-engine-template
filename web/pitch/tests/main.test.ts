/**
 * CORTI W205-PITCH — investor deck unit tests.
 *
 * Covers slides definitions, navigation reducer, renderer output, and the
 * PDF export. Runs in Node (no jsdom) — the renderer is string-based and
 * the PDF export returns a Uint8Array, both of which can be asserted on
 * directly.
 */

import { describe, it, expect } from 'vitest';
import { SLIDES } from '../src/slides.js';
import {
  createDeck,
  next,
  prev,
  goTo,
  toggleOverview,
  togglePresenter,
  toggleAutoplay,
  reduceKey,
  tickAutoplay,
} from '../src/navigation.js';
import { renderSlide, renderOverview, renderCounter, setSlideCount } from '../src/renderer.js';
import { exportDeck } from '../src/pdf-export.js';
import { revenueChart, customerPipelineChart, performanceChart } from '../src/charts.js';

setSlideCount(SLIDES.length);

describe('pitch · SLIDES shape', () => {
  it('contains exactly 30 slides', () => {
    expect(SLIDES.length).toBe(30);
  });

  it('every slide has a title, section, layout and speaker notes', () => {
    for (const s of SLIDES) {
      expect(typeof s.title).toBe('string');
      expect(s.title.length).toBeGreaterThan(0);
      expect(typeof s.section).toBe('string');
      expect(s.section.length).toBeGreaterThan(0);
      expect(typeof s.layout).toBe('string');
      expect(typeof s.notes).toBe('string');
      expect(s.notes.length).toBeGreaterThan(8);
    }
  });

  it('slide indices are sequential 1..30', () => {
    for (let i = 0; i < SLIDES.length; i++) {
      expect(SLIDES[i].index).toBe(i + 1);
    }
  });

  it('first slide is a cover, last slide is a close', () => {
    expect(SLIDES[0].kind).toBe('cover');
    expect(SLIDES[29].kind).toBe('close');
  });

  it('slides 22, 23, 25 include a chart SVG', () => {
    for (const idx of [22, 23, 25]) {
      const s = SLIDES[idx - 1];
      expect(s.chart).toBeDefined();
      expect(s.chart!.startsWith('<svg')).toBe(true);
    }
  });

  it('slides with live demo links use http URLs', () => {
    const withLinks = SLIDES.filter((s) => s.demoLinks && s.demoLinks.length > 0);
    expect(withLinks.length).toBeGreaterThanOrEqual(4);
    for (const s of withLinks) {
      for (const l of s.demoLinks!) {
        expect(l.url.startsWith('http')).toBe(true);
        expect(l.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('every section label appears in the deck', () => {
    const sections = new Set(SLIDES.map((s) => s.section));
    expect(sections.size).toBeGreaterThanOrEqual(20);
  });
});

describe('pitch · navigation reducer', () => {
  it('next advances by 1 and clamps at the end', () => {
    let d = createDeck(SLIDES);
    expect(d.current).toBe(0);
    d = next(d);
    expect(d.current).toBe(1);
    d = goTo(d, SLIDES.length - 1);
    d = next(d);
    expect(d.current).toBe(SLIDES.length - 1);
  });

  it('prev rewinds by 1 and clamps at zero', () => {
    let d = createDeck(SLIDES);
    d = goTo(d, 5);
    d = prev(d);
    expect(d.current).toBe(4);
    d = goTo(d, 0);
    d = prev(d);
    expect(d.current).toBe(0);
  });

  it('goTo clamps out-of-range indices', () => {
    let d = createDeck(SLIDES);
    d = goTo(d, -10);
    expect(d.current).toBe(0);
    d = goTo(d, 9999);
    expect(d.current).toBe(SLIDES.length - 1);
  });

  it('toggleOverview / togglePresenter / toggleAutoplay flip flags', () => {
    let d = createDeck(SLIDES);
    expect(d.overview).toBe(false);
    d = toggleOverview(d);
    expect(d.overview).toBe(true);
    d = toggleOverview(d);
    expect(d.overview).toBe(false);

    d = togglePresenter(d);
    expect(d.presenter).toBe(true);
    d = togglePresenter(d);
    expect(d.presenter).toBe(false);

    d = toggleAutoplay(d);
    expect(d.autoplay).toBe(true);
    d = toggleAutoplay(d);
    expect(d.autoplay).toBe(false);
  });

  it('reduceKey handles arrow keys, escape, F, space, A', () => {
    let d = createDeck(SLIDES);
    d = reduceKey(d, 'ArrowRight')!;
    expect(d.current).toBe(1);
    d = reduceKey(d, 'ArrowLeft')!;
    expect(d.current).toBe(0);
    d = reduceKey(d, ' ')!;
    expect(d.current).toBe(1);
    d = reduceKey(d, 'Escape')!;
    expect(d.overview).toBe(true);
    d = reduceKey(d, 'f')!;
    expect(d.presenter).toBe(true);
    d = reduceKey(d, 'A')!;
    expect(d.autoplay).toBe(true);
    expect(reduceKey(d, 'q')).toBeNull();
  });

  it('Home / End jump to first / last slide', () => {
    let d = createDeck(SLIDES);
    d = reduceKey(d, 'End')!;
    expect(d.current).toBe(SLIDES.length - 1);
    d = reduceKey(d, 'Home')!;
    expect(d.current).toBe(0);
  });

  it('tickAutoplay advances while autoplay is on and disables at end', () => {
    let d = createDeck(SLIDES);
    d = toggleAutoplay(d);
    const a = tickAutoplay(d);
    expect(a.next.current).toBe(1);
    expect(a.wrapped).toBe(false);

    const last = goTo(d, SLIDES.length - 1);
    const b = tickAutoplay(last);
    expect(b.wrapped).toBe(true);
    expect(b.next.autoplay).toBe(false);
  });

  it('tickAutoplay is a no-op when autoplay is off', () => {
    const d = createDeck(SLIDES);
    const r = tickAutoplay(d);
    expect(r.next.current).toBe(0);
    expect(r.wrapped).toBe(false);
  });
});

describe('pitch · renderer (string-based, no DOM)', () => {
  it('renderSlide returns markup containing the slide title and eyebrow', () => {
    const html = renderSlide(SLIDES[0]);
    expect(html).toContain(SLIDES[0].title);
    expect(html).toContain('slide-frame');
    expect(html).toContain('slide-eyebrow');
  });

  it('renderSlide escapes HTML special characters in titles', () => {
    const fake = { ...SLIDES[0], title: 'Foo <bar> & "baz"' };
    const html = renderSlide(fake);
    expect(html).toContain('Foo &lt;bar&gt; &amp; &quot;baz&quot;');
    expect(html).not.toContain('<bar>');
  });

  it('renderSlide includes metrics tiles when present', () => {
    const slide = SLIDES.find((s) => s.metrics && s.metrics.length > 0)!;
    const html = renderSlide(slide);
    for (const m of slide.metrics!) {
      expect(html).toContain(m.value);
      expect(html).toContain(m.label);
    }
  });

  it('renderSlide includes demo link anchors for slides that define them', () => {
    const slide = SLIDES.find((s) => s.demoLinks && s.demoLinks.length > 0)!;
    const html = renderSlide(slide);
    for (const l of slide.demoLinks!) {
      expect(html).toContain(`href="${l.url}"`);
      expect(html).toContain('demo-link');
    }
  });

  it('renderOverview returns one card per slide', () => {
    const html = renderOverview(SLIDES);
    const matches = html.match(/overview-card/g) ?? [];
    expect(matches.length).toBe(SLIDES.length);
  });

  it('renderCounter formats two-digit zero-padded counters', () => {
    expect(renderCounter(0, 30)).toBe('01 / 30');
    expect(renderCounter(11, 30)).toBe('12 / 30');
    expect(renderCounter(29, 30)).toBe('30 / 30');
  });
});

describe('pitch · charts', () => {
  it('revenueChart returns an SVG with five labelled bars', () => {
    const svg = revenueChart();
    expect(svg.startsWith('<svg')).toBe(true);
    for (const year of ['Y1', 'Y2', 'Y3', 'Y4', 'Y5']) expect(svg).toContain(year);
    expect(svg).toContain('$300M');
  });

  it('customerPipelineChart returns an SVG with three segments + legend', () => {
    const svg = customerPipelineChart();
    expect(svg).toContain('Tier-1 Operators');
    expect(svg).toContain('Tier-2 Vendors');
    expect(svg).toContain('Regulator Labs');
  });

  it('performanceChart includes all five mini-app labels', () => {
    const svg = performanceChart();
    for (const app of ['Studio', 'Operator', 'Regulator', 'Marketplace', 'Pitch']) {
      expect(svg).toContain(app);
    }
  });
});

describe('pitch · PDF export', () => {
  it('exportDeck returns a non-empty Uint8Array starting with the %PDF header', async () => {
    const bytes = await exportDeck(SLIDES);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(2_000);
    const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    expect(header).toBe('%PDF');
  }, 30_000);

  it('exportDeck { includeNotes: true } produces a larger PDF', async () => {
    const a = await exportDeck(SLIDES);
    const b = await exportDeck(SLIDES, { includeNotes: true });
    expect(b.byteLength).toBeGreaterThan(a.byteLength);
  }, 60_000);
});
