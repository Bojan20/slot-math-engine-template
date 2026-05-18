// CORTI W206-ONBOARDING — support renderers.

import { el, clear } from '@shared/dom.js';
import type { SupportState } from './types.js';
import {
  searchArticles,
  filterByCategory,
  defaultTicketDraft,
  validateTicket,
  makeTicketId,
  probeComponents,
  aggregateStatus,
} from './data.js';

type Toast = (msg: string, kind?: 'ok' | 'warn' | 'err') => void;

export function renderKb(host: HTMLElement, state: SupportState, rerender: () => void): void {
  clear(host);

  host.appendChild(headBlock('Knowledge Base', `${state.kb.articles.length} articles across ${state.kb.categories.length} categories`));

  // search
  const bar = el('div', { className: 'search-bar' });
  const input = el('input', { placeholder: 'Search the knowledge base…' }) as HTMLInputElement;
  input.value = state.search;
  input.addEventListener('input', () => {
    state.search = input.value;
    rerender();
  });
  bar.appendChild(input);
  host.appendChild(bar);

  // category tabs
  const tabs = el('div', { className: 'kb-cat-tabs' });
  const allTab = el('button', { className: `kb-cat-tab ${!state.filterCategory || state.filterCategory === 'All' ? 'is-active' : ''}` }, ['All']);
  allTab.addEventListener('click', () => { state.filterCategory = 'All'; rerender(); });
  tabs.appendChild(allTab);
  for (const c of state.kb.categories) {
    const tab = el('button', { className: `kb-cat-tab ${state.filterCategory === c ? 'is-active' : ''}` }, [c]);
    tab.addEventListener('click', () => { state.filterCategory = c; rerender(); });
    tabs.appendChild(tab);
  }
  host.appendChild(tabs);

  // articles
  const filtered = filterByCategory(searchArticles(state.kb.articles, state.search), state.filterCategory);
  const grid = el('div', { className: 'kb-grid' });
  if (filtered.length === 0) {
    grid.appendChild(el('div', { className: 'kb-card' }, ['No matching articles. Try a different keyword or category.']));
  }
  for (const a of filtered) {
    const card = el('div', { className: 'kb-card' });
    card.appendChild(el('h3', {}, [a.question]));
    card.appendChild(el('div', { className: 'meta' }, [`${a.category} · updated ${a.lastUpdated}`]));
    if (state.expandedId === a.id) {
      card.appendChild(el('div', { className: 'body' }, [a.body]));
    }
    card.addEventListener('click', () => {
      state.expandedId = state.expandedId === a.id ? null : a.id;
      rerender();
    });
    grid.appendChild(card);
  }
  host.appendChild(grid);
}

export function renderTicket(host: HTMLElement, state: SupportState, rerender: () => void, toast: Toast): void {
  clear(host);
  host.appendChild(headBlock('Submit a ticket', 'Average first response under 24h on Pro. Include reproduction steps for fastest triage.'));

  const card = el('div', { className: 'card' });

  const form = el('form') as HTMLFormElement;

  // email
  const emailField = makeField('email', 'Your email', 'email', state.ticket.email, (v) => { state.ticket.email = v; });
  form.appendChild(emailField);

  // subject
  form.appendChild(makeField('subject', 'Subject', 'text', state.ticket.subject, (v) => { state.ticket.subject = v; }));

  // category
  const catField = el('label', { className: 'field' });
  catField.appendChild(el('span', {}, ['Category']));
  const catSel = el('select') as HTMLSelectElement;
  for (const c of state.kb.categories) {
    const o = el('option', { value: c }, [c]) as HTMLOptionElement;
    if (state.ticket.category === c) o.selected = true;
    catSel.appendChild(o);
  }
  catSel.addEventListener('change', () => { state.ticket.category = catSel.value; });
  catField.appendChild(catSel);
  form.appendChild(catField);

  // severity
  const sevField = el('label', { className: 'field' });
  sevField.appendChild(el('span', {}, ['Severity']));
  const sevSel = el('select') as HTMLSelectElement;
  for (const s of ['low', 'normal', 'high', 'urgent'] as const) {
    const o = el('option', { value: s }, [s]) as HTMLOptionElement;
    if (state.ticket.severity === s) o.selected = true;
    sevSel.appendChild(o);
  }
  sevSel.addEventListener('change', () => { state.ticket.severity = sevSel.value as TicketDraftSeverity; });
  sevField.appendChild(sevSel);
  form.appendChild(sevField);

  // body
  const bodyField = el('label', { className: 'field' });
  bodyField.appendChild(el('span', {}, ['Describe the issue']));
  const ta = el('textarea') as HTMLTextAreaElement;
  ta.value = state.ticket.body;
  ta.addEventListener('input', () => { state.ticket.body = ta.value; });
  bodyField.appendChild(ta);
  form.appendChild(bodyField);

  const submit = el('button', { className: 'btn primary', type: 'submit', style: 'width:100%;' }, ['Submit ticket']);
  form.appendChild(submit);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = validateTicket(state.ticket);
    if (!v.ok) {
      toast(`Fix: ${Object.values(v.errors).join(' / ')}`, 'warn');
      return;
    }
    const id = makeTicketId();
    state.submittedTickets.push({ id, subject: state.ticket.subject, submittedAt: new Date().toISOString() });
    state.ticket = defaultTicketDraft();
    toast(`Ticket ${id} submitted. We will reply to your email.`, 'ok');
    rerender();
  });

  card.appendChild(form);

  // recent submissions
  if (state.submittedTickets.length > 0) {
    const list = el('div', { style: 'margin-top:24px;' });
    list.appendChild(el('h3', { style: 'margin:0 0 8px;font-size:14px;' }, ['Recently submitted']));
    for (const t of state.submittedTickets) {
      const row = el('div', { className: 'incident resolved' });
      row.appendChild(el('h4', {}, [t.subject]));
      row.appendChild(el('div', { className: 'meta' }, [`${t.id} · ${t.submittedAt}`]));
      list.appendChild(row);
    }
    card.appendChild(list);
  }

  host.appendChild(card);
}

type TicketDraftSeverity = 'low' | 'normal' | 'high' | 'urgent';

function makeField(name: string, label: string, type: string, value: string, onInput: (v: string) => void): HTMLElement {
  const wrap = el('label', { className: 'field' });
  wrap.appendChild(el('span', {}, [label]));
  const input = el('input', { name, type }) as HTMLInputElement;
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  wrap.appendChild(input);
  return wrap;
}

export function renderStatus(host: HTMLElement, state: SupportState, rerender: () => void): void {
  clear(host);
  host.appendChild(headBlock('System Status', 'Live health of every customer-facing component.'));

  const refresh = el('div', { style: 'margin-bottom:14px;text-align:right;' });
  const btn = el('button', { className: 'btn' }, ['Refresh probes']);
  btn.addEventListener('click', async () => {
    btn.textContent = 'Probing…';
    state.kb.components = await probeComponents(state.kb.components);
    rerender();
  });
  refresh.appendChild(btn);
  host.appendChild(refresh);

  const grid = el('div', { className: 'status-grid' });
  for (const c of state.kb.components) {
    const row = el('div', { className: `status-row ${c.status}` });
    row.appendChild(el('div', { className: 'name' }, [c.name]));
    row.appendChild(el('div', { className: 'meta' }, [c.status.toUpperCase()]));
    row.appendChild(el('div', { className: 'dot' }, []));
    grid.appendChild(row);
  }
  host.appendChild(grid);

  // Aggregate status pill
  const pill = document.getElementById('sp-status-pill');
  if (pill) {
    const agg = aggregateStatus(state.kb.components);
    pill.textContent = agg === 'operational' ? 'All systems operational' : agg === 'degraded' ? 'Degraded' : 'Outage';
    pill.className = `env-pill ${agg === 'operational' ? '' : agg === 'degraded' ? 'warn' : 'err'}`;
  }

  // Incidents
  host.appendChild(el('h3', { style: 'margin-top: 28px;' }, ['Recent incidents']));
  if (state.kb.incidents.length === 0) {
    host.appendChild(el('p', { style: 'color:var(--text-2);' }, ['No incidents in the last 90 days.']));
  }
  for (const i of state.kb.incidents) {
    const node = el('div', { className: `incident ${i.status === 'resolved' ? 'resolved' : ''}` });
    node.appendChild(el('h4', {}, [i.title]));
    node.appendChild(el('div', { className: 'meta' }, [
      `${i.id} · ${i.status} · opened ${i.openedAt}${i.resolvedAt ? ` · resolved ${i.resolvedAt}` : ''}`,
    ]));
    node.appendChild(el('p', { style: 'margin:8px 0 0;font-size:13px;color:var(--text-1);' }, [i.summary]));
    host.appendChild(node);
  }
}

function headBlock(title: string, sub: string): HTMLElement {
  const head = el('div', { className: 'section-head' });
  head.appendChild(el('h1', {}, [title]));
  head.appendChild(el('p', {}, [sub]));
  return head;
}
