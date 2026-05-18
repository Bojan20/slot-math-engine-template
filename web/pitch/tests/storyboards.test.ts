/**
 * W211 Agent B — Storyboards unit tests.
 *
 * Asserts that 3 storyboards exist with correct shape, each has scenes,
 * each markdown/HTML renderer produces the expected anchors.
 */

import { describe, it, expect } from 'vitest';
import {
  STORYBOARDS,
  renderStoryboardMd,
  renderStoryboardHtml,
} from '../src/storyboards/index.js';

describe('storyboards · registry', () => {
  it('contains exactly 3 storyboards', () => {
    expect(STORYBOARDS.length).toBe(3);
  });

  it('each storyboard has unique slug + title + audience', () => {
    const slugs = STORYBOARDS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(3);
    for (const sb of STORYBOARDS) {
      expect(sb.title.length).toBeGreaterThan(5);
      expect(sb.audience.length).toBeGreaterThan(5);
      expect(sb.duration.length).toBeGreaterThan(2);
      expect(sb.goal.length).toBeGreaterThan(20);
    }
  });

  it('30sec storyboard has at least 5 scenes', () => {
    const sb = STORYBOARDS.find((s) => s.slug === '30sec-elevator')!;
    expect(sb.scenes.length).toBeGreaterThanOrEqual(5);
  });

  it('5min storyboard has at least 8 scenes', () => {
    const sb = STORYBOARDS.find((s) => s.slug === '5min-deep')!;
    expect(sb.scenes.length).toBeGreaterThanOrEqual(8);
  });

  it('90min storyboard has at least 12 scenes (12 slides + opens/closes)', () => {
    const sb = STORYBOARDS.find((s) => s.slug === '90min-board')!;
    expect(sb.scenes.length).toBeGreaterThanOrEqual(12);
  });
});

describe('storyboards · scene shape', () => {
  it('every scene has cue + visual + dialogue', () => {
    for (const sb of STORYBOARDS) {
      for (const sc of sb.scenes) {
        expect(sc.cue.length).toBeGreaterThan(1);
        expect(sc.visual.length).toBeGreaterThan(10);
        expect(sc.dialogue.length).toBeGreaterThan(10);
      }
    }
  });

  it('30sec storyboard has at least one ASCII frame', () => {
    const sb = STORYBOARDS.find((s) => s.slug === '30sec-elevator')!;
    const withAscii = sb.scenes.filter((sc) => sc.ascii && sc.ascii.length > 0);
    expect(withAscii.length).toBeGreaterThanOrEqual(1);
  });

  it('every storyboard has Q&A bullets', () => {
    for (const sb of STORYBOARDS) {
      expect(sb.qa.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('storyboards · markdown / HTML rendering', () => {
  it('renderStoryboardMd contains H1 + audience + each scene', () => {
    const sb = STORYBOARDS[0];
    const md = renderStoryboardMd(sb);
    expect(md).toContain(`# ${sb.title}`);
    expect(md).toContain('**Audience:**');
    expect(md).toContain('**Goal:**');
    for (const sc of sb.scenes) {
      expect(md).toContain(sc.cue);
    }
  });

  it('renderStoryboardHtml emits storyboard-{slug} id and scenes', () => {
    const sb = STORYBOARDS[1];
    const html = renderStoryboardHtml(sb);
    expect(html).toContain(`id="lw-sb-${sb.slug}"`);
    expect(html).toContain('lw-sb-scene');
    // Count only the per-scene anchor (`lw-sb-scene"`) so the container
    // class `lw-sb-scenes` doesn't double-match.
    expect((html.match(/lw-sb-scene"/g) ?? []).length).toBe(sb.scenes.length);
  });

  it('renderStoryboardHtml escapes HTML in dialogue', () => {
    const sb = {
      ...STORYBOARDS[0],
      scenes: [
        ...STORYBOARDS[0].scenes,
        { cue: 'T+99', visual: 'x', dialogue: 'a <b> & "c"' },
      ],
    };
    const html = renderStoryboardHtml(sb);
    expect(html).toContain('a &lt;b&gt; &amp; &quot;c&quot;');
  });
});
