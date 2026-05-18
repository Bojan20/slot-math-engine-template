/**
 * W212 Faza 600.1 — CSP violation report endpoint.
 *
 *   POST /api/csp-report
 *
 * Browsers POST `application/csp-report` JSON when a CSP directive
 * (whose `report-uri` points at this endpoint) is violated. We log the
 * event at WARN severity and append a sanitised record to
 * `reports/security/csp-violations.json` for later forensics.
 *
 * Public (no RBAC) by design — browsers can't add headers. Body is
 * length-capped and any field longer than 2 KB is truncated.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve as resolvePath, join } from 'node:path';
import { logger } from '../lib/observability.js';

export interface CspReport {
  documentUri?: string;
  referrer?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  originalPolicy?: string;
  disposition?: 'enforce' | 'report';
  blockedUri?: string;
  statusCode?: number;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface CspReportRouteDeps {
  /** Storage path for the violation log. Defaults to repo-root reports/. */
  storePath?: string;
  /** Override the logger sink (tests). */
  onViolation?: (rec: CspReport & { ts: string }) => void;
}

const MAX_FIELD = 2048;
function truncate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.length > MAX_FIELD ? value.slice(0, MAX_FIELD) + '…' : value;
}

/**
 * Browsers send either:
 *   { "csp-report": { ... } }              (Reporting API legacy)
 * or the newer Reports v0 format:
 *   { type: 'csp-violation', body: { ... } }
 */
export function normaliseCspReport(body: unknown): CspReport | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const legacy = b['csp-report'];
  const reportsApi = b['body'];
  const raw =
    (legacy && typeof legacy === 'object' ? (legacy as Record<string, unknown>) : null) ??
    (reportsApi && typeof reportsApi === 'object' ? (reportsApi as Record<string, unknown>) : null) ??
    (b as Record<string, unknown>);
  if (!raw) return null;
  const out: CspReport = {
    documentUri: truncate(typeof raw['document-uri'] === 'string' ? (raw['document-uri'] as string) : (raw.documentUri as string | undefined)),
    referrer: truncate(typeof raw.referrer === 'string' ? (raw.referrer as string) : undefined),
    violatedDirective: truncate(typeof raw['violated-directive'] === 'string' ? (raw['violated-directive'] as string) : (raw.violatedDirective as string | undefined)),
    effectiveDirective: truncate(typeof raw['effective-directive'] === 'string' ? (raw['effective-directive'] as string) : (raw.effectiveDirective as string | undefined)),
    originalPolicy: truncate(typeof raw['original-policy'] === 'string' ? (raw['original-policy'] as string) : (raw.originalPolicy as string | undefined)),
    disposition: typeof raw.disposition === 'string' ? (raw.disposition as 'enforce' | 'report') : undefined,
    blockedUri: truncate(typeof raw['blocked-uri'] === 'string' ? (raw['blocked-uri'] as string) : (raw.blockedUri as string | undefined)),
    statusCode: typeof raw['status-code'] === 'number' ? (raw['status-code'] as number) : (typeof raw.statusCode === 'number' ? (raw.statusCode as number) : undefined),
    sourceFile: truncate(typeof raw['source-file'] === 'string' ? (raw['source-file'] as string) : (raw.sourceFile as string | undefined)),
    lineNumber: typeof raw['line-number'] === 'number' ? (raw['line-number'] as number) : (typeof raw.lineNumber === 'number' ? (raw.lineNumber as number) : undefined),
    columnNumber: typeof raw['column-number'] === 'number' ? (raw['column-number'] as number) : (typeof raw.columnNumber === 'number' ? (raw.columnNumber as number) : undefined),
  };
  return out;
}

function persistViolation(storePath: string, rec: CspReport & { ts: string }): void {
  try {
    if (!existsSync(dirname(storePath))) mkdirSync(dirname(storePath), { recursive: true });
    let existing: Array<unknown> = [];
    if (existsSync(storePath)) {
      try {
        const parsed = JSON.parse(readFileSync(storePath, 'utf8'));
        if (Array.isArray(parsed)) existing = parsed;
      } catch {
        existing = [];
      }
    }
    existing.push(rec);
    // Cap to last 1000 to avoid unbounded growth.
    if (existing.length > 1000) existing = existing.slice(-1000);
    writeFileSync(storePath, JSON.stringify(existing, null, 2));
  } catch {
    // Best-effort persistence; never break the response on an IO error.
  }
}

export async function registerCspReportRoutes(
  app: FastifyInstance,
  deps: CspReportRouteDeps = {}
): Promise<void> {
  const storePath =
    deps.storePath ??
    resolvePath(process.cwd(), 'reports/security/csp-violations.json');
  app.post('/api/csp-report', async (req: FastifyRequest, reply) => {
    const normalised = normaliseCspReport(req.body);
    if (!normalised) {
      return reply.code(204).send();
    }
    const enriched = { ...normalised, ts: new Date().toISOString() };
    logger.warn('csp_violation', enriched as Record<string, unknown>);
    deps.onViolation?.(enriched);
    persistViolation(storePath, enriched);
    return reply.code(204).send();
  });
}
