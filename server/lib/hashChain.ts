/**
 * CORTI 200.4-BACKEND — append-only hash-chain helper.
 *
 * Mirrors the pattern from `src/recall/journal.ts` but stays
 * dependency-free (uses Node's built-in crypto). Every entry in an
 * audit log carries:
 *  - `prev`: SHA-256 of the previous entry's `current` hash (or 64 zeros)
 *  - `current`: SHA-256 of the canonical serialization of this entry
 *
 * Chain integrity is checked by walking the list and verifying
 * `entry[i].prev === entry[i-1].current` plus that every `current` is
 * stable under re-serialization.
 */

import { createHash } from 'node:crypto';

export const ZERO_HASH = '0'.repeat(64);

/** Stable JSON serialization — sorted keys, deterministic. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k]))
      .join(',') +
    '}'
  );
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export interface ChainedEntry {
  /** Monotonically increasing sequence (per-chain). */
  seq: number;
  /** ISO timestamp. */
  timestamp: string;
  /** Caller-supplied payload — opaque to the chain helper. */
  payload: unknown;
  /** Caller-supplied kind label (e.g. 'spin', 'wallet.deposit'). */
  type: string;
  /** SHA-256 of the previous entry's `current` field. */
  prev: string;
  /** SHA-256 of `{ seq, timestamp, type, payload, prev }`. */
  current: string;
}

export function sealEntry(
  draft: Omit<ChainedEntry, 'prev' | 'current'>,
  prevHash: string | null
): ChainedEntry {
  const prev = prevHash ?? ZERO_HASH;
  const toSeal = {
    seq: draft.seq,
    timestamp: draft.timestamp,
    type: draft.type,
    payload: draft.payload,
    prev,
  };
  const current = sha256Hex(canonicalize(toSeal));
  return { ...draft, prev, current };
}

export interface ChainVerification {
  ok: boolean;
  brokenAt?: number;
  reason?: string;
}

export function verifyChain(entries: ReadonlyArray<ChainedEntry>): ChainVerification {
  let head: string = ZERO_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.prev !== head) {
      return { ok: false, brokenAt: i, reason: `prev mismatch at seq=${e.seq}` };
    }
    const recompute = sha256Hex(
      canonicalize({
        seq: e.seq,
        timestamp: e.timestamp,
        type: e.type,
        payload: e.payload,
        prev: e.prev,
      })
    );
    if (recompute !== e.current) {
      return { ok: false, brokenAt: i, reason: `current hash mismatch at seq=${e.seq}` };
    }
    head = e.current;
  }
  return { ok: true };
}

/** Merkle root of a list of entry hashes. SHA-256 binary tree, paired
 *  bottom-up. Leaves are the `current` hashes. Returns ZERO_HASH for
 *  an empty list. */
export function merkleRoot(hashes: ReadonlyArray<string>): string {
  if (hashes.length === 0) return ZERO_HASH;
  let layer = hashes.slice();
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : layer[i];
      next.push(sha256Hex(left + right));
    }
    layer = next;
  }
  return layer[0];
}
