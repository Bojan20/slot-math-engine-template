/**
 * CORTI W210 Faza 600.0 — cert pipeline status tracker.
 *
 * Each lab submission walks through this lifecycle:
 *
 *   draft → packed → submitted → lab_questions → revisions_needed
 *                                                    ↓
 *                                                 approved
 *                                                    ↓
 *                                              production_ready
 *
 * `approved` is also reachable from `submitted` and `lab_questions`
 * directly. `revisions_needed` re-enters `submitted` once a fix lands.
 *
 * Audit log captures every transition. `estimatedDaysInStage` is seeded
 * with realistic historical averages so an operator UI can show "you'll
 * hear back in ~21 days" without needing real telemetry yet.
 */

import { randomUUID, createHash } from 'node:crypto';
import type { LabName } from '../lib/cert/labs/types.js';

export type PipelineStage =
  | 'draft'
  | 'packed'
  | 'submitted'
  | 'lab_questions'
  | 'revisions_needed'
  | 'approved'
  | 'production_ready';

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'draft',
  'packed',
  'submitted',
  'lab_questions',
  'revisions_needed',
  'approved',
  'production_ready',
];

/** Seeded average days in each stage per lab. */
export const ESTIMATED_DAYS_IN_STAGE: Record<LabName, Record<PipelineStage, number>> = {
  GLI: {
    draft: 1,
    packed: 1,
    submitted: 42, // 6w avg
    lab_questions: 7,
    revisions_needed: 5,
    approved: 1,
    production_ready: 0,
  },
  BMM: {
    draft: 1,
    packed: 1,
    submitted: 28, // 4w avg
    lab_questions: 6,
    revisions_needed: 4,
    approved: 1,
    production_ready: 0,
  },
  eCOGRA: {
    draft: 1,
    packed: 1,
    submitted: 21, // 3w avg
    lab_questions: 5,
    revisions_needed: 3,
    approved: 1,
    production_ready: 0,
  },
  NMi: {
    draft: 1,
    packed: 1,
    submitted: 42, // 6w avg
    lab_questions: 7,
    revisions_needed: 5,
    approved: 1,
    production_ready: 0,
  },
};

export interface PipelineAuditEntry {
  id: string;
  at: string; // ISO timestamp
  from: PipelineStage | null;
  to: PipelineStage;
  note?: string;
  bundleSha256?: string;
}

export interface PipelineSubmission {
  id: string;
  lab: LabName;
  vendor: string;
  game: string;
  version: string;
  jurisdiction: string;
  createdAt: string;
  updatedAt: string;
  stage: PipelineStage;
  estimatedNextTransitionAt: string;
  bundleSha256?: string;
  audit: PipelineAuditEntry[];
}

/** Legal forward transitions. Any other transition throws. */
const ALLOWED_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  draft: ['packed'],
  packed: ['submitted', 'draft'],
  submitted: ['lab_questions', 'approved', 'revisions_needed'],
  lab_questions: ['revisions_needed', 'approved', 'submitted'],
  revisions_needed: ['submitted', 'packed'],
  approved: ['production_ready'],
  production_ready: [],
};

export class CertPipelineStore {
  private readonly byId = new Map<string, PipelineSubmission>();
  private now: () => Date;

  constructor(opts: { now?: () => Date } = {}) {
    this.now = opts.now ?? (() => new Date());
  }

  create(input: {
    lab: LabName;
    vendor: string;
    game: string;
    version: string;
    jurisdiction: string;
    bundleSha256?: string;
  }): PipelineSubmission {
    const now = this.now();
    const stage: PipelineStage = 'draft';
    const id = `cps-${randomUUID()}`;
    const sub: PipelineSubmission = {
      id,
      lab: input.lab,
      vendor: input.vendor,
      game: input.game,
      version: input.version,
      jurisdiction: input.jurisdiction,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      stage,
      estimatedNextTransitionAt: estimateNext(now, input.lab, stage),
      bundleSha256: input.bundleSha256,
      audit: [
        {
          id: `aud-${randomUUID()}`,
          at: now.toISOString(),
          from: null,
          to: stage,
          note: 'created',
          bundleSha256: input.bundleSha256,
        },
      ],
    };
    this.byId.set(id, sub);
    return sub;
  }

  get(id: string): PipelineSubmission | undefined {
    return this.byId.get(id);
  }

  list(): PipelineSubmission[] {
    return [...this.byId.values()];
  }

  transition(input: {
    id: string;
    to: PipelineStage;
    note?: string;
    bundleSha256?: string;
  }): PipelineSubmission {
    const sub = this.byId.get(input.id);
    if (!sub) throw new Error(`cert_pipeline_not_found:${input.id}`);
    const allowed = ALLOWED_TRANSITIONS[sub.stage];
    if (!allowed.includes(input.to)) {
      throw new Error(
        `cert_pipeline_illegal_transition:${sub.stage}->${input.to}`
      );
    }
    const now = this.now();
    const audit: PipelineAuditEntry = {
      id: `aud-${randomUUID()}`,
      at: now.toISOString(),
      from: sub.stage,
      to: input.to,
      note: input.note,
      bundleSha256: input.bundleSha256 ?? sub.bundleSha256,
    };
    sub.audit.push(audit);
    sub.stage = input.to;
    sub.updatedAt = now.toISOString();
    sub.estimatedNextTransitionAt = estimateNext(now, sub.lab, input.to);
    if (input.bundleSha256) sub.bundleSha256 = input.bundleSha256;
    return sub;
  }

  /** Stable hash of the audit chain for tamper-evidence checks. */
  auditHash(id: string): string {
    const sub = this.byId.get(id);
    if (!sub) throw new Error(`cert_pipeline_not_found:${id}`);
    const h = createHash('sha256');
    for (const a of sub.audit) {
      h.update(`${a.id}|${a.at}|${a.from ?? ''}->${a.to}|${a.note ?? ''}|${a.bundleSha256 ?? ''}\n`);
    }
    return h.digest('hex');
  }

  /** Convenience: how many days remain (negative if overdue). */
  daysRemaining(id: string): number {
    const sub = this.byId.get(id);
    if (!sub) throw new Error(`cert_pipeline_not_found:${id}`);
    const remainingMs =
      new Date(sub.estimatedNextTransitionAt).getTime() - this.now().getTime();
    return Math.round(remainingMs / (24 * 60 * 60 * 1000));
  }
}

function estimateNext(
  from: Date,
  lab: LabName,
  stage: PipelineStage
): string {
  const days = ESTIMATED_DAYS_IN_STAGE[lab][stage] ?? 0;
  const dt = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  return dt.toISOString();
}
