// Regulator-side mock-data loader + review workflow helpers.

import type { Submission, SubmissionStatus } from '@shared/types.js';

interface QueuePayload { queue: Submission[] }

export async function loadQueue(): Promise<Submission[]> {
  const res = await fetch('./data/mock-queue.json');
  if (!res.ok) throw new Error(`failed to load queue: HTTP ${res.status}`);
  const j = (await res.json()) as QueuePayload;
  return j.queue;
}

// Build a mock HSM-style digital signature for audit-log preview.
// We deliberately keep this deterministic — no crypto network call — so
// the displayed signature is identical across reloads for the same input.
export function makeSignature(reviewer: string, submissionId: string, action: ReviewAction): string {
  const stamp = `${reviewer}|${submissionId}|${action}|${new Date().toISOString().slice(0, 10)}`;
  let h = 5381 >>> 0;
  for (let i = 0; i < stamp.length; i++) h = (((h << 5) + h) ^ stamp.charCodeAt(i)) >>> 0;
  return `HSM-${h.toString(16).padStart(8, '0')}-${stamp.length.toString(16)}`;
}

export type ReviewAction = 'approve' | 'reject' | 'needs_revision';

export function applyReview(sub: Submission, action: ReviewAction, reviewer: string, comment?: string): Submission {
  const next: SubmissionStatus =
    action === 'approve'         ? 'approved' :
    action === 'reject'          ? 'rejected' : 'needs_revision';
  return {
    ...sub,
    status: next,
    reviewer,
    notes: comment && comment.length > 0 ? comment : sub.notes,
  };
}

// Reject reason categories — UKGC-style enum the workflow surfaces.
export const REJECT_REASONS = [
  'rtp-out-of-range',
  'skill-influence-non-compliant',
  'missing-par-sheet',
  'merkle-verify-fail',
  'jurisdiction-not-licensed',
  'package-incomplete',
] as const;
export type RejectReason = typeof REJECT_REASONS[number];
