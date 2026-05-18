/**
 * CORTI 200.4-BACKEND — in-memory append-only audit log.
 *
 * Each session has its own hash-chain so chains are tamper-evident at
 * the granularity a regulator audit usually examines. A global "all"
 * stream can also be queried for cross-session forensics.
 */

import {
  sealEntry,
  verifyChain,
  merkleRoot,
  ZERO_HASH,
  type ChainedEntry,
} from '../lib/hashChain.js';

export interface AppendInput {
  sessionId: string;
  type: string;
  payload: unknown;
}

export interface AuditEntry extends ChainedEntry {
  sessionId: string;
  auditId: string;
}

export interface AuditQueryResult {
  entries: AuditEntry[];
  merkleRoot: string;
  count: number;
}

export interface ReplayResult {
  previous: AuditEntry | null;
  current: AuditEntry;
  next: AuditEntry | null;
  chainOk: boolean;
}

export class AuditStore {
  private readonly bySession = new Map<string, AuditEntry[]>();
  private readonly byAuditId = new Map<string, AuditEntry>();
  private globalSeq = 0;

  /** Append a new entry to the session's chain. */
  append(input: AppendInput): AuditEntry {
    const chain = this.bySession.get(input.sessionId) ?? [];
    const prevHash = chain.length > 0 ? chain[chain.length - 1].current : null;
    const seq = chain.length;
    const auditId = `audit-${input.sessionId}-${seq.toString(16).padStart(8, '0')}`;
    const sealed = sealEntry(
      {
        seq,
        timestamp: new Date().toISOString(),
        type: input.type,
        payload: input.payload,
      },
      prevHash
    );
    const entry: AuditEntry = {
      ...sealed,
      sessionId: input.sessionId,
      auditId,
    };
    chain.push(entry);
    this.bySession.set(input.sessionId, chain);
    this.byAuditId.set(auditId, entry);
    this.globalSeq++;
    return entry;
  }

  /** All entries for the session plus the Merkle root over their hashes. */
  query(sessionId: string): AuditQueryResult {
    const entries = this.bySession.get(sessionId) ?? [];
    return {
      entries: entries.slice(),
      merkleRoot: merkleRoot(entries.map((e) => e.current)),
      count: entries.length,
    };
  }

  /** Replay context for one entry — previous + next neighbours + chain check. */
  replay(auditId: string): ReplayResult | null {
    const entry = this.byAuditId.get(auditId);
    if (!entry) return null;
    const chain = this.bySession.get(entry.sessionId) ?? [];
    const idx = chain.findIndex((e) => e.auditId === auditId);
    const previous = idx > 0 ? chain[idx - 1] : null;
    const next = idx < chain.length - 1 ? chain[idx + 1] : null;
    const verification = verifyChain(chain);
    return {
      previous,
      current: entry,
      next,
      chainOk: verification.ok,
    };
  }

  /** Verify the integrity of a session's chain. */
  verify(sessionId: string): { ok: boolean; brokenAt?: number; reason?: string } {
    const chain = this.bySession.get(sessionId) ?? [];
    return verifyChain(chain);
  }

  /** Number of sessions tracked. */
  sessionCount(): number {
    return this.bySession.size;
  }

  /** Total entries across all sessions. */
  totalEntries(): number {
    return this.globalSeq;
  }

  /** Reset state (useful for tests). */
  reset(): void {
    this.bySession.clear();
    this.byAuditId.clear();
    this.globalSeq = 0;
  }
}

export const ZERO_AUDIT_HASH = ZERO_HASH;
