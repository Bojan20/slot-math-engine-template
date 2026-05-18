// W208 — LocaleSwitcher component.
//
// Header dropdown (ARIA listbox) showing flag-emoji + native locale
// name. Clicking a choice calls setLocale() — listeners registered via
// onLocaleChange() then re-render the rest of the UI.
//
// Design: matches v5 onyx+cyan palette. Active option gets a cyan
// accent dot + bold weight. Keyboard nav: Arrow keys to move highlight,
// Enter / Space to commit, Escape to close.

import {
  getCurrentLocale,
  getSupportedLocales,
  getLocaleDisplay,
  setLocale,
  onLocaleChange,
  t,
} from '../i18n/index.js';
import type { Locale } from '../i18n/types.js';

export interface LocaleSwitcherOptions {
  /** Optional callback invoked AFTER locale changes. Use to re-render. */
  onChange?: (locale: Locale) => void;
  /** Custom DOM id (default 'locale-switcher'). */
  id?: string;
}

export interface LocaleSwitcher {
  /** Root <div> element to mount into the header. */
  root: HTMLElement;
  /** Re-render after external state change. */
  refresh: () => void;
  /** Detach listeners — call on teardown. */
  destroy: () => void;
}

/**
 * Build the LocaleSwitcher. Caller mounts `root` into the persona-bar
 * or header. The component owns its own DOM + listeners, and registers
 * an onLocaleChange subscription so external setLocale() calls also
 * refresh the trigger label.
 */
export function createLocaleSwitcher(opts: LocaleSwitcherOptions = {}): LocaleSwitcher {
  const id = opts.id ?? 'locale-switcher';
  const root = document.createElement('div');
  root.className = 'locale-switcher';
  root.id = id;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'locale-switcher__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', t('tooltips.locale_switcher'));

  const listbox = document.createElement('ul');
  listbox.className = 'locale-switcher__listbox';
  listbox.setAttribute('role', 'listbox');
  listbox.hidden = true;

  root.append(trigger, listbox);

  function renderTrigger(): void {
    const cur = getCurrentLocale();
    const d = getLocaleDisplay(cur);
    trigger.textContent = `${d.flag} ${d.name}`;
    trigger.setAttribute('data-locale', cur);
  }

  function renderListbox(): void {
    listbox.innerHTML = '';
    const cur = getCurrentLocale();
    for (const loc of getSupportedLocales()) {
      const d = getLocaleDisplay(loc);
      const li = document.createElement('li');
      li.className = 'locale-switcher__option';
      li.setAttribute('role', 'option');
      li.setAttribute('data-locale', loc);
      li.setAttribute('tabindex', '-1');
      const active = loc === cur;
      li.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) li.classList.add('locale-switcher__option--active');
      li.innerHTML = `<span class="locale-switcher__flag">${d.flag}</span><span class="locale-switcher__name">${d.name}</span>`;
      li.addEventListener('click', () => choose(loc));
      listbox.appendChild(li);
    }
  }

  function openListbox(): void {
    listbox.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const first = listbox.querySelector<HTMLElement>('[aria-selected="true"]') ?? listbox.querySelector<HTMLElement>('[role="option"]');
    first?.focus();
  }

  function closeListbox(): void {
    listbox.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  }

  function choose(loc: Locale): void {
    setLocale(loc);
    closeListbox();
    opts.onChange?.(loc);
  }

  function moveHighlight(delta: 1 | -1): void {
    const options = Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]'));
    if (options.length === 0) return;
    const current = document.activeElement as HTMLElement | null;
    const idx = current ? options.indexOf(current) : -1;
    const next = options[(idx + delta + options.length) % options.length];
    next?.focus();
  }

  trigger.addEventListener('click', () => {
    if (listbox.hidden) {
      renderListbox();
      openListbox();
    } else {
      closeListbox();
    }
  });

  listbox.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      moveHighlight(1);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      moveHighlight(-1);
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      const focused = document.activeElement as HTMLElement | null;
      const loc = focused?.getAttribute('data-locale') as Locale | null;
      if (loc) choose(loc);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      closeListbox();
    }
  });

  // Click outside closes the dropdown.
  const docClickHandler = (ev: MouseEvent): void => {
    if (!listbox.hidden && !root.contains(ev.target as Node)) {
      closeListbox();
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('click', docClickHandler);
  }

  // External locale changes refresh trigger label.
  const unsub = onLocaleChange(() => {
    renderTrigger();
    renderListbox();
    trigger.setAttribute('aria-label', t('tooltips.locale_switcher'));
  });

  // Initial paint.
  renderTrigger();
  renderListbox();

  return {
    root,
    refresh: () => {
      renderTrigger();
      renderListbox();
    },
    destroy: () => {
      unsub();
      if (typeof document !== 'undefined') {
        document.removeEventListener('click', docClickHandler);
      }
      root.remove();
    },
  };
}
