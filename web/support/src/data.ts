// CORTI W206-ONBOARDING — support data loaders + filters.

import type { ApiComponent, KbArticle, KbData, TicketDraft } from './types.js';

export async function loadKb(): Promise<KbData> {
  // Vite serves static JSON from /data/. In tests this falls through
  // to the JSON imported by the test file.
  const res = await fetch('./data/kb.json');
  if (!res.ok) throw new Error(`kb.json load failed: ${res.status}`);
  return (await res.json()) as KbData;
}

export function searchArticles(articles: KbArticle[], query: string): KbArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return articles;
  return articles.filter((a) => {
    const hay = `${a.question} ${a.body} ${a.tags.join(' ')} ${a.category}`.toLowerCase();
    return hay.includes(q);
  });
}

export function filterByCategory(articles: KbArticle[], category: string): KbArticle[] {
  if (!category || category === 'All') return articles;
  return articles.filter((a) => a.category === category);
}

export function defaultTicketDraft(): TicketDraft {
  return {
    email: '',
    subject: '',
    category: 'Math engine',
    severity: 'normal',
    body: '',
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface TicketValidation {
  ok: boolean;
  errors: Partial<Record<keyof TicketDraft, string>>;
}

export function validateTicket(t: TicketDraft): TicketValidation {
  const errors: TicketValidation['errors'] = {};
  if (!t.email || !EMAIL_RE.test(t.email)) errors.email = 'Valid email required';
  if (!t.subject || t.subject.trim().length < 5) errors.subject = 'Subject must be at least 5 chars';
  if (!t.body || t.body.trim().length < 20) errors.body = 'Tell us a bit more (min 20 chars)';
  if (!t.category) errors.category = 'Category required';
  return { ok: Object.keys(errors).length === 0, errors };
}

export function makeTicketId(now: Date = new Date()): string {
  return `tk-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

/**
 * Probe each component's URL via fetch with a short timeout.
 * Returns a copy of `components` with status flipped to `degraded` or
 * `outage` based on response.
 */
export async function probeComponents(
  components: ApiComponent[],
  baseUrl: string = 'http://localhost:4000',
  fetchFn: typeof fetch = fetch
): Promise<ApiComponent[]> {
  const probe = async (c: ApiComponent): Promise<ApiComponent> => {
    try {
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 2500);
      const res = await fetchFn(`${baseUrl}${c.url}`, { signal: ac.signal });
      clearTimeout(tid);
      return { ...c, status: res.ok ? 'operational' : 'degraded' };
    } catch {
      return { ...c, status: 'outage' };
    }
  };
  return Promise.all(components.map(probe));
}

export function aggregateStatus(components: ApiComponent[]): 'operational' | 'degraded' | 'outage' {
  if (components.some((c) => c.status === 'outage')) return 'outage';
  if (components.some((c) => c.status === 'degraded')) return 'degraded';
  return 'operational';
}
