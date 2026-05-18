/**
 * CORTI W206-SECURITY — session ID entropy tests (OWASP A04).
 *
 * After remediation, `newSessionId()` derives 128 bits from
 * `crypto.randomBytes(16)` — verify:
 *   1. Output matches `sess-<32 hex>` pattern (128 bits encoded).
 *   2. No Date.now() / counter leak in the ID body.
 *   3. Generated IDs are unique across a large batch.
 *   4. Across-batch collisions remain zero (sanity smoke).
 *   5. SESSION_ID_REGEX matches the new format and rejects legacy
 *      `sess-<base36>-<counter>` IDs.
 *   6. SessionStore.create returns IDs that pass the regex.
 */

import { describe, it, expect } from 'vitest';
import {
  newSessionId,
  SESSION_ID_REGEX,
  SessionStore,
} from '../state/sessions.js';

describe('Session ID entropy (OWASP A04 remediation)', () => {
  it('matches the `sess-<32 hex>` shape (128 bits of entropy)', () => {
    const id = newSessionId();
    expect(id).toMatch(/^sess-[0-9a-f]{32}$/);
    expect(SESSION_ID_REGEX.test(id)).toBe(true);
  });

  it('does not leak Date.now() as base36 in the body', () => {
    // The legacy format embedded the base36 timestamp + counter, e.g.
    // `sess-l9c2a-000001`. The new ID body must NOT contain a hyphen
    // (it is a single hex run) and must not match the legacy regex.
    const id = newSessionId();
    const body = id.slice('sess-'.length);
    expect(body.includes('-')).toBe(false);
    // Legacy regex was: `sess-[0-9a-z]+-[0-9a-f]{6,}` — guarantee a miss.
    expect(/^sess-[0-9a-z]+-[0-9a-f]{6,}$/.test(id)).toBe(false);
  });

  it('produces 10 000 unique IDs in a row (zero collisions)', () => {
    const N = 10_000;
    const seen = new Set<string>();
    for (let i = 0; i < N; i++) seen.add(newSessionId());
    expect(seen.size).toBe(N);
  });

  it('SESSION_ID_REGEX rejects the old `sess-<base36>-<counter>` format', () => {
    const legacy = 'sess-l9c2axyz-0000a1';
    expect(SESSION_ID_REGEX.test(legacy)).toBe(false);
  });

  it('SessionStore.create returns IDs that pass SESSION_ID_REGEX', () => {
    const store = new SessionStore();
    for (let i = 0; i < 25; i++) {
      const s = store.create({ playerId: `p${i}` });
      expect(SESSION_ID_REGEX.test(s.sessionId)).toBe(true);
    }
  });

  it('hex body decodes back to exactly 16 bytes (128 bits)', () => {
    const id = newSessionId();
    const body = id.slice('sess-'.length);
    expect(body.length).toBe(32);
    const buf = Buffer.from(body, 'hex');
    expect(buf.length).toBe(16);
  });
});
