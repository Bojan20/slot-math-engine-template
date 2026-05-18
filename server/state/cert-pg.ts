/**
 * CORTI W206-PERSISTENCE — Postgres-backed CertStore (records only).
 *
 * Stores submission metadata, PAR sheet JSON, PDF bytes and HSM
 * signature. The PDF generation pipeline still lives in `cert.ts`;
 * this class is a thin CRUD wrapper around `cert_submissions`.
 *
 * Heavy lifting (PAR build + PDF render + HSM sign) is performed by
 * the caller and the results stored here via `record()`.
 */

import type { PgConnection } from '../db/connection.js';
import type {
  CertStatus,
  CertSubmission,
  PARSheet,
} from './cert.js';
import type { HsmSignature } from './hsm.js';

interface CertRow {
  submission_id: string;
  ir_blob: unknown;
  ir_sha256: string;
  jurisdiction: string;
  status: string;
  par_sheet: PARSheet | null;
  par_pdf: Buffer | null;
  par_pdf_sha256: string | null;
  hsm_signature: HsmSignature | null;
  operator_package: CertSubmission['operatorPackage'] | null;
  submitted_at: Date;
  reviewed_at: Date | null;
}

function rowToSubmission(r: CertRow): CertSubmission {
  const eta = new Date(r.submitted_at.getTime() + 24 * 60 * 60 * 1000);
  const sub: CertSubmission = {
    submissionId: r.submission_id,
    jurisdiction: r.jurisdiction,
    status: r.status as CertStatus,
    irSha256: r.ir_sha256,
    createdAt: r.submitted_at.toISOString(),
    estimatedCompletion: eta.toISOString(),
  };
  if (r.par_sheet) {
    sub.parSheet = {
      sections: r.par_sheet.sections.length,
      rtp: r.par_sheet.rtp,
      sha256: r.ir_sha256, // mirror of legacy field; full sheet stored separately
      merkleRoot: r.par_sheet.irSha256,
    };
  }
  if (r.par_pdf_sha256) sub.parPdfSha256 = r.par_pdf_sha256;
  if (r.hsm_signature) sub.hsmSignature = r.hsm_signature;
  if (r.operator_package) sub.operatorPackage = r.operator_package;
  return sub;
}

export interface CertRecordInput {
  submissionId: string;
  ir: unknown;
  irSha256: string;
  jurisdiction: string;
  status: CertStatus;
  par?: PARSheet;
  parPdf?: Buffer;
  parPdfSha256?: string;
  signature?: HsmSignature;
  operatorPackage?: CertSubmission['operatorPackage'];
}

export class PostgresCertStore {
  constructor(private readonly conn: PgConnection) {}

  async record(input: CertRecordInput): Promise<CertSubmission> {
    const r = await this.conn.query<CertRow>(
      `INSERT INTO cert_submissions(submission_id, ir_blob, ir_sha256, jurisdiction, status, par_sheet, par_pdf, par_pdf_sha256, hsm_signature, operator_package, submitted_at)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (submission_id) DO UPDATE SET
         status = EXCLUDED.status,
         par_sheet = COALESCE(EXCLUDED.par_sheet, cert_submissions.par_sheet),
         par_pdf = COALESCE(EXCLUDED.par_pdf, cert_submissions.par_pdf),
         par_pdf_sha256 = COALESCE(EXCLUDED.par_pdf_sha256, cert_submissions.par_pdf_sha256),
         hsm_signature = COALESCE(EXCLUDED.hsm_signature, cert_submissions.hsm_signature),
         operator_package = COALESCE(EXCLUDED.operator_package, cert_submissions.operator_package)
       RETURNING submission_id, ir_blob, ir_sha256, jurisdiction, status, par_sheet, par_pdf, par_pdf_sha256, hsm_signature, operator_package, submitted_at, reviewed_at`,
      [
        input.submissionId,
        JSON.stringify(input.ir ?? null),
        input.irSha256,
        input.jurisdiction,
        input.status,
        input.par ? JSON.stringify(input.par) : null,
        input.parPdf ?? null,
        input.parPdfSha256 ?? null,
        input.signature ? JSON.stringify(input.signature) : null,
        input.operatorPackage ? JSON.stringify(input.operatorPackage) : null,
      ]
    );
    return rowToSubmission(r.rows[0]);
  }

  async get(submissionId: string): Promise<CertSubmission | null> {
    const r = await this.conn.query<CertRow>(
      `SELECT submission_id, ir_blob, ir_sha256, jurisdiction, status, par_sheet, par_pdf, par_pdf_sha256, hsm_signature, operator_package, submitted_at, reviewed_at
       FROM cert_submissions WHERE submission_id = $1`,
      [submissionId]
    );
    if (r.rows.length === 0) return null;
    return rowToSubmission(r.rows[0]);
  }

  async getPdf(submissionId: string): Promise<Buffer | null> {
    const r = await this.conn.query<{ par_pdf: Buffer | null }>(
      `SELECT par_pdf FROM cert_submissions WHERE submission_id = $1`,
      [submissionId]
    );
    if (r.rows.length === 0 || !r.rows[0].par_pdf) return null;
    return r.rows[0].par_pdf;
  }

  async getPar(submissionId: string): Promise<PARSheet | null> {
    const r = await this.conn.query<{ par_sheet: PARSheet | null }>(
      `SELECT par_sheet FROM cert_submissions WHERE submission_id = $1`,
      [submissionId]
    );
    if (r.rows.length === 0) return null;
    return r.rows[0].par_sheet;
  }

  async list(): Promise<CertSubmission[]> {
    const r = await this.conn.query<CertRow>(
      `SELECT submission_id, ir_blob, ir_sha256, jurisdiction, status, par_sheet, par_pdf, par_pdf_sha256, hsm_signature, operator_package, submitted_at, reviewed_at
       FROM cert_submissions ORDER BY submitted_at DESC`
    );
    return r.rows.map(rowToSubmission);
  }

  async reset(): Promise<void> {
    await this.conn.query('DELETE FROM cert_submissions');
  }
}
