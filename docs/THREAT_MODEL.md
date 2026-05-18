# Threat Model — `slot-math-engine-template`

**Author:** CORTI W205-SECURITY
**Last updated:** 2026-05-18
**Audience:** Engineering, SRE, security lead, regulator audit committee.
**Methodology:** STRIDE per component.

This document captures the platform's threat surface and per-component
mitigation strategies. The model is regenerated annually and on every
major architecture change. Findings are mirrored into `reports/security/`
via `scripts/owasp-audit.mjs`.

---

## 1. Components in scope

| Component        | Role                                                                       | Trust boundary             |
|---               |---                                                                         |---                         |
| Studio SPA       | Designer-facing IR editor + closed-form solver UI.                          | Public web (cookie-less).  |
| Operator SPA     | Operator dashboard for live RTP / session monitoring.                       | Authenticated operator.    |
| Regulator SPA    | Cert-paper-trail viewer + replay tool.                                      | Authenticated regulator.   |
| Marketplace SPA  | Game catalog + IR browse.                                                   | Public web.                |
| Cabinet SPA      | Land-based cabinet emulator (Class-II / III).                              | Land-based device LAN.     |
| Backend          | Fastify multi-tenant API (session, wallet, audit, cert, gaas, admin).       | Internal data plane.       |
| HSM              | ed25519 signer (`server/state/hsm.ts`).                                     | OS-level file ACL (0600).  |
| Audit log        | In-memory hash-chained log; cert-grade tamper detection.                    | Internal data plane.       |

---

## 2. STRIDE analysis per component

### 2.1 Studio SPA

| Threat (STRIDE) | Description                                                          | Likelihood × Impact = Risk | Mitigation                                                                                |
|---              |---                                                                  |---                          |---                                                                                       |
| Spoofing        | Designer impersonates another designer.                              | L=Low × I=Med = Low         | Tenant-scoped sessions; future SSO/SAML.                                                  |
| Tampering       | Adversary modifies IR before submission.                             | L=Med × I=High = High       | HSM-signed cert paper trail; verifyChain on every audit query.                            |
| Repudiation     | Designer denies submitting an IR.                                    | L=Med × I=Med = Med         | Audit log entry per submission; ed25519 signature with `signer` field.                    |
| Information disclosure | Browser dev-tools leak proprietary IR maths.                  | L=High × I=Low = Med        | Documented in `docs/IP_REVIEW.md`; IR represents *commitment* not algorithm internals.    |
| Denial of service | Studio tab consumes 100% CPU on bad IR.                            | L=Med × I=Low = Low         | `rule-editor.ts` has 10 000-iter cap; per-call timeout.                                    |
| Elevation of privilege | XSS in IR field gains script execution.                       | L=Low × I=High = Med        | `innerHTML` use is internal-only; **gap:** add @fastify/helmet CSP at backend (S-2).      |

### 2.2 Operator SPA

| Threat              | Description                                                                       | Risk  | Mitigation                                                                          |
|---                  |---                                                                               |---    |---                                                                                  |
| Spoofing            | Stolen operator session token.                                                    | High  | Short-lived JWT (planned); MFA placeholder.                                          |
| Tampering           | Manipulated RTP feed.                                                             | Med   | Read-only API; signed PAR PDFs prevent forgery.                                      |
| Repudiation         | Operator denies setting a tenant policy.                                          | Med   | Audit entry per admin PATCH.                                                         |
| Information disclosure | Cross-tenant operator views another tenant's sessions.                          | High  | `X-Tenant-Id` resolution preHandler; **gap:** RBAC missing (S-1).                    |
| Denial of service   | Bulk-poll exhausts backend.                                                       | Med   | Per-tenant rate limit (default 600 rpm).                                              |
| Elevation of privilege | Operator escalates to admin scope.                                              | High  | Admin tenant CRUD intentionally open (W205 finding `a01-admin-routes-open`) — fix S-1. |

### 2.3 Regulator SPA

| Threat | Description | Risk | Mitigation |
|---|---|---|---|
| Spoofing | Stolen regulator credential. | High | Same as operator; future SSO. |
| Tampering | Regulator alters cert paper trail. | Critical | Hash-chain `verifyChain`; HSM ed25519 sig. |
| Repudiation | Regulator denies certifying. | Med | Audit log + signed attestation. |
| Info disclosure | Cross-jurisdiction data exposure. | Med | Tenant `allowedJurisdictions` filter. |
| DoS | Bulk dossier download. | Low | Rate limit + cached PARs. |
| Elevation | Regulator submits new IRs. | Low | Role checks (post-S-1). |

### 2.4 Backend (Fastify)

| Threat | Description | Risk | Mitigation |
|---|---|---|---|
| Spoofing | Forged `X-Tenant-Id`. | High | Resolved against TenantStore; unknown → 400. |
| Tampering | Audit log mutated. | Critical | Append-only + hash-chain. |
| Repudiation | Spin outcome denied. | High | `merkleCommit` per spin + audit entry. |
| Info disclosure | Stack trace leak. | Med | Fastify error handler with NODE_ENV guard. |
| DoS | API flood. | High | Per-tenant rate limit; consider WAF/Cloudflare. |
| Elevation | Admin route open. | High | `a01-admin-routes-open` (W205); remediation S-1. |

### 2.5 HSM

| Threat | Description | Risk | Mitigation |
|---|---|---|---|
| Spoofing | Forged signatures. | Critical | ed25519 detached signatures; verify on every retrieval. |
| Tampering | Private key file modified. | Critical | `mode: 0o600`; integrity-monitored mount. |
| Repudiation | Operator denies signing PAR. | Med | `signer` label in every signature record. |
| Info disclosure | Private key leakage. | Critical | Gitignored; never logged; never returned by API. |
| DoS | Sign request flood. | Low | Local op (~ms); rate-limit upstream. |
| Elevation | Key used outside cert workflow. | Med | Only `cert.ts` calls `signCanonical`; static-analysis scan included in OWASP audit. |

### 2.6 Audit log

| Threat | Description | Risk | Mitigation |
|---|---|---|---|
| Spoofing | Forge entry from another session. | Low | Session-scoped append. |
| Tampering | Mutate historic entry. | Critical | Hash-chain `prev` → `current`; `verifyChain` returns brokenAt index. |
| Repudiation | Deny event happened. | Med | Append-only; Merkle root over chain hashes. |
| Info disclosure | Audit dump leaks PII. | Med | Payloads should avoid PII — review per event type. |
| DoS | Unbounded audit growth. | Med | Persist to object store with rolling retention. |
| Elevation | Insert admin event. | Low | No role-based admin events yet. |

---

## 3. Top 10 risks (sorted by risk score)

| Rank | Risk                                                       | Component | STRIDE                | Owner |
|---:  |---                                                         |---        |---                    |---    |
| 1    | HSM private-key exfiltration                                | HSM       | Info disclosure       | Sec   |
| 2    | Audit log tampering                                         | Audit     | Tampering             | Eng   |
| 3    | Admin route open (no operator auth)                         | Backend   | Elevation             | Eng   |
| 4    | Cross-tenant session leakage via WebSocket subscribe        | Backend   | Info disclosure       | Eng   |
| 5    | Wallet exploit (negative / overflow / race)                 | Backend   | Tampering / Elevation | Eng   |
| 6    | Session ID predictability                                   | Backend   | Spoofing              | Eng   |
| 7    | CORS `origin: true` + `credentials: true` combination       | Backend   | Info disclosure       | Eng   |
| 8    | Missing security headers (CSP / HSTS / X-Frame-Options)     | Backend   | Tampering / XSS       | Eng   |
| 9    | API-key entropy not enforced                                | Backend   | Spoofing              | Eng   |
| 10   | No MFA on admin/operator portals                            | Mini-apps | Spoofing              | Sec   |

---

## 4. Residual risk

After remediation roadmap items S-1 through S-8 (see `docs/SOC2_TYPE1_PREP.md`) are
shipped, residual risk drops to:

| Component | Residual risk | Driver                                          |
|---        |---            |---                                              |
| Studio    | Low           | Static SPA; no server-side trust assumption.     |
| Operator  | Low           | RBAC + JWT + MFA cover top spoofing/elevation.   |
| Regulator | Low           | Same as operator + signed cert paper trail.      |
| Backend   | Med           | Single-region; DR/RTO not yet drilled.           |
| HSM       | Low           | Key on disk acceptable for Type I; AWS KMS for Type II. |
| Audit log | Low           | Hash chain + Merkle root.                        |

---

## 5. Review cadence

- **Annual** full re-derivation (next: 2027-05).
- **Per major architecture change** (e.g., DB migration, new SPA).
- **Per Critical OWASP audit finding** as a forcing function.

Captured automatically into `reports/security/OWASP_TOP_10_*.json` for diffing.
