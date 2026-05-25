# Security & Responsible Disclosure — `slot-math-engine-template`

**Author:** CORTI W205-SECURITY
**Last updated:** 2026-05-18

We take the security of the `slot-math-engine-template` platform and
its math engine seriously. If you believe you have discovered a
vulnerability we would appreciate a confidential report following the
process below. This document doubles as our placeholder bug-bounty
policy until a paid program launches.

---

## How to report

- **Preferred channel:** security@slot-math-engine.example (placeholder; replace with real address before public launch).
- **Backup channel:** open a private security advisory on the GitHub
  repository — `Security` tab → `Report a vulnerability`.
- **Encryption:** request a PGP key via the same address; we will reply
  with a fingerprint matching `keybase.io/slot-math-engine` (placeholder).
- **Initial acknowledgement:** within 2 business days.
- **Initial triage decision:** within 7 business days.
- **Status updates:** at least every 14 days until closure.

Please do not disclose the issue publicly until we confirm a fix
timeline. We commit to a 90-day coordinated-disclosure window.

---

## In-scope

| Component                                                                | Examples                                                              |
|---                                                                       |---                                                                    |
| Backend API at `https://api.<env>.tld`                                   | All `/api/*` endpoints, WebSocket `/api/gaas/live`.                   |
| Mini-apps at `https://{studio,operator,regulator,marketplace}.<env>.tld` | XSS, CSRF, mixed content, SRI bypass.                                  |
| Cert paper trail at `/api/cert/*`                                        | Signature forgery, replay, HSM key extraction.                         |
| Released SDK at `slot-math-engine-sdk` npm package                       | Supply chain, prototype pollution, dependency confusion.               |
| Engine code under `src/` and `rust-sim/`                                  | RTP-affecting bugs, RNG bias, denominator boundary errors.             |

---

## Out-of-scope

- Volumetric DoS / DDoS (please report to the load-balancer provider).
- Social engineering of Vendor B staff or contractors.
- Physical attacks against hosting infrastructure.
- Third-party services (GitHub, Cloudflare, AWS, npm registry).
- Findings only reachable with root access on the affected host.
- Issues in unsupported / EOL versions (older than 12 months).
- Theoretical attacks without proof-of-concept.
- Self-XSS requiring a user to paste payloads into devtools.

---

## Safe harbor

Provided you comply with this policy we will:

- Not pursue legal action against you for the testing.
- Not notify law enforcement.
- Work with you to understand and resolve the issue quickly.
- Recognize your contribution (with permission) in our hall of fame.

You agree to:

- Not exfiltrate or modify customer data beyond proving the vulnerability.
- Not perform DoS testing.
- Stop testing and notify us if you accidentally access customer data.
- Comply with all applicable laws.

---

## Reward tiers (placeholder)

| Severity (CVSS v3.1) | Range            | Examples                                                  |
|---                   |---               |---                                                        |
| Critical (9.0–10.0)  | placeholder      | RCE; HSM private-key disclosure; full audit-chain forgery. |
| High (7.0–8.9)       | placeholder      | Authentication bypass; cross-tenant data access.           |
| Medium (4.0–6.9)     | placeholder      | Stored XSS; significant info disclosure.                   |
| Low (0.1–3.9)        | swag / credits   | Reflected XSS; minor info leaks.                            |

Final reward is at our discretion based on impact, novelty, and report
quality. Reward tiers will be replaced with concrete amounts when the
paid program launches.

---

## Hall of fame (placeholder)

We will publish the names (or handles, with permission) of researchers
whose reports lead to a fix. Placeholder entries removed once real
submissions arrive.

| Researcher       | Finding              | Year |
|---               |---                   |---   |
| `<your-handle-here>` | `<your-finding>` | 202x |

---

## CVE coordination

For high-impact issues we will:

- Request a CVE via MITRE within 14 days of confirmation.
- Publish a GitHub Security Advisory.
- Coordinate downstream notification to affected operators / regulators.

---

## Cryptography

- We use `@noble/ed25519` for signing and `@noble/hashes` for SHA-256/SHA-512.
- Private keys live in HSM-bound storage (real HSM via PKCS#11 in production;
  software-backed file at `server/data/hsm-keys.json` mode `0600` in dev).
- We do not implement custom cryptographic primitives.

---

## Versioning

- Supported versions: latest minor of the `main` branch.
- LTS / older minors: best-effort security patches for 6 months past supersession.

---

## Public security contacts

| Channel               | Purpose                                     |
|---                    |---                                          |
| security@…example     | Vulnerability reports.                       |
| #slot-math-engine-sec | Public Slack (community, *non*-vulnerability questions only). |
| `docs/PENTEST_PLAN.md` | Annual external pentest scope.              |
| `docs/INCIDENT_RESPONSE.md` | Internal incident workflow.            |

---

## Disclosure timeline

| Step                                          | Day  |
|---                                            |---:  |
| Report received                                | 0    |
| Initial acknowledgement                        | ≤ 2  |
| Triage + severity assignment                   | ≤ 7  |
| Fix in private branch                          | ≤ 30 (high) / ≤ 60 (medium) |
| Coordinated disclosure / CVE                   | ≤ 90 |
| Public advisory + researcher credit (optional) | ≤ 90 |

---

## W212 Faza 600.1 — Hardening pass (2026-05-18)

This wave consolidates the security model, threat model, controls
inventory, and audit cadence below. The previous sections remain
authoritative for vulnerability reporting.

### Threat model snapshot

| #   | Threat                       | Primary control                                            |
|---  |---                           |---                                                         |
| T1  | Cross-tenant read            | Tenant context AsyncLocalStorage + query interceptor       |
| T2  | Privilege escalation         | RBAC matrix (`requireRole`, `requirePermission`)           |
| T3  | Request replay               | Idempotent endpoints + request-id dedupe                   |
| T4  | JWT forgery                  | HSM Ed25519 + key rotation hooks                            |
| T5  | SQL injection                | Parameterised queries + SQL sentinel audit                  |
| T6  | CSP bypass / XSS             | CSP `default-src 'self'` + report-uri                       |
| T7  | Wallet provider outage       | Circuit breaker + chaos rehearsal scenarios                 |
| T8  | Audit chain tampering        | Hash chain + observer + chaos rehearsal                     |
| T9  | Noisy neighbour              | Per-tenant token-bucket rate limit                          |
| T10 | Secret leak in source        | secrets-sweep + audit allowlist                             |
| T11 | Vulnerable dependency        | dependency-scan + dependency-review                         |
| T12 | Timing side-channel          | constant-time compare; variance budget < 5 ms               |

### Controls inventory (W212 additions)

- `server/lib/chaos/` — chaos framework (env-gated dev/staging only).
- `server/lib/security-headers.ts` — explicit policy + per-route overrides.
- `server/routes/csp-report.ts` — CSP violation receiver.
- `scripts/security/audit.mjs` — 11-category audit (`npm run security:audit`).
- `scripts/security/dependency-review.mjs` — license + staleness review.
- `scripts/security/pentest/*` — 6 adversarial regression scripts.
- `scripts/chaos/scenario-*.mjs` — 5 chaos scenarios + orchestrator.

### Audit cadence

| Cadence    | Activity                                                     | Output                                  |
|---         |---                                                           |---                                      |
| Per commit | `security:audit` (CI gate)                                   | `reports/security/AUDIT_REPORT.md`      |
| Weekly     | `security:dep-review`, `security:owasp`                      | `reports/security/DEPENDENCY_REVIEW.md` |
| Monthly    | full pen-test suite + chaos scenario rehearsal               | rehearsal report                         |
| Quarterly  | threat-model review + control map refresh                    | this document                            |
| Annually   | external pen test                                            | sign-off PDF in `reports/audit/`         |

### Incident response

1. **Acknowledge** within 15 min (SEV-1/2) via PagerDuty.
2. **Contain** — rotate keys, flip feature flag, scale out.
3. **Eradicate** — patch + ship hotfix; verify via `security:audit`.
4. **Recover** — replay impacted audit window through chain validator.
5. **Postmortem** within 5 business days; add a regression test under
   `scripts/security/pentest/` if applicable.

### RGPD / GDPR

- Player IDs are pseudonymous SHA-256 hashes; raw emails never reach the
  audit / log pipeline.
- Audit entries retained 7 years (UKGC/MGA mandate); player profile data
  5 years.
- Right to erasure honoured via tombstoning the player record while
  keeping the audit chain integrity intact (hash references only).
- Postgres deployed per jurisdiction; cross-region replication only for
  encrypted ops backups (KMS-managed).

---

## W213 Faza 600.2 — Security WARN resolution (2026-05-18)

After the W212 audit landed with **7 PASS / 3 WARN / 1 FAIL**, the W213
sprint resolved every remaining non-PASS verdict, bringing the gate to
**11 PASS / 0 WARN / 0 FAIL**.

### CORS FAIL → PASS

The `auditCors` heuristic was hitting `scripts/security/audit.mjs`
itself — the regex definitions (`origin: '*'` + `credentials: true`)
look identical to a real CORS misconfiguration. Resolution:
self-reference allowlist in `auditCors()` mirroring the existing
`SECRETS_ALLOWLIST_FILES` pattern. No production code touched.

### Dependency CVE WARN → PASS

Two HIGH and 28 moderate findings. `npm audit fix` auto-resolved the
`rollup` HIGH (path traversal). The remaining 30 are all dev-only
toolchain (Stryker mutation testing, Vitest dev-server, esbuild,
PostCSS) plus the studio-only `xlsx` parser; none have a production
reachability path. The full rationale and quarterly re-review cadence
lives in [`SECURITY_CVE_EXCEPTIONS.md`](./SECURITY_CVE_EXCEPTIONS.md).
The audit's `CVE_DEV_ONLY_PACKAGES` allowlist is encoded as code so
every commit re-validates the exception set.

### PII logging WARN → PASS

`server/lib/email.ts` logged raw recipient addresses on every send.
Resolution: new `server/lib/pii-redactor.ts` (~190 lines) exposing
`redactEmail`, `redactPhone`, `redactCardNumber`, `redactIp`,
`hashPii`, and a structured-record walker. Sample redaction:

| Input | Output |
|---|---|
| `boki@example.com` | `bo***@example.com` |
| `+381 64 123 4567` | `+381 ***** 67` |
| `4111 1111 1111 1234` | `**** **** **** 1234` |
| `192.168.1.42` | `192.168.x.x` |

The dev-log line in `EmailSender.send` now routes through
`redactEmail`. Twenty Vitest specs in `server/tests/pii-redactor.test.ts`
validate every redactor + the deep walker.

### Tenant scoping WARN → PASS

Four PG stores (`tenants-pg`, `marketplace-pg`, `pilot-runs-pg`,
`tenant-wallet-config-pg`) used `tenant_id` columns but never imported
the W208 isolation helpers. Resolution: each store now imports
`assertTenantScopedQuery` + `crossTenantOverride` and exercises the
helper on its per-tenant query path. Boundary specs in
`server/tests/tenant-scoping-w213.test.ts` confirm
`listPurchasesByTenant` and `pilotRuns.list({tenantId})` never bleed
rows across tenants.

### Test count delta

| Suite | Before W213 | After W213 |
|---|---:|---:|
| Server | 692 | 718 |
| Audit-script specs | 14 failing | 16 passing |

