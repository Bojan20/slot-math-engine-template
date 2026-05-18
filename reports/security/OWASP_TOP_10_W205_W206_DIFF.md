# OWASP Top 10 — W205 → W206 Remediation Diff

This document is the persistent diff between the W205 baseline audit
and the W206 post-remediation audit. Generated manually because the
canonical OWASP audit script (`scripts/owasp-audit.mjs`) overwrites
`OWASP_TOP_10_<date>.md` on every run.

## Counts

| Severity | W205 | W206 | Δ |
|----------|:----:|:----:|:-:|
| Critical | 0    | 0    | 0 |
| High     | 4    | 0    | **−4 (target hit)** |
| Medium   | 6    | 6    | 0 |
| Low      | 2    | 2    | 0 |
| Info     | 10   | 12   | +2 |

## Per-finding diff

| ID | Category | W205 Severity | W206 Status | Evidence |
|----|----------|---------------|-------------|----------|
| `a01-no-rbac` | A01 | High | ✅ Closed → `a01-rbac-enforced` (Info) | `server/state/rbac.ts` + 10 guard sites, `server/tests/rbac.test.ts` (25 specs) |
| `a02-nginx-no-tls` | A02 | High | ✅ Closed → `a02-clean` (Info) | `docker/nginx-spa.conf` (TLS 1.3, HSTS, 301 redirect) |
| `a04-session-id-predictable` | A04 | High | ✅ Closed | `server/state/sessions.ts` (crypto.randomBytes(16)), `server/tests/session-id-entropy.test.ts` (6 specs) |
| `a05-no-security-headers` | A05 | High | ✅ Closed → no A05 findings | `server/index.ts` (@fastify/helmet), `server/tests/security-headers.test.ts` (9 specs) |
| `a01-admin-routes-open` | A01 | Medium | Carried (production hardening note) | — |
| `a04-wallet-race-single-threaded` | A04 | Low | Carried (postgres migration note) | — |
| `a07-apikey-entropy-policy` | A07 | Medium | Carried (env-var doc note) | — |
| `a07-no-mfa` | A07 | Medium | Carried (deployment plan) | — |
| `a08-no-signed-releases` | A08 | Medium | Carried (release workflow) | — |
| `a08-no-sri` | A08 | Low | Carried (no CDN scripts) | — |
| `a09-no-centralized-logging` | A09 | Medium | Carried (deployment) | — |
| `a09-no-alerting` | A09 | Medium | Carried (Prometheus wire-up) | — |

## New Info findings in W206

- `a01-rbac-enforced` — RBAC module + 10 guard sites detected.
- `a02-clean` — A02 cryptographic-failure scan returns clean.

## SOC 2 evidence cross-links

| Finding | Evidence document |
|---------|-------------------|
| A01     | `docs/SOC2_EVIDENCE/RBAC_MATRIX.md` |
| A02     | `docs/SOC2_EVIDENCE/TLS_CONFIG.md` |
| A04     | `docs/SOC2_EVIDENCE/SESSION_SECURITY.md` |
| A05     | `docs/SOC2_EVIDENCE/SECURITY_HEADERS.md` |
| Deps    | `docs/DEPENDENCY_UPGRADES.md` |

## Verification

```bash
npm run security:owasp     # exit 0, Critical=0, High=0
npm run server:test        # 223/223 PASS (40 new RBAC/headers/entropy specs)
npm test                   # 5474/5474 PASS (0 root regressions)
```

Wave: W206-SECURITY · Date: 2026-05-18
