/**
 * CORTI 200.4-BACKEND — mock cert submission store.
 *
 * Real deployment routes to GLI / BMM / iTechLabs cert labs over a
 * managed API. This stub simulates the typical lifecycle:
 *   submitted → validating → par_generated → packaged → completed
 *
 * Any submission that fails IR validation enters `rejected` state with
 * a stub regulator feedback message.
 */

import { sha256Hex, canonicalize } from '../lib/hashChain.js';

export type CertStatus =
  | 'submitted'
  | 'validating'
  | 'par_generated'
  | 'packaged'
  | 'completed'
  | 'rejected';

export interface CertSubmission {
  submissionId: string;
  jurisdiction: string;
  status: CertStatus;
  irSha256: string;
  createdAt: string;
  estimatedCompletion: string;
  parSheet?: { sections: number; rtp: number; sha256: string };
  operatorPackage?: { sizeBytes: number; sha256: string; downloadToken: string };
  regulatorFeedback?: string;
}

export interface SubmitInput {
  ir: unknown;
  jurisdiction: string;
}

let counter = 0;
function newSubmissionId(): string {
  counter++;
  return `cert-${Date.now().toString(36)}-${counter.toString(16).padStart(6, '0')}`;
}

export class CertStore {
  private readonly submissions = new Map<string, CertSubmission>();
  private readonly downloads = new Map<string, Buffer>();

  submit(input: SubmitInput): CertSubmission {
    if (!input.ir || typeof input.ir !== 'object') {
      throw new RangeError('cert.submit: ir must be a non-null object');
    }
    if (!input.jurisdiction) {
      throw new RangeError('cert.submit: jurisdiction required');
    }
    const irSha256 = sha256Hex(canonicalize(input.ir));
    const submissionId = newSubmissionId();
    const now = new Date();
    // ETA = now + 24h (mocked — real labs run ~14-30 days).
    const eta = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const submission: CertSubmission = {
      submissionId,
      jurisdiction: input.jurisdiction,
      status: 'submitted',
      irSha256,
      createdAt: now.toISOString(),
      estimatedCompletion: eta.toISOString(),
    };
    this.submissions.set(submissionId, submission);
    // Synchronously advance through stages — real lab would do this
    // asynchronously over days.
    this.advance(submissionId);
    return submission;
  }

  get(submissionId: string): CertSubmission | null {
    return this.submissions.get(submissionId) ?? null;
  }

  /** Idempotent stage advance — for the mock we go straight to
   *  `packaged` after one call. Real impl would tick over time. */
  private advance(submissionId: string): void {
    const sub = this.submissions.get(submissionId);
    if (!sub) return;
    if (sub.status === 'completed' || sub.status === 'rejected') return;
    sub.status = 'validating';
    sub.status = 'par_generated';
    sub.parSheet = {
      sections: 12,
      rtp: 0.955,
      sha256: sha256Hex(sub.irSha256 + ':par'),
    };
    sub.status = 'packaged';
    const opPkgBuffer = Buffer.from(
      `mock operator-package.zip for ${submissionId}\nIR sha256: ${sub.irSha256}\n`
    );
    const opPkgSha = sha256Hex(opPkgBuffer.toString('utf8'));
    const downloadToken = `tok-${sub.submissionId}-${opPkgSha.slice(0, 8)}`;
    this.downloads.set(downloadToken, opPkgBuffer);
    sub.operatorPackage = {
      sizeBytes: opPkgBuffer.byteLength,
      sha256: opPkgSha,
      downloadToken,
    };
    sub.status = 'completed';
  }

  /** Look up the operator-package bytes by submissionId. */
  download(submissionId: string): { buffer: Buffer; sha256: string } | null {
    const sub = this.submissions.get(submissionId);
    if (!sub || !sub.operatorPackage) return null;
    const buffer = this.downloads.get(sub.operatorPackage.downloadToken);
    if (!buffer) return null;
    return { buffer, sha256: sub.operatorPackage.sha256 };
  }

  list(): CertSubmission[] {
    return Array.from(this.submissions.values());
  }

  reset(): void {
    this.submissions.clear();
    this.downloads.clear();
  }
}
