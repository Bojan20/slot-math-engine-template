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
- Social engineering of L&W staff or contractors.
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
