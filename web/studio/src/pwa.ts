// CORTI W207-MOBILE — PWA bootstrap.
//
// Responsibilities
// ────────────────
//   1. Register `service-worker.js` (idempotent, dev-mode safe).
//   2. Capture the `beforeinstallprompt` event and expose a deferred
//      install prompt the studio UI can trigger from the share/menu.
//   3. Expose a thin Web-Share / Share-Target API so designers can
//      send a built IR straight from their phone to the studio.
//   4. Provide a helper for picking files via the mobile file picker
//      (image/document upload for GDD import).
//   5. Detect reduced-data conditions and broadcast a flag so the
//      renderer can lazy-load expensive assets / skip animations.
//
// The module is environment-defensive: every browser API touched is
// behind a `typeof` guard so unit tests under Node never blow up. The
// resulting bridge is parked on `window.__studio_pwa__`.

export interface PwaBridge {
  /** True if a service worker controls this page. */
  controlled: boolean;
  /** True if the `beforeinstallprompt` event has fired and not yet been resolved. */
  installAvailable: boolean;
  /** True when the document is currently in standalone display mode. */
  isStandalone: boolean;
  /** Resolves with the user's choice or `null` if no prompt is queued. */
  promptInstall(): Promise<'accepted' | 'dismissed' | null>;
  /** Web Share API — share an IR/text/url; falls back to clipboard. */
  share(payload: { title?: string; text?: string; url?: string; files?: File[] }): Promise<boolean>;
  /** Open the native mobile file picker (camera/gallery on iOS/Android). */
  pickFile(accept?: string, capture?: 'environment' | 'user' | null): Promise<File | null>;
  /** True when the device prefers reduced data (Save-Data / metered). */
  reducedData: boolean;
  /** Subscribe to update notifications (new SW version available). */
  onUpdate(listener: (version: string) => void): () => void;
  /** Subscribe to controller-changed events. */
  onControllerChange(listener: () => void): () => void;
  /** Queue an auto-save payload to the SW background-sync. */
  queueSave(payload: unknown): boolean;
}

interface DeferredInstallPrompt {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const updateListeners = new Set<(v: string) => void>();
const controllerListeners = new Set<() => void>();

let deferredPrompt: DeferredInstallPrompt | null = null;
let installAvailable = false;
let controlled = false;

function safeWindow(): (Window & typeof globalThis) | null {
  return typeof window === 'undefined' ? null : (window as Window & typeof globalThis);
}

function safeNavigator(): Navigator | null {
  const w = safeWindow();
  if (w && 'navigator' in w && w.navigator) return w.navigator;
  if (typeof navigator !== 'undefined') return navigator;
  return null;
}

export function isStandalone(): boolean {
  const w = safeWindow();
  if (!w) return false;
  // iOS Safari uses `navigator.standalone`; everything else honours the
  // CSS media query.
  const iosStandalone = (safeNavigator() as unknown as { standalone?: boolean })?.standalone;
  if (iosStandalone) return true;
  try {
    return w.matchMedia?.('(display-mode: standalone)').matches ?? false;
  } catch {
    return false;
  }
}

export function reducedData(): boolean {
  const n = safeNavigator() as unknown as { connection?: { saveData?: boolean; effectiveType?: string } };
  if (!n || !n.connection) return false;
  if (n.connection.saveData) return true;
  // Treat 2G / slow-2G as reduced-data hints too.
  const eff = n.connection.effectiveType ?? '';
  return eff === '2g' || eff === 'slow-2g';
}

/**
 * In dev mode Vite serves files dynamically and we don't want the SW
 * caching stale assets (a previously-registered SW from a build preview
 * can otherwise pin old HTML/CSS to the page and produce ghost layouts
 * after a refresh).  This helper tears down any registration + clears
 * caches so dev sessions always reflect the live source on disk.
 */
async function unregisterAllAndClearCaches(): Promise<void> {
  const nav = safeNavigator();
  if (!nav || !('serviceWorker' in nav)) return;
  try {
    const regs = await nav.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  } catch {
    /* ignore */
  }
  const w = safeWindow();
  const cacheStore = (w as unknown as { caches?: CacheStorage })?.caches;
  if (cacheStore) {
    try {
      const keys = await cacheStore.keys();
      await Promise.all(keys.map((k) => cacheStore.delete(k).catch(() => false)));
    } catch {
      /* ignore */
    }
  }
}

/**
 * True when the studio is running under Vite's dev server. We intentionally
 * keep SW registration *off* in dev — the dev server already provides hot
 * reload, and an active SW would re-serve cached responses and shadow source
 * changes.  Falls back to a hostname heuristic for environments where
 * `import.meta.env` is unavailable (e.g. plain `file://` previews).
 */
function isDevEnvironment(): boolean {
  try {
    const env = (import.meta as unknown as { env?: { DEV?: boolean; MODE?: string } }).env;
    if (env && (env.DEV === true || env.MODE === 'development')) return true;
  } catch {
    /* ignore */
  }
  const w = safeWindow();
  const host = w?.location?.hostname ?? '';
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
}

/**
 * Register the studio service worker. Idempotent — returns the existing
 * registration if one is already active.
 *
 * In dev mode this is a no-op: it actively *unregisters* any leftover SW
 * and clears caches so refreshes always reflect the source on disk.
 */
export async function registerServiceWorker(
  swUrl = './service-worker.js',
  scope = './',
): Promise<ServiceWorkerRegistration | null> {
  const nav = safeNavigator();
  if (!nav || !('serviceWorker' in nav)) return null;

  if (isDevEnvironment()) {
    await unregisterAllAndClearCaches();
    return null;
  }

  try {
    const reg =
      (await nav.serviceWorker.getRegistration(scope)) ??
      (await nav.serviceWorker.register(swUrl, { scope, type: 'classic' }));
    controlled = nav.serviceWorker.controller !== null;
    nav.serviceWorker.addEventListener('controllerchange', () => {
      controlled = nav.serviceWorker.controller !== null;
      for (const fn of controllerListeners) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
    });
    nav.serviceWorker.addEventListener('message', (ev) => {
      const data = ev.data;
      if (data && typeof data === 'object' && data.type === 'SW_UPDATED' && typeof data.version === 'string') {
        for (const fn of updateListeners) {
          try {
            fn(data.version);
          } catch {
            /* ignore */
          }
        }
      }
    });
    return reg;
  } catch (err) {
    console.warn('[studio·pwa] SW registration failed:', err);
    return null;
  }
}

/**
 * Capture and stash the `beforeinstallprompt` event so the install
 * affordance can fire later (i.e. from a "Install studio" menu button).
 */
function installPromptCapture(): void {
  const w = safeWindow();
  if (!w) return;
  w.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as unknown as DeferredInstallPrompt;
    installAvailable = true;
  });
  w.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installAvailable = false;
  });
}

/** Fire the deferred install prompt and surface the user's choice. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
  if (!deferredPrompt) return null;
  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installAvailable = false;
    return choice.outcome;
  } catch {
    return 'dismissed';
  }
}

/**
 * Share a payload via the Web Share API. When unavailable, falls back
 * to writing the JSON onto the clipboard so the user can paste it.
 */
export async function share(payload: {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}): Promise<boolean> {
  const nav = safeNavigator() as unknown as {
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
    clipboard?: { writeText(t: string): Promise<void> };
  };
  if (nav?.share) {
    try {
      if (payload.files && payload.files.length > 0) {
        if (nav.canShare?.({ files: payload.files })) {
          await nav.share(payload);
          return true;
        }
      } else {
        await nav.share(payload);
        return true;
      }
    } catch {
      /* fall through to clipboard */
    }
  }
  if (nav?.clipboard) {
    try {
      const text = payload.text ?? payload.url ?? payload.title ?? '';
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Open the mobile file picker. On phones, `capture` lets the caller
 * select between front/back camera as the implicit source — handy when
 * uploading a photo of a paper GDD whiteboard sketch.
 */
export function pickFile(
  accept = '.pdf,.docx,.xlsx,.csv,.md,.json,.txt,image/*',
  capture: 'environment' | 'user' | null = null,
): Promise<File | null> {
  return new Promise((resolve) => {
    const doc = typeof document === 'undefined' ? null : document;
    if (!doc) {
      resolve(null);
      return;
    }
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.style.position = 'fixed';
    input.style.left = '-1000px';
    input.addEventListener(
      'change',
      () => {
        const f = input.files?.[0] ?? null;
        input.remove();
        resolve(f);
      },
      { once: true },
    );
    // Some browsers don't fire 'change' on cancel; resolve on focus-return.
    const w = safeWindow();
    const onFocus = (): void => {
      setTimeout(() => {
        if (input.files?.length === 0) {
          input.remove();
          resolve(null);
        }
        w?.removeEventListener('focus', onFocus);
      }, 300);
    };
    w?.addEventListener('focus', onFocus);
    doc.body.appendChild(input);
    input.click();
  });
}

function queueSave(payload: unknown): boolean {
  const nav = safeNavigator();
  if (!nav || !('serviceWorker' in nav)) return false;
  const sw = nav.serviceWorker.controller;
  if (!sw) return false;
  try {
    sw.postMessage({ type: 'QUEUE_SAVE', payload });
    return true;
  } catch {
    return false;
  }
}

function onUpdate(listener: (version: string) => void): () => void {
  updateListeners.add(listener);
  return () => updateListeners.delete(listener);
}

function onControllerChange(listener: () => void): () => void {
  controllerListeners.add(listener);
  return () => controllerListeners.delete(listener);
}

declare global {
  interface Window {
    __studio_pwa__?: PwaBridge;
  }
}

/** Boot the PWA layer. Call this once at studio startup. */
export function installPwa(): PwaBridge {
  installPromptCapture();
  // Don't await — SW registration shouldn't block the main thread.
  void registerServiceWorker();

  const bridge: PwaBridge = {
    get controlled() {
      return controlled;
    },
    get installAvailable() {
      return installAvailable;
    },
    get isStandalone() {
      return isStandalone();
    },
    promptInstall,
    share,
    pickFile,
    get reducedData() {
      return reducedData();
    },
    onUpdate,
    onControllerChange,
    queueSave,
  };

  const w = safeWindow();
  if (w) {
    w.__studio_pwa__ = bridge;
  }
  return bridge;
}

export default installPwa;
