# Continuous Security Hardening

W214 Faza 600.3 — overview of the continuous-hardening CI pipeline.

The hardening pipeline runs four GitHub Actions workflows in addition
to the manual `security:audit` / `chaos:run-all` / `security:pentest`
scripts shipped in W212-W213. Together they guarantee that:

1. Security gates stay GREEN on `main` (any regression files an issue
   inside 24h).
2. PRs cannot land if they introduce a security regression.
3. Fuzz testing runs in the background weekly, producing fresh
   coverage data for every release.
4. Every dependency change carries an SBOM and license/CVE gate.

## Workflow inventory

| Workflow | Trigger | Budget | Purpose |
| --- | --- | --- | --- |
| `daily-security-audit.yml` | `0 6 * * *` cron + dispatch | 15 min | npm audit + 11-category audit + dep-review + pentest |
| `pr-security-gate.yml` | every PR | 10 min | Audit delta vs baseline, comments delta, blocks regression |
| `fuzz-testing.yml` | Sunday `0 2 * * 0` cron + dispatch | 75 min Rust + 30 min TS | cargo-fuzz 1h × 3 targets, then TS harness |
| `dependency-review.yml` | PR if `package*.json` changes | 10 min | License + CVE gate, SBOM (CycloneDX 1.5) |

All workflows have `workflow_dispatch` for ad-hoc runs.

## Daily audit — runbook

When the workflow opens a `[daily-audit] FAIL …` issue:

1. Download the latest `daily-security-${{ run_id }}` artifact.
2. Inspect `AUDIT_REPORT.md` — find the failing category.
3. Cross-reference `baseline-diff.json` for NEW CVEs that landed.
4. Fix the underlying issue (NEVER snooze).
5. Re-run via `gh workflow run daily-security-audit.yml`.

The artifact retention is 90 days.

## PR security gate — what blocks merge?

A merge is blocked when any of these are true:

- `npm run security:audit` returns non-zero on the PR branch.
- Any of the three fast pentest scenarios (cross-tenant, jwt-forge,
  sql-injection) returns non-zero.
- `scripts/security/pr-delta.mjs` reports `regression: true` (any
  audit category flipped PASS → WARN, WARN → FAIL, PASS → FAIL).

Slower pentest scenarios (rate-limit-bypass, replay-attack,
timing-side-channel) run in `daily-security-audit.yml` only.

## Fuzz testing — corpus + crash handling

- Rust targets: `fuzz_alias`, `fuzz_eval_config`, `fuzz_packed_grid`.
- TS targets: `ir-evaluator`, `marketplace-api`, `wallet-providers`,
  `cert-bundle`.
- Corpus is cached across runs via `actions/cache@v4`; crashes upload
  as artifacts and auto-file `[fuzz crash] …` issues.
- Coverage trend recorded in `reports/fuzz/coverage-trend.json` —
  feeds the security dashboard.

To run TS fuzz locally:

```
ITER=10000 npm run fuzz:all          # default 10k iter
npm run fuzz:all:full                # 100k iter
npm run fuzz:ir                      # single harness
```

Output: `reports/fuzz/REPORT.{json,md}` + `reports/fuzz/crashes/`.

## Dependency review — license + CVE gate

The gate refuses to merge PRs that:

- Add a dependency under a non-permissive license (GPL/AGPL/SSPL/BSL).
- Add a dependency with HIGH+ CVE not on the dev-only allowlist
  (`scripts/security/audit.mjs#CVE_DEV_ONLY_PACKAGES`).

The CycloneDX 1.5 SBOM is uploaded as a workflow artifact named
`sbom-${commit}.json` for every PR + main commit.

## Adding a new audit category

1. Implement the check in `scripts/security/audit.mjs` returning the
   `{ id, title, verdict, summary, details }` shape.
2. Append the check to the array in `runAudit()`.
3. Add specs in `scripts/tests/security-audit.test.mjs`.
4. Update `reports/security/baseline.json` once the new check passes
   on `main`.

## Anomaly auto-mitigation

`server/lib/anomaly-mitigation.ts` ships an engine that maps
operational alerts to mitigation actions:

| Alert | Mitigation |
| --- | --- |
| `rtp_drift` ≥ 1pp sustained ≥ 1h | rollback (W210 engine) |
| `audit_chain_gap` | freeze writes + start resync |
| `wallet_provider_down` ≥ 5min | switch to backup provider |
| `rate_limit_breach` ≥ 600/min | block IP 15 min |
| `hsm_rotation_incomplete` | fallback to previous key version |

Every mitigation logs via the W208 observability sink + appends a
tenant audit log entry.

## Compliance posture tracker

`server/state/compliance-posture.ts` tracks per-jurisdiction × per-
tenant × per-game cert validity, RTS compliance status, outstanding
findings, and last-review timestamp. The admin endpoint
`/api/admin/compliance-posture` returns:

```json
{
  "generatedAt": "...",
  "counts": { "compliant": 12, "non_compliant": 1, "pending_review": 0 },
  "outstandingFindings": 3,
  "upcomingExpiries": [ { ..., "daysRemaining": 47 } ],
  "entries": [ ... ]
}
```

Cert-expiry alerts fire 60 days before `certValidUntil`.

## Security regression dashboard

`npm run security:dashboard` aggregates the last 30 days of audit
snapshots and renders:

- `reports/security/SECURITY_DASHBOARD.json` (data).
- `reports/security/SECURITY_DASHBOARD.md` (text summary).
- `reports/security/SECURITY_DASHBOARD.html` (SVG line charts).

The dashboard is regenerated daily by `daily-security-audit.yml`.

## Local development

To replay the full hardening sweep locally before pushing:

```
npm run security:audit
npm run security:dep-review
npm run security:pentest
npm run security:dashboard
npm run security:sbom
npm run fuzz:all
```

Every script exits non-zero on FAIL so it composes cleanly with `&&`.
