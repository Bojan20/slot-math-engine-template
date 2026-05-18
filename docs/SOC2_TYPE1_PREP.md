# SOC 2 Type I — Preparation Pack

**Author:** CORTI W205-SECURITY
**Last updated:** 2026-05-18
**Audience:** L&W audit committee, external auditor, SRE.

This document is the entry point for SOC 2 Type I preparation work on
the `slot-math-engine-template` platform. Type I reports on the *design*
of controls at a point in time; Type II adds evidence of operating
effectiveness over a 6-12 month window. Each control criterion (CC1–CC9)
captures: current state, gaps, remediation roadmap, and evidence
collection plan.

---

## CC1 — Control Environment

| Aspect              | Current state                                                                                  | Gap                                   | Remediation                                                                                          | Evidence                                              |
|---                  |---                                                                                            |---                                    |---                                                                                                   |---                                                    |
| Tenant isolation    | `TenantStore` (`server/state/tenants.ts`) with per-tenant rate limit + jurisdiction allowlist. | No row-level isolation in DB (planned). | Add tenant-id partitioning when migrating to Postgres.                                                | `server/state/tenants.ts`; W205 OWASP audit JSON.     |
| Role-based access   | None (all routes share preHandler).                                                            | Critical for SOC 2.                   | Introduce roles (`admin`, `operator`, `regulator`) on Tenant model; per-route scope check.            | Future commit.                                        |
| Code review process | Required for `main` (CODEOWNERS placeholder).                                                  | No mandatory two-reviewer rule yet.   | Branch protection rule on GitHub.                                                                    | Repo settings screenshot.                             |
| Onboarding / offboarding | Manual via `gh` admin.                                                                    | No automation.                        | Document in runbook + Terraform IAM module.                                                          | `docs/INCIDENT_RESPONSE.md` runbook.                  |

## CC2 — Communication & Information

| Aspect                        | Current state                                       | Gap | Remediation                                                                | Evidence |
|---                            |---                                                  |---  |---                                                                         |---       |
| Incident response plan        | `docs/INCIDENT_RESPONSE.md` (this wave).            | Tabletop drills not scheduled. | Quarterly drill calendar; postmortem template.                              | This file. |
| Internal channel for incidents | Slack #incident-response (placeholder).             | Not provisioned. | Create channel + PagerDuty routing.                                          | Slack admin. |
| Customer / regulator escalation | Cert paper trail signed with ed25519 HSM signatures. | No SLA published. | Publish status page + breach-notification SLA.                              | `server/state/cert.ts`. |

## CC3 — Risk Assessment

| Aspect           | Current state                              | Gap                          | Remediation                                                            | Evidence                          |
|---               |---                                         |---                           |---                                                                     |---                                |
| Threat model     | `docs/THREAT_MODEL.md` (this wave).        | Needs annual review cadence. | Add to OWASP audit weekly CI; SRE quarterly review.                     | This file + STRIDE table.         |
| Risk register    | Not formalized.                            | Required for SOC 2.          | Adopt simple register (Likelihood × Impact) tracked in repo.            | Future commit.                    |
| Vendor risk      | No vendor questionnaire on file.           | Required for sub-processors. | Standard SIG-Lite / CAIQ before adopting any paid SaaS.                 | Vendor questionnaire repository.  |

## CC4 — Monitoring Activities

| Aspect             | Current state                                                  | Gap                          | Remediation                                                                | Evidence                                       |
|---                 |---                                                             |---                           |---                                                                         |---                                             |
| Audit log          | `AuditStore` hash-chain (`server/state/audit.ts`).             | Single-node in-memory.       | Persist to append-only object store; verify chain on every boot.            | OWASP A08 finding `a08-hash-chain` info.       |
| Application metrics | `/api/metrics` Prometheus text format.                        | No collector wired.          | Standup Prometheus + Grafana + Alertmanager.                                | `server/routes/health.ts`.                     |
| Alerts             | Placeholder (PagerDuty in `docs/PRODUCTION_HARDENING.md`).     | Routing not configured.      | Wire Alertmanager → PagerDuty / Slack with severity routing.                | Runbook section in INCIDENT_RESPONSE.md.       |

## CC5 — Control Activities

| Aspect                    | Current state                                                   | Gap                                | Remediation                                                                                            | Evidence                                                |
|---                        |---                                                              |---                                 |---                                                                                                     |---                                                      |
| CI/CD gating              | `.github/workflows/full-stack.yml` with engine/server/audit jobs. | New security job to be added (W205). | Wire `security` job in `full-stack.yml` running owasp/deps/secrets sweeps; fail on Critical.            | `.github/workflows/full-stack.yml` (post-W205).         |
| Change management         | Conventional Commit + PR review.                                | No required CODEOWNERS yet.        | Add CODEOWNERS for security-sensitive paths.                                                            | Repo settings.                                          |
| Deployment pipeline       | `scripts/deploy.sh` + Dockerfile multi-stage builds.            | No artifact signing.               | Add cosign signing in release workflow.                                                                 | `Dockerfile.server`, `scripts/deploy.sh`.               |

## CC6 — Logical & Physical Access Controls

| Aspect          | Current state                                                                                  | Gap                  | Remediation                                                                       | Evidence                                          |
|---              |---                                                                                            |---                   |---                                                                                |---                                                |
| API keys        | GaaS accepts `x-api-key` from env-var allowlist (`GAAS_API_KEYS`).                              | No length/entropy gate. | Document policy: ≥ 32 random bytes, base64; reject otherwise.                     | `server/routes/gaas.ts` checkApiKey.              |
| Session management | `SessionStore` with jurisdiction-aware pacing + loss limits.                                 | Session IDs use `Date.now()`. | Replace with `crypto.randomBytes(16).toString('hex')`.                            | OWASP A04 `a04-session-id-predictable`.           |
| MFA             | Not implemented.                                                                              | SOC 2 requirement.   | Add TOTP MFA for admin/operator portals.                                          | Future commit.                                    |
| Physical access | Cloud-hosted (AWS / GCP placeholders).                                                        | Provider attestations not on file. | Collect SOC 2 reports for AWS / Cloudflare / GitHub.                              | Vendor folder.                                    |

## CC7 — System Operations

| Aspect       | Current state                                                          | Gap                                | Remediation                                                                                   | Evidence                                       |
|---           |---                                                                     |---                                 |---                                                                                            |---                                             |
| Backup       | HSM keypair persisted to `server/data/hsm-keys.json` (mode 0600).      | No off-site backup of HSM key.     | Mirror to AWS KMS or escrow service; rotate quarterly.                                          | `server/state/hsm.ts`.                         |
| DR / RTO     | Not documented.                                                        | SOC 2 requirement.                 | Document RTO/RPO targets and tested restore procedure.                                          | DR runbook (placeholder).                      |
| Capacity     | `npm run perf:audit` baseline, no live load data.                      | No production traffic baseline.    | Capture k6 baseline; alert on p99 latency drift.                                                | `docs/PRODUCTION_HARDENING.md` §5.             |

## CC8 — Change Management

| Aspect              | Current state                                            | Gap                  | Remediation                                                          | Evidence                                       |
|---                  |---                                                       |---                   |---                                                                   |---                                             |
| Git workflow        | PR review + branch protection (`main`).                  | No mandatory 2 reviewers. | Configure branch protection with 2 required approvals.                | GitHub settings.                               |
| CI gates            | typecheck + tests + lint + cargo clippy.                 | No security gate yet. | New `security` job (W205).                                            | `.github/workflows/full-stack.yml`.            |
| Release notes       | `SLOT_ENGINE_MASTER_TODO.md` wave records.               | No semver release tags. | Move to semver + auto-changelog (cocogitto).                          | `package.json` version + changelog file.       |

## CC9 — Risk Mitigation

| Aspect              | Current state                                       | Gap                              | Remediation                                                                | Evidence                          |
|---                  |---                                                 |---                               |---                                                                         |---                                |
| Cyber insurance     | Placeholder.                                        | Required by enterprise customers. | Procure cyber-liability policy ≥ $5M.                                       | Policy PDF.                       |
| Vendor risk         | No third-party SaaS in critical path other than GitHub. | Onboarding paid vendors needs gates. | Vendor risk questionnaire + DPA template.                                  | Vendor folder.                    |
| Sub-processor list  | None (self-hosted).                                 | Required for B2B contracts.       | Maintain DPA-style sub-processor list.                                      | Public sub-processor URL.         |
| Insurance review    | Annual.                                             | Not scheduled.                    | Calendar with renewal reminders.                                            | Insurance calendar.               |

---

## Evidence collection plan

| Evidence                                  | Source                                       | Cadence    |
|---                                        |---                                           |---         |
| OWASP audit report                        | `reports/security/OWASP_TOP_10_<date>.json`  | Weekly CI  |
| Dependency CVE report                     | `reports/security/DEPENDENCIES_<date>.json`  | Weekly CI  |
| Secrets sweep                             | `reports/security/SECRETS_SWEEP_<date>.json` | Weekly CI  |
| CI pipeline run logs                      | GitHub Actions                               | Per PR     |
| Performance + accessibility audits        | `reports/performance/`, `reports/accessibility/` | Per PR  |
| HSM signature verification logs           | `server/routes/cert.ts` verify-signature     | Per cert   |
| Vendor SOC 2 reports                      | Vendor portal                                | Annual     |
| Penetration test reports                  | `docs/PENTEST_PLAN.md` deliverable           | Annual     |

---

## Open items

| ID  | Item                                                  | Owner | Target wave |
|---  |---                                                    |---    |---          |
| S-1 | Implement RBAC roles on TenantStore                   | Eng   | W206        |
| S-2 | Add `@fastify/helmet` with CSP/HSTS/X-Frame-Options   | Eng   | W206        |
| S-3 | Tighten CORS allow-list (remove `origin: true`)       | Eng   | W206        |
| S-4 | Replace session ID gen with `crypto.randomBytes(16)`  | Eng   | W206        |
| S-5 | Wire centralized logging (CloudWatch / Datadog)       | SRE   | W207        |
| S-6 | Tabletop incident-response drill                      | Sec   | W207        |
| S-7 | Cosign signing of release artifacts                   | SRE   | W207        |
| S-8 | Procure cyber-liability insurance                     | Ops   | W208        |
