// Regulator portal unit tests — focused on the review workflow logic,
// CSV export shape, queue filtering, and signature determinism.

import { describe, it, expect } from 'vitest';
import { filterSubmissions, sortBy } from '@shared/filters.js';
import { applyReview, makeSignature, REJECT_REASONS } from '../src/data.js';
import { buildAuditCsv } from '../src/sections.js';
import queueJson from '../data/mock-queue.json' assert { type: 'json' };
import type { Submission } from '@shared/types.js';

const QUEUE = queueJson.queue as Submission[];

describe('regulator · mock-queue integrity', () => {
  it('contains 15 submissions all with merkle root + par url', () => {
    expect(QUEUE.length).toBe(15);
    for (const s of QUEUE) {
      expect(s.merkleRoot).toMatch(/^0x/);
      expect(s.parSheetUrl).toMatch(/\.pdf$/);
      expect(s.rtp).toBeGreaterThan(0.85);
    }
  });
});

describe('regulator · submissions queue filter', () => {
  it('default filter returns whole queue', () => {
    expect(filterSubmissions(QUEUE, {}).length).toBe(QUEUE.length);
  });

  it('filters by status', () => {
    const r = filterSubmissions(QUEUE, { status: 'pending' });
    for (const s of r) expect(s.status).toBe('pending');
  });

  it('filters by jurisdiction', () => {
    const r = filterSubmissions(QUEUE, { jurisdiction: 'UKGC' });
    for (const s of r) expect(s.jurisdiction).toBe('UKGC');
  });

  it('search matches operator name', () => {
    const r = filterSubmissions(QUEUE, { search: 'L&W' });
    expect(r.length).toBeGreaterThan(0);
    for (const s of r) expect(s.operator.toLowerCase()).toContain('l&w');
  });

  it('sortBy submittedAt desc returns newest first', () => {
    const r = sortBy(QUEUE, (s) => s.submittedAt, 'desc');
    for (let i = 1; i < r.length; i++) expect(r[i - 1].submittedAt >= r[i].submittedAt).toBe(true);
  });
});

describe('regulator · review workflow', () => {
  it('approve transitions status to approved + tags reviewer', () => {
    const r = applyReview(QUEUE[0], 'approve', 'UKGC-03');
    expect(r.status).toBe('approved');
    expect(r.reviewer).toBe('UKGC-03');
  });

  it('reject transitions to rejected with comment captured in notes', () => {
    const r = applyReview(QUEUE[0], 'reject', 'UKGC-03', 'merkle verify failed');
    expect(r.status).toBe('rejected');
    expect(r.notes).toBe('merkle verify failed');
  });

  it('needs_revision tags status with operator-facing comment', () => {
    const r = applyReview(QUEUE[0], 'needs_revision', 'UKGC-03', 'resubmit with extended MC');
    expect(r.status).toBe('needs_revision');
    expect(r.notes).toBe('resubmit with extended MC');
  });

  it('preserves existing notes when no comment is provided', () => {
    const base = { ...QUEUE[0], notes: 'orig' };
    const r = applyReview(base, 'approve', 'UKGC-03');
    expect(r.notes).toBe('orig');
  });
});

describe('regulator · audit signature', () => {
  it('makeSignature is deterministic for same input + day', () => {
    const a = makeSignature('UKGC-03', 'sub-2026-0140', 'approve');
    const b = makeSignature('UKGC-03', 'sub-2026-0140', 'approve');
    expect(a).toBe(b);
    expect(a).toMatch(/^HSM-[0-9a-f]{8}-/);
  });

  it('changes when reviewer or action changes', () => {
    const a = makeSignature('UKGC-03', 'sub-x', 'approve');
    const b = makeSignature('UKGC-03', 'sub-x', 'reject');
    expect(a).not.toBe(b);
  });

  it('exposes finite reject-reason vocabulary', () => {
    expect(REJECT_REASONS.length).toBeGreaterThanOrEqual(5);
    expect(REJECT_REASONS).toContain('rtp-out-of-range');
  });
});

describe('regulator · CSV export', () => {
  it('header matches the documented column order', () => {
    const csv = buildAuditCsv(QUEUE);
    const header = csv.split('\n')[0];
    expect(header).toBe('submissionId,gameId,gameName,operator,jurisdiction,rtp,status,priority,submittedAt,reviewer,merkleRoot,packageSizeKb');
  });

  it('has one body row per queue entry', () => {
    const csv = buildAuditCsv(QUEUE);
    const lines = csv.split('\n');
    expect(lines.length).toBe(QUEUE.length + 1);
  });

  it('quotes operator names containing commas safely', () => {
    const fake: Submission = { ...QUEUE[0], operator: 'Acme, LLC' };
    const csv = buildAuditCsv([fake]);
    expect(csv).toContain('"Acme, LLC"');
  });
});
