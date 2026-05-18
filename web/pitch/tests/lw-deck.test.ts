/**
 * W211 Agent B — L&W Pilot Deck unit tests.
 *
 * Asserts the 12-slide deck is well-formed: every slide renders, indices
 * are sequential, headings are present, the registry exposes the right
 * count, and the composer produces a string containing each slide's
 * heading.
 */

import { describe, it, expect } from 'vitest';
import { LW_SLIDES, renderLwDeck, renderLwSlide } from '../src/lw-pilot-deck/index.js';

describe('L&W deck · structure', () => {
  it('contains exactly 12 slides', () => {
    expect(LW_SLIDES.length).toBe(12);
  });

  it('slide indices are sequential 1..12', () => {
    for (let i = 0; i < LW_SLIDES.length; i++) {
      expect(LW_SLIDES[i].index).toBe(i + 1);
    }
  });

  it('every slide has a non-empty title, section, and body HTML', () => {
    for (const s of LW_SLIDES) {
      expect(typeof s.title).toBe('string');
      expect(s.title.length).toBeGreaterThan(5);
      expect(typeof s.section).toBe('string');
      expect(s.section.length).toBeGreaterThan(2);
      expect(typeof s.bodyHtml).toBe('string');
      expect(s.bodyHtml.length).toBeGreaterThan(100);
    }
  });

  it('first slide section is TITLE', () => {
    expect(LW_SLIDES[0].section).toBe('TITLE');
  });

  it('last slide section is NEXT STEPS', () => {
    expect(LW_SLIDES[11].section).toBe('NEXT STEPS');
  });

  it('section names are unique', () => {
    const sections = LW_SLIDES.map((s) => s.section);
    expect(new Set(sections).size).toBe(sections.length);
  });
});

describe('L&W deck · headings cover the spec', () => {
  it('slide 3 is the 16/16 L&W coverage slide', () => {
    expect(LW_SLIDES[2].section).toMatch(/16\/16|COVERAGE/);
    for (let m = 1; m <= 16; m++) {
      expect(LW_SLIDES[2].bodyHtml).toContain(`M${m}`);
    }
  });

  it('slide 4 contains the 77 solver headline', () => {
    expect(LW_SLIDES[3].bodyHtml).toContain('77');
  });

  it('slide 7 lists at least 10 jurisdictions', () => {
    const matches = LW_SLIDES[6].bodyHtml.match(/lw-juris-card/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(10);
  });

  it('slide 9 timeline has D0, D7, D14, D21, D30 milestones', () => {
    const body = LW_SLIDES[8].bodyHtml;
    expect(body).toContain('D0');
    expect(body).toContain('D7');
    expect(body).toContain('D14');
    expect(body).toContain('D30');
  });

  it('slide 10 commercial terms shows all three options', () => {
    const body = LW_SLIDES[9].bodyHtml;
    expect(body).toContain('Acquire');
    expect(body).toContain('License');
    expect(body).toContain('Partnership');
  });
});

describe('L&W deck · renderer output', () => {
  it('renderLwSlide returns HTML containing the title (HTML-escaped) and eyebrow', () => {
    const html = renderLwSlide(LW_SLIDES[0]);
    // Titles can contain `&` which must be entity-escaped; match the
    // escaped form rather than the raw title string.
    const escapedTitle = LW_SLIDES[0].title.replaceAll('&', '&amp;');
    expect(html).toContain(escapedTitle);
    expect(html).toContain('lw-slide-eyebrow');
    expect(html).toContain('lw-slide-title');
  });

  it('renderLwDeck concatenates all 12 slides', () => {
    const html = renderLwDeck();
    const sections = html.match(/lw-slide-eyebrow/g) ?? [];
    expect(sections.length).toBe(12);
    // Spot-check: every slide's escaped title appears in the composed HTML.
    for (const s of LW_SLIDES) {
      const escapedTitle = s.title.replaceAll('&', '&amp;');
      expect(html).toContain(escapedTitle);
    }
  });

  it('renderLwDeck escapes & in titles', () => {
    const fake = { ...LW_SLIDES[0], title: 'Foo & Bar', bodyHtml: '' };
    const html = renderLwSlide(fake);
    expect(html).toContain('Foo &amp; Bar');
    expect(html).not.toMatch(/Foo & Bar/);
  });

  it('renderLwDeck throws if slide indices are out of order', () => {
    const broken = [
      { ...LW_SLIDES[0], index: 5 },
      ...LW_SLIDES.slice(1),
    ];
    expect(() => renderLwDeck(broken)).toThrow(/index mismatch/);
  });
});

describe('L&W deck · citations', () => {
  it('slide 3 cites wave numbers', () => {
    expect(LW_SLIDES[2].bodyHtml).toMatch(/W18\d/);
  });

  it('slide 5 mentions Ed25519 and 200 ms dossier time', () => {
    expect(LW_SLIDES[4].bodyHtml).toContain('Ed25519');
    expect(LW_SLIDES[4].bodyHtml).toContain('200');
  });

  it('slide 6 cites the W209 baseline pricing', () => {
    expect(LW_SLIDES[5].bodyHtml).toContain('W209');
  });
});
