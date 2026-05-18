# Runbook — slot-math-engine-template

W210 Faza 600.0 — operational runbook for the live operator
integration stack. Targets oncall engineers responsible for tenant
health, deployments, and incident response.

## Oncall expectations

| Role          | SLO                                                       |
| ------------- | --------------------------------------------------------- |
| Primary       | Ack within 5 min, mitigate within 30 min                  |
| Secondary     | Backup if primary doesn't ack within 5 min                |
| Engineering   | Escalation path for unknown failure modes                 |
| Compliance    | Brought in within 30 min of any cert/audit related alert  |

Channels: `#slot-engine-oncall` (page-eligible), `#slot-engine-cert`
(compliance only), `#slot-engine-deploys` (informational).

## How to diagnose an RTP drift alert

Symptoms: PagerDuty alert title `RTP drift > 1pp sustained 1h`,
`severity=critical`, Grafana panel `dashboard-tenant → Tenant RTP
trend` shows a step.

Triage in order:

1. **Confirm scope.** Open `dashboard-tenant`, filter by alert
   tenant. Is the drift on every game or one game? Single-game
   drift usually points to a kernel issue; multi-game points to
   wallet/RNG.
2. **Check recent deploys.** `gh run list --workflow=deployment-rehearsal`
   and the `deployments` table for the tenant. If a deploy in the
   last 24h matches the drift onset, treat as canary regression.
3. **Compare canary vs production RTP.** On `dashboard-deployment`,
   inspect `canary_rtp - production_rtp`. If the canary diverged
   first, the canary controller should already have rolled back —
   confirm via the `deployment_rollbacks_total` counter.
4. **Inspect RNG quality.** `npm run rng-quality -- --tenant=<id>`.
   A failure points to upstream seed corruption.
5. **Decide.** Manual rollback (see below) if a deploy is the
   trigger; open a P1 with engineering otherwise.

## How to trigger a manual rollback

```bash
# 1. Identify the previous-known-good deployment for the tenant
psql -c "SELECT id, version, created_at FROM deployments \
         WHERE tenant_id='<uuid>' AND status='live' \
         ORDER BY created_at DESC LIMIT 5;"

# 2. Drive the rollback via the API
curl -X POST https://op.example.com/api/admin/deployments/<id>/rollback \
  -H "X-User-Role: admin" \
  -H "content-type: application/json" \
  -d '{"reason": {"kind": "operator_manual", "operatorId": "$USER",
                  "note": "RTP drift, see PD-1234"}}'

# 3. Watch the post-mortem template arrive in #slot-engine-deploys.
# 4. RPO/RTO are reported in the API response (look for rpoSeconds /
#    rtoMs); attach to the incident timeline.
```

If the API is unreachable, fall back to the blue/green switch:

```bash
node scripts/deployment/blue-green-switch.mjs --to=blue
```

This restores the prior environment atomically and writes
`reports/deployment/state.json` for audit.

## How to add a new tenant

1. Generate UUID and add row to `tenants` table (idempotent — script
   handles re-runs).
2. Create initial manifest (default `complianceVerdicts` for the
   tenant's primary jurisdiction).
3. Upload via the operator console; the new manifest enters status
   `pending`.
4. Trigger canary by promoting to status `canary` — the controller
   takes over from there.
5. Subscribe the tenant id to dashboards: add to template variable on
   `dashboard-tenant` (no code change needed — it's a Prometheus label
   query).
6. Add the tenant's webhooks to `observabilityConfig.alertWebhooks`
   on the manifest so PagerDuty fires into the tenant's own pager.

## How to read the dashboards

| Dashboard               | Use when ...                                              |
| ----------------------- | --------------------------------------------------------- |
| `dashboard-overview`    | Global incident, asking "is everything OK"                |
| `dashboard-tenant`      | A single tenant complains about RTP / latency             |
| `dashboard-deployment`  | A canary is in flight; tracking promote/rollback decision |
| `dashboard-wallet`      | Player reports balance mismatch or settlement lag         |
| `dashboard-marketplace` | Compliance asks about author payouts or kernel adoption   |
| `dashboard-cert`        | Cert lab queries about a specific dossier                 |

Panel coloring is defensive — red on every panel means scope is real;
red on a single panel often means a stuck scrape target. Always
cross-check with `dashboard-overview → Error rate` before declaring
a real incident.

## How to interpret a canary stage transition log

Stage transitions emit JSON-ish lines via the controller's
`onStageLog` hook. Format: `stage=sN rolloutPercent=P status=... ...`.

Examples:

```text
stage=s0 rolloutPercent=1 status=started
stage=s1 rolloutPercent=5 status=promoted from=s0
stage=s2 rolloutPercent=25 status=promoted from=s1
stage=s3 rolloutPercent=100 status=live
```

A rollback line looks like:

```text
stage=s1 status=rollback trigger=rtp_drift
```

The trigger is one of `rtp_drift`, `error_rate`, `latency_p99`, or
`replay_nondeterministic` — each maps to a defined gate in the
controller.

## How to run a smoke check from oncall

```bash
# Against the live environment
node scripts/smoke-tests/run-all-smoke.mjs --target=https://op.example.com

# Against your laptop / staging
node scripts/smoke-tests/run-all-smoke.mjs --target=http://localhost:4000

# Without a backend — proves the harness itself works
node scripts/smoke-tests/run-all-smoke.mjs --synthetic
```

The orchestrator writes `reports/smoke/summary.json`. A clean run
ends with `okCount === totalScripts` and `failCount === 0` in under
5 minutes.

## RPO / RTO targets

| Operation         | RPO  | RTO   | Notes                              |
| ----------------- | ---: | ----: | ---------------------------------- |
| Rollback          | 60s  | 5min  | Snapshot every minute              |
| Tenant promotion  | 0s   | 30min | Each stage 30min by default        |
| Blue/green switch | 0s   | 5min  | Atomic, with health probe          |

## Audit / cert escalations

Any rollback with `reason.kind === 'audit_corruption'` is an
automatic P0. Procedure:

1. Page compliance immediately.
2. Freeze new deploys for the affected tenant.
3. Preserve the audit log snapshot from the rollback engine output.
4. Hand off to engineering with the chain-break event id.
5. Schedule blameless post-mortem within 48h.

## Common one-liners

```bash
# What's deployed where?
psql -c "SELECT tenant_id, version, status FROM deployments \
         WHERE status IN ('canary','rolling','live') \
         ORDER BY tenant_id, created_at DESC;"

# How healthy is the queue of pending verdicts?
curl https://op.example.com/api/admin/metrics | grep cert_pipelines_in_flight

# Most recent rollback per tenant
psql -c "SELECT DISTINCT ON (tenant_id) tenant_id, version, rollback_reason, \
         created_at FROM deployments WHERE status='rolled_back' \
         ORDER BY tenant_id, created_at DESC;"
```
