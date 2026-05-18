# Session ID Security — SOC 2 Evidence

CORTI W206-SECURITY — session identifier entropy evidence collection.
Closes OWASP A04 high-severity finding `a04-session-id-predictable`.

Source of truth: `server/state/sessions.ts`.

## Before (W205-and-prior)

```ts
let counter = 0;
function newSessionId(): string {
  counter++;
  return `sess-${Date.now().toString(36)}-${counter.toString(16).padStart(6, '0')}`;
}
```

Predictability characteristics:
- 36 bits of timestamp + ~24 bits of monotonic counter.
- An attacker who observes one ID can derive the issuance time and
  brute-force adjacent IDs in O(seconds) on a laptop.
- Fails NIST SP 800-63B § 5.1.1.1 entropy requirement (≥ 64 bits).

## After (W206)

```ts
import { randomBytes } from 'node:crypto';
export const SESSION_ID_REGEX = /^sess-[0-9a-f]{32}$/;
export function newSessionId(): string {
  return `sess-${randomBytes(16).toString('hex')}`;
}
```

Properties:
- **128 bits** of entropy from `crypto.randomBytes(16)`.
- `randomBytes` is backed by libuv → OpenSSL `RAND_bytes` (CSPRNG seeded
  from `/dev/urandom` on Linux, `BCryptGenRandom` on Windows).
- Format `sess-<32 hex>` retains the `sess-` prefix for grep/audit-tool
  compatibility with prior log corpora.
- Collision probability across 10⁹ sessions remains < 10⁻²⁰
  (birthday paradox at 128 bits).

## Compliance mapping

| Standard | Requirement | Status |
|----------|-------------|--------|
| NIST SP 800-63B § 5.1.1.1 | ≥ 64 bits of entropy in session ids | ✅ 128 bits |
| IETF RFC 6896 (Salted Challenge Response Auth) §2 | "session IDs MUST be unpredictable" | ✅ CSPRNG-backed |
| OWASP ASVS 4.0.3 V3.2.2 | Session token uses CSPRNG ≥ 64 bits | ✅ |
| OWASP ASVS 4.0.3 V3.2.3 | Token does not embed clock / counter | ✅ |
| PCI-DSS 4.0 § 8.3.4 (session timeouts apart) | Strong tokenization | ✅ |

## Test coverage

`server/tests/session-id-entropy.test.ts` — 6 specs:
1. Format matches `^sess-[0-9a-f]{32}$`.
2. No `Date.now()` / counter leak in body.
3. 10 000 IDs all unique.
4. `SESSION_ID_REGEX` rejects legacy format.
5. `SessionStore.create()` returns regex-passing IDs.
6. Hex body decodes back to exactly 16 bytes.

## Backward compatibility

- Test fixtures that match `^sess-` still pass (regex retained for
  grep / log parsing tools).
- Existing audit log entries keyed on legacy IDs remain queryable —
  the AuditStore indexes by string equality, not regex.
- Sibling apps (web/studio, web/operator, web/regulator) treat session
  IDs as opaque strings; no client-side parsing exists.

See also: `reports/security/OWASP_TOP_10_2026-05-18.md` → A04 (only
remaining finding is the Low `a04-wallet-race-single-threaded`).
