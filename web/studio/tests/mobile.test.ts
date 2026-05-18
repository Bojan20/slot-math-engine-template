// CORTI W207-MOBILE — mobile test suite.
//
// 12+ specs across PWA manifest, service worker registration, touch
// renderer math, Capacitor config validity, and responsive helpers.
// All tests run under node (no jsdom) — we stub the browser APIs we
// need inline so the suite stays self-contained.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(STUDIO_ROOT, '..', '..');

function setGlobal(key: string, value: unknown): void {
  vi.stubGlobal(key, value);
}

// ── Minimal browser stubs ──────────────────────────────────────────
interface MockNavigator {
  vibrate?: (pattern: number | number[]) => boolean;
  serviceWorker?: {
    register: (url: string, opts?: { scope?: string }) => Promise<MockSwRegistration>;
    getRegistration: (scope?: string) => Promise<MockSwRegistration | null>;
    controller: object | null;
    addEventListener: (event: string, handler: () => void) => void;
  };
  share?: (data: unknown) => Promise<void>;
  canShare?: (data: unknown) => boolean;
  clipboard?: { writeText: (t: string) => Promise<void> };
  connection?: { saveData?: boolean; effectiveType?: string };
  standalone?: boolean;
}

interface MockSwRegistration {
  scope: string;
  active: object | null;
  installing: object | null;
  waiting: object | null;
  sync?: { register: (tag: string) => Promise<void> };
}

interface CapturedShare {
  payload: unknown;
}

function freshNavigator(opts: Partial<MockNavigator> = {}): MockNavigator {
  return {
    vibrate: () => true,
    serviceWorker: {
      register: async () => ({ scope: './', active: {}, installing: null, waiting: null }),
      getRegistration: async () => null,
      controller: null,
      addEventListener: () => undefined,
    },
    ...opts,
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── 1. PWA manifest ────────────────────────────────────────────────
describe('PWA manifest', () => {
  const raw = readFileSync(path.join(STUDIO_ROOT, 'manifest.webmanifest'), 'utf8');

  it('parses as valid JSON', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('declares the required PWA fields', () => {
    const m = JSON.parse(raw);
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(m.display).toBe('standalone');
    expect(m.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(m.background_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('ships at least 5 icons including a maskable variant', () => {
    const m = JSON.parse(raw);
    expect(Array.isArray(m.icons)).toBe(true);
    expect(m.icons.length).toBeGreaterThanOrEqual(5);
    const maskable = m.icons.find((i: { purpose?: string }) => i.purpose === 'maskable');
    expect(maskable).toBeDefined();
    // Confirm we hit the required 4 specific sizes.
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    for (const sz of ['192x192', '256x256', '384x384', '512x512']) {
      expect(sizes).toContain(sz);
    }
  });

  it('categorises the app for the OS install picker', () => {
    const m = JSON.parse(raw);
    expect(m.categories).toContain('utilities');
    expect(m.categories).toContain('games');
  });
});

// ── 2. Service worker source ───────────────────────────────────────
describe('Service worker source', () => {
  const sw = readFileSync(path.join(STUDIO_ROOT, 'service-worker.js'), 'utf8');

  it('registers install / activate / fetch lifecycle handlers', () => {
    expect(sw).toMatch(/addEventListener\(['"]install['"]/);
    expect(sw).toMatch(/addEventListener\(['"]activate['"]/);
    expect(sw).toMatch(/addEventListener\(['"]fetch['"]/);
  });

  it('declares a versioned cache name and shell pre-cache list', () => {
    expect(sw).toMatch(/SW_VERSION/);
    expect(sw).toMatch(/SHELL_ASSETS/);
    expect(sw).toMatch(/index\.html/);
    expect(sw).toMatch(/manifest\.webmanifest/);
  });

  it('handles background-sync queue draining', () => {
    expect(sw).toMatch(/addEventListener\(['"]sync['"]/);
    expect(sw).toMatch(/QUEUE_SAVE/);
    expect(sw).toMatch(/drain-save-queue/);
  });

  it('emits SW_UPDATED message on activation', () => {
    expect(sw).toMatch(/SW_UPDATED/);
  });
});

// ── 3. PWA module — runtime behaviour ──────────────────────────────
describe('PWA bridge runtime', () => {
  it('returns null SW registration when serviceWorker unavailable', async () => {
    setGlobal('navigator', {});
    const { registerServiceWorker } = await import('../src/pwa.js');
    const reg = await registerServiceWorker();
    expect(reg).toBeNull();
  });

  it('detects reduced data via saveData flag', async () => {
    setGlobal('navigator', { connection: { saveData: true } });
    const { reducedData } = await import('../src/pwa.js');
    expect(reducedData()).toBe(true);
  });

  it('detects reduced data via 2G connection', async () => {
    setGlobal('navigator', { connection: { effectiveType: '2g' } });
    const { reducedData } = await import('../src/pwa.js');
    expect(reducedData()).toBe(true);
  });

  it('returns false from reducedData when no connection info', async () => {
    setGlobal('navigator', {});
    const { reducedData } = await import('../src/pwa.js');
    expect(reducedData()).toBe(false);
  });

  it('detects standalone via iOS navigator.standalone', async () => {
    setGlobal('window', { matchMedia: () => ({ matches: false }), navigator: { standalone: true } });
    setGlobal('navigator', { standalone: true });
    const { isStandalone } = await import('../src/pwa.js');
    expect(isStandalone()).toBe(true);
  });

  it('detects standalone via display-mode media query', async () => {
    (globalThis as Record<string, unknown>).window = {
      matchMedia: (q: string) => ({ matches: q.includes('standalone') }),
    };
    setGlobal('navigator', {});
    const { isStandalone } = await import('../src/pwa.js');
    expect(isStandalone()).toBe(true);
  });

  it('falls back to clipboard when share API is unavailable', async () => {
    const seen: CapturedShare = { payload: null };
    setGlobal('window', {
      navigator: {
        clipboard: {
          writeText: async (t: string) => {
            seen.payload = t;
          },
        },
      },
    });
    setGlobal('navigator', {
      clipboard: {
        writeText: async (t: string) => {
          seen.payload = t;
        },
      },
    });
    const { share } = await import('../src/pwa.js');
    const ok = await share({ text: 'hello-mobile' });
    expect(ok).toBe(true);
    expect(seen.payload).toBe('hello-mobile');
  });
});

// ── 4. Touch renderer ──────────────────────────────────────────────
describe('Touch renderer gestures', () => {
  it('classifies a horizontal swipe as right-direction', async () => {
    const { classifyGesture } = await import('../src/touch-renderer.js');
    const g = classifyGesture(
      { id: 1, x: 50, y: 100, t: 0 },
      { id: 1, x: 200, y: 110, t: 200 },
    );
    expect(g.kind).toBe('swipe');
    if (g.kind === 'swipe') {
      expect(g.direction).toBe('right');
      expect(g.distancePx).toBeGreaterThan(40);
    }
  });

  it('classifies a vertical down-flick as a spin trigger', async () => {
    const { classifyGesture } = await import('../src/touch-renderer.js');
    const g = classifyGesture(
      { id: 1, x: 100, y: 50, t: 0 },
      { id: 1, x: 100, y: 200, t: 250 },
    );
    expect(g.kind).toBe('swipe');
    if (g.kind === 'swipe') expect(g.direction).toBe('down');
  });

  it('classifies a static long hold as longpress', async () => {
    const { classifyGesture } = await import('../src/touch-renderer.js');
    const g = classifyGesture(
      { id: 1, x: 100, y: 100, t: 0 },
      { id: 1, x: 103, y: 102, t: 800 },
    );
    expect(g.kind).toBe('longpress');
  });

  it('classifies a quick tap correctly', async () => {
    const { classifyGesture } = await import('../src/touch-renderer.js');
    const g = classifyGesture(
      { id: 1, x: 100, y: 100, t: 0 },
      { id: 1, x: 102, y: 101, t: 120 },
    );
    expect(g.kind).toBe('tap');
  });

  it('reports no gesture for stalled mid-distance motion', async () => {
    const { classifyGesture } = await import('../src/touch-renderer.js');
    const g = classifyGesture(
      { id: 1, x: 100, y: 100, t: 0 },
      { id: 1, x: 120, y: 120, t: 250 },
    );
    expect(g.kind).toBe('none');
  });

  it('computes pinch scale > 1 for two-pointer spread', async () => {
    const { pinchScale } = await import('../src/touch-renderer.js');
    const s = pinchScale(
      { id: 1, x: 0, y: 0, t: 0 },
      { id: 2, x: 200, y: 0, t: 0 },
      { id: 1, x: 0, y: 0, t: 0 },
      { id: 2, x: 100, y: 0, t: 0 },
    );
    expect(s).toBeCloseTo(2, 2);
  });

  it('computes pinch scale < 1 for two-pointer pinch', async () => {
    const { pinchScale } = await import('../src/touch-renderer.js');
    const s = pinchScale(
      { id: 1, x: 0, y: 0, t: 0 },
      { id: 2, x: 50, y: 0, t: 0 },
      { id: 1, x: 0, y: 0, t: 0 },
      { id: 2, x: 200, y: 0, t: 0 },
    );
    expect(s).toBeCloseTo(0.25, 2);
  });

  it('scales win-line stroke width with device pixel ratio', async () => {
    const { winLineWidth } = await import('../src/touch-renderer.js');
    const a = winLineWidth(1);
    const b = winLineWidth(2);
    const c = winLineWidth(3);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThanOrEqual(b);
    expect(c).toBeLessThanOrEqual(8); // clamp
  });

  it('haptic returns false when navigator.vibrate is missing', async () => {
    setGlobal('navigator', {});
    const { haptic } = await import('../src/touch-renderer.js');
    expect(haptic('spin')).toBe(false);
  });

  it('haptic returns true when navigator.vibrate exists', async () => {
    let called: number | number[] | null = null;
    setGlobal('navigator', {
      vibrate: (ms: number | number[]) => {
        called = ms;
        return true;
      },
    });
    const { haptic } = await import('../src/touch-renderer.js');
    const ok = haptic('win');
    expect(ok).toBe(true);
    expect(called).toBe(60);
  });

  it('attach() returns a detach function that unbinds listeners', async () => {
    let bound = 0;
    let unbound = 0;
    const el = {
      addEventListener() {
        bound++;
      },
      removeEventListener() {
        unbound++;
      },
    } as unknown as HTMLElement;
    const { createTouchRenderer } = await import('../src/touch-renderer.js');
    const tr = createTouchRenderer();
    const detach = tr.attach(el, {});
    expect(bound).toBeGreaterThan(0);
    detach();
    expect(unbound).toBeGreaterThan(0);
    expect(unbound).toBe(bound);
  });
});

// ── 5. Capacitor config ────────────────────────────────────────────
describe('Capacitor config', () => {
  const cfgPath = path.join(REPO_ROOT, 'mobile', 'capacitor.config.json');
  const raw = readFileSync(cfgPath, 'utf8');
  const cfg = JSON.parse(raw);

  it('parses as JSON', () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('declares appId / appName / webDir', () => {
    expect(cfg.appId).toBe('com.vanvinkl.slotstudio');
    expect(cfg.appName).toBeTruthy();
    expect(cfg.webDir).toMatch(/web\/studio/);
  });

  it('registers SplashScreen, StatusBar, Haptics, Share plugins', () => {
    expect(cfg.plugins.SplashScreen).toBeDefined();
    expect(cfg.plugins.StatusBar).toBeDefined();
    expect(cfg.plugins.Haptics).toBeDefined();
    expect(cfg.plugins.Share).toBeDefined();
  });

  it('uses HTTPS scheme on android (no cleartext)', () => {
    expect(cfg.server.androidScheme).toBe('https');
    expect(cfg.server.cleartext).toBe(false);
  });

  it('locks iOS WebView to app-bound domains', () => {
    expect(cfg.ios.limitsNavigationsToAppBoundDomains).toBe(true);
  });
});

// ── 6. CSS responsive checks ───────────────────────────────────────
describe('Responsive CSS', () => {
  const css = readFileSync(path.join(STUDIO_ROOT, 'styles.css'), 'utf8');

  it('contains a phone breakpoint media query', () => {
    expect(css).toMatch(/@media \(max-width:\s*767px\)/);
  });

  it('contains a tablet-and-phone breakpoint media query', () => {
    expect(css).toMatch(/@media \(max-width:\s*1023px\)/);
  });

  it('honours coarse-pointer hit-area requirements', () => {
    expect(css).toMatch(/@media \(pointer:\s*coarse\)/);
    expect(css).toMatch(/min-height:\s*40px/);
  });

  it('adds the W207 bottom-bar / drawer styling hooks', () => {
    expect(css).toMatch(/\.w207-bottom-bar/);
    expect(css).toMatch(/\.w207-drawer/);
  });
});

// ── 7. index.html PWA wiring ──────────────────────────────────────
describe('index.html PWA wiring', () => {
  const html = readFileSync(path.join(STUDIO_ROOT, 'index.html'), 'utf8');

  it('links the manifest', () => {
    expect(html).toMatch(/<link[^>]+rel="manifest"[^>]+href="manifest\.webmanifest"/);
  });

  it('sets theme-color and viewport for mobile', () => {
    expect(html).toMatch(/<meta name="theme-color" content="#22D3EE"/);
    expect(html).toMatch(/viewport-fit=cover/);
  });

  it('declares apple-touch-icon and apple-mobile-web-app-capable', () => {
    expect(html).toMatch(/apple-touch-icon/);
    expect(html).toMatch(/apple-mobile-web-app-capable/);
  });
});

// ── 8. docs/MOBILE.md presence ────────────────────────────────────
describe('Mobile documentation', () => {
  const docPath = path.join(REPO_ROOT, 'docs', 'MOBILE.md');
  const raw = readFileSync(docPath, 'utf8');

  it('exists and is non-empty', () => {
    expect(raw.length).toBeGreaterThan(500);
  });

  it('documents the npm scripts entry points', () => {
    expect(raw).toMatch(/mobile:sync/);
    expect(raw).toMatch(/mobile:ios/);
    expect(raw).toMatch(/mobile:android/);
  });

  it('explains the Capacitor compile path', () => {
    expect(raw).toMatch(/Capacitor/);
    expect(raw).toMatch(/cap sync/);
  });
});
