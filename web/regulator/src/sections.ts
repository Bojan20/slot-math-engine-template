// Regulator portal section renderers.

import type { Submission, SubmissionStatus, Jurisdiction } from '@shared/types.js';
import { filterSubmissions, sortBy } from '@shared/filters.js';
import { toCsv } from '@shared/csv.js';
import { el, clear, formatPct, formatDate } from '@shared/dom.js';
import { applyReview, makeSignature, REJECT_REASONS, type ReviewAction, type RejectReason } from './data.js';
import type { RegState } from './main.js';

const ALL_JURIS: Jurisdiction[] = ['UKGC','MGA','NV','NJ','PA','MI','ON','BC','AAMS','DGA','SGA','KSA','GBGA','SK','AGCO'];

// ───── Section 1: Submissions Queue ─────
export function renderQueue(host: HTMLElement, state: RegState, rerender: () => void): void {
  clear(host);
  host.appendChild(el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['Submissions Queue']),
      el('div', { className: 'crumb' }, [`${state.queue.length} submissions awaiting action · regulator ${state.regulatorId}`]),
    ]),
  ]));

  const fr = el('div', { className: 'filter-row' });
  const search = el('input', { placeholder: 'game / id / operator' }) as HTMLInputElement;
  search.value = state.filter.search ?? '';
  search.addEventListener('input', () => { state.filter.search = search.value; rerender(); });
  fr.appendChild(el('label', {}, ['Search', search]));

  const statusSel = el('select') as HTMLSelectElement;
  for (const s of ['any', 'pending', 'in_review', 'approved', 'rejected', 'needs_revision'] as const) {
    const o = el('option', { value: s }, [s]) as HTMLOptionElement;
    if (state.filter.status === s) o.selected = true;
    statusSel.appendChild(o);
  }
  statusSel.addEventListener('change', () => { state.filter.status = statusSel.value as SubmissionStatus | 'any'; rerender(); });
  fr.appendChild(el('label', {}, ['Status', statusSel]));

  const juriSel = el('select') as HTMLSelectElement;
  juriSel.appendChild(el('option', { value: 'any' }, ['any']));
  for (const j of ALL_JURIS) {
    const o = el('option', { value: j }, [j]) as HTMLOptionElement;
    if (state.filter.jurisdiction === j) o.selected = true;
    juriSel.appendChild(o);
  }
  juriSel.addEventListener('change', () => { state.filter.jurisdiction = juriSel.value as Jurisdiction | 'any'; rerender(); });
  fr.appendChild(el('label', {}, ['Jurisdiction', juriSel]));
  host.appendChild(fr);

  const tbl = el('table', { className: 'tbl' });
  const thead = el('thead');
  const tr = el('tr');
  for (const h of ['Submission', 'Game', 'Operator', 'Juris.', 'RTP', 'Status', 'Priority', 'Submitted']) tr.appendChild(el('th', {}, [h]));
  thead.appendChild(tr); tbl.appendChild(thead);

  const tbody = el('tbody');
  const filtered = sortBy(filterSubmissions(state.queue, state.filter), (s) => s.submittedAt, 'desc');
  for (const s of filtered) {
    const row = el('tr', { className: `is-clickable ${state.selectedId === s.submissionId ? 'is-selected' : ''}` });
    row.appendChild(el('td', { className: 'mono' }, [s.submissionId]));
    row.appendChild(el('td', {}, [s.gameName]));
    row.appendChild(el('td', {}, [s.operator]));
    row.appendChild(el('td', { className: 'mono' }, [s.jurisdiction]));
    row.appendChild(el('td', { className: 'mono' }, [formatPct(s.rtp)]));
    row.appendChild(el('td', {}, [el('span', { className: `status-pill ${s.status}` }, [s.status])]));
    row.appendChild(el('td', {}, [el('span', { className: `prio-pill ${s.priority}` }, [s.priority])]));
    row.appendChild(el('td', { className: 'mono' }, [formatDate(s.submittedAt)]));
    row.addEventListener('click', () => { state.selectedId = s.submissionId; state.currentSection = 'review'; rerender(); });
    tbody.appendChild(row);
  }
  tbl.appendChild(tbody);
  host.appendChild(tbl);
}

// ───── Section 2: Review Workflow ─────
export function renderReview(host: HTMLElement, state: RegState, rerender: () => void, toast: (m: string, k?: 'ok' | 'amber' | 'err') => void): void {
  clear(host);
  const sub = state.queue.find((s) => s.submissionId === state.selectedId);

  host.appendChild(el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['Review Workflow']),
      el('div', { className: 'crumb' }, [sub ? `Reviewing ${sub.submissionId} · ${sub.gameName}` : 'Select a submission from the queue']),
    ]),
  ]));

  if (!sub) {
    host.appendChild(el('p', { className: 'muted', style: 'padding:30px;text-align:center' }, ['No submission selected. Open the queue and click a row to begin review.']));
    return;
  }

  const panel = el('div', { className: 'review-panel' });
  panel.appendChild(el('h2', {}, [sub.gameName]));
  panel.appendChild(el('div', { className: 'muted' }, [`${sub.operator} · ${sub.jurisdiction} · submitted ${formatDate(sub.submittedAt)}`]));

  const grid = el('div', { className: 'review-grid' });
  for (const [lbl, val] of [
    ['Submission ID', sub.submissionId],
    ['Game ID', sub.gameId],
    ['Reported RTP', formatPct(sub.rtp)],
    ['Status', sub.status],
    ['Merkle root', sub.merkleRoot],
    ['Package size', `${sub.packageSizeKb} KB`],
    ['PAR sheet', sub.parSheetUrl],
    ['Reviewer', sub.reviewer ?? '—'],
  ] as const) {
    const cell = el('div', { className: 'cell' });
    cell.appendChild(el('div', { className: 'lbl' }, [lbl]));
    cell.appendChild(el('div', { className: 'val' }, [val]));
    grid.appendChild(cell);
  }
  panel.appendChild(grid);

  if (sub.notes) {
    panel.appendChild(el('div', { className: 'muted', style: 'margin-top:8px' }, [`Notes: ${sub.notes}`]));
  }

  const commentBox = el('textarea', { className: 'review-comment', placeholder: 'Reviewer comment (sent back to operator on Reject / Needs Revision)' }) as HTMLTextAreaElement;
  panel.appendChild(commentBox);

  const reasonSel = el('select') as HTMLSelectElement;
  reasonSel.style.marginTop = '10px';
  reasonSel.style.background = 'var(--bg-2)';
  reasonSel.style.border = '1px solid var(--line)';
  reasonSel.style.padding = '6px 10px';
  reasonSel.style.borderRadius = '3px';
  reasonSel.style.color = 'var(--text-0)';
  reasonSel.appendChild(el('option', { value: '' }, ['reject reason…']));
  for (const r of REJECT_REASONS) reasonSel.appendChild(el('option', { value: r }, [r]));
  panel.appendChild(reasonSel);

  const actions = el('div', { className: 'review-actions' });

  const approveBtn = el('button', { className: 'btn approve' }, ['Approve']);
  approveBtn.addEventListener('click', () => commitReview(sub, 'approve', state, rerender, toast));
  actions.appendChild(approveBtn);

  const revBtn = el('button', { className: 'btn amber' }, ['Request Revision']);
  revBtn.addEventListener('click', () => {
    const c = commentBox.value.trim();
    if (c.length === 0) { toast('Add a comment before requesting revision', 'amber'); return; }
    commitReview(sub, 'needs_revision', state, rerender, toast, c);
  });
  actions.appendChild(revBtn);

  const rejBtn = el('button', { className: 'btn reject' }, ['Reject']);
  rejBtn.addEventListener('click', () => {
    const reason = reasonSel.value as RejectReason | '';
    if (!reason) { toast('Pick a reject reason first', 'err'); return; }
    const c = `[${reason}] ${commentBox.value.trim()}`.trim();
    commitReview(sub, 'reject', state, rerender, toast, c);
  });
  actions.appendChild(rejBtn);

  panel.appendChild(actions);

  // Signature mock — shows on every action (visible post-commit).
  if (sub.status === 'approved' || sub.status === 'rejected' || sub.status === 'needs_revision') {
    const sig = makeSignature(state.regulatorId, sub.submissionId, sub.status === 'approved' ? 'approve' : sub.status === 'rejected' ? 'reject' : 'needs_revision');
    panel.appendChild(el('div', { className: 'review-signature' }, [`Digital signature (HSM mock): ${sig}`]));
  }

  host.appendChild(panel);
}

function commitReview(
  sub: Submission,
  action: ReviewAction,
  state: RegState,
  rerender: () => void,
  toast: (m: string, k?: 'ok' | 'amber' | 'err') => void,
  comment?: string,
): void {
  const updated = applyReview(sub, action, state.regulatorId, comment);
  const idx = state.queue.findIndex((s) => s.submissionId === sub.submissionId);
  if (idx >= 0) state.queue[idx] = updated;
  const kind: 'ok' | 'amber' | 'err' = action === 'approve' ? 'ok' : action === 'reject' ? 'err' : 'amber';
  toast(`Submission ${sub.submissionId} → ${updated.status}`, kind);
  rerender();
}

// ───── Section 3: Audit Access ─────
export function renderAudit(host: HTMLElement, state: RegState, rerender: () => void, toast: (m: string, k?: 'ok' | 'amber' | 'err') => void): void {
  clear(host);
  host.appendChild(el('div', { className: 'section-head' }, [
    el('div', {}, [
      el('h1', {}, ['Audit Access']),
      el('div', { className: 'crumb' }, ['Search submissions · download operator-package.zip · export CSV']),
    ]),
    el('div', { className: 'audit-actions' }, [
      makeCsvButton(state, toast),
    ]),
  ]));

  const fr = el('div', { className: 'filter-row' });
  const search = el('input', { placeholder: 'game / id / operator / merkle prefix' }) as HTMLInputElement;
  search.value = state.filter.search ?? '';
  search.addEventListener('input', () => { state.filter.search = search.value; rerender(); });
  fr.appendChild(el('label', {}, ['Search', search]));

  const statusSel = el('select') as HTMLSelectElement;
  for (const s of ['any', 'pending', 'in_review', 'approved', 'rejected', 'needs_revision'] as const) {
    const o = el('option', { value: s }, [s]) as HTMLOptionElement;
    if (state.filter.status === s) o.selected = true;
    statusSel.appendChild(o);
  }
  statusSel.addEventListener('change', () => { state.filter.status = statusSel.value as SubmissionStatus | 'any'; rerender(); });
  fr.appendChild(el('label', {}, ['Status', statusSel]));
  host.appendChild(fr);

  const tbl = el('table', { className: 'tbl' });
  const thead = el('thead');
  const tr = el('tr');
  for (const h of ['Submission', 'Game', 'Juris.', 'Status', 'Merkle', 'Pkg KB', 'Submitted', 'Action']) tr.appendChild(el('th', {}, [h]));
  thead.appendChild(tr); tbl.appendChild(thead);
  const tbody = el('tbody');
  const filtered = sortBy(filterSubmissions(state.queue, state.filter), (s) => s.submittedAt, 'desc');
  for (const s of filtered) {
    const row = el('tr');
    row.appendChild(el('td', { className: 'mono' }, [s.submissionId]));
    row.appendChild(el('td', {}, [s.gameName]));
    row.appendChild(el('td', { className: 'mono' }, [s.jurisdiction]));
    row.appendChild(el('td', {}, [el('span', { className: `status-pill ${s.status}` }, [s.status])]));
    row.appendChild(el('td', { className: 'mono' }, [s.merkleRoot]));
    row.appendChild(el('td', { className: 'mono' }, [String(s.packageSizeKb)]));
    row.appendChild(el('td', { className: 'mono' }, [formatDate(s.submittedAt)]));
    const dl = el('button', { className: 'btn' }, ['Download .zip']);
    dl.addEventListener('click', () => toast(`Streaming operator-package.zip for ${s.submissionId}`, 'ok'));
    row.appendChild(el('td', {}, [dl]));
    tbody.appendChild(row);
  }
  tbl.appendChild(tbody);
  host.appendChild(tbl);
}

function makeCsvButton(state: RegState, toast: (m: string, k?: 'ok' | 'amber' | 'err') => void): HTMLElement {
  const btn = el('button', { className: 'btn amber' }, ['Export CSV']);
  btn.addEventListener('click', () => {
    const csv = buildAuditCsv(state.queue);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported', 'ok');
  });
  return btn;
}

export function buildAuditCsv(rows: Submission[]): string {
  return toCsv(rows, [
    'submissionId',
    'gameId',
    'gameName',
    'operator',
    'jurisdiction',
    'rtp',
    'status',
    'priority',
    'submittedAt',
    'reviewer',
    'merkleRoot',
    'packageSizeKb',
  ]);
}
