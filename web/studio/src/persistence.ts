// localStorage adapter — serialises the studio workspace state on a 30s
// timer, on critical edits, and on tab-visibility hide. Restore on load
// is best-effort: if the stored shape is incompatible (schema drift), we
// silently discard rather than crashing the UI.

import type { StudioPersistedState } from './types.js';

const KEY = 'studio-state-v1';
const AUTO_SAVE_MS = 30_000;

export interface PersistenceCallbacks {
  serialise: () => StudioPersistedState;
  apply: (s: StudioPersistedState) => void;
  onSaved?: (atMs: number) => void;
}

export class Persistence {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSavedAt = 0;

  constructor(private cb: PersistenceCallbacks) {}

  start(): void {
    this.timer = setInterval(() => this.save('timer'), AUTO_SAVE_MS);
    // Save on tab hide too — covers refresh / close.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save('visibility');
    });
  }

  save(reason: 'timer' | 'edit' | 'visibility' | 'manual'): boolean {
    try {
      const data = this.cb.serialise();
      localStorage.setItem(KEY, JSON.stringify(data));
      this.lastSavedAt = Date.now();
      this.cb.onSaved?.(this.lastSavedAt);
      void reason;
      return true;
    } catch (err) {
      // Quota exceeded, private mode, etc. — swallow and warn once.
      console.warn('[studio] persistence save failed:', err);
      return false;
    }
  }

  restore(): boolean {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as StudioPersistedState;
      if (!parsed || parsed.schemaVersion !== 1) return false;
      if (!parsed.workspaces || !parsed.activeWorkspaceId) return false;
      this.cb.apply(parsed);
      this.lastSavedAt = parsed.lastSavedAt ?? 0;
      return true;
    } catch (err) {
      console.warn('[studio] persistence restore failed:', err);
      return false;
    }
  }

  getLastSavedAt(): number {
    return this.lastSavedAt;
  }

  clear(): void {
    localStorage.removeItem(KEY);
  }
}
