# Deployment Guide — slot-math-engine-template

CORTI 200.6-DEVOPS — multi-tenant Docker stack, CI lab submission,
IR migration, and rollout tooling.

## Components

| Service     | Port  | Image                                | Purpose                        |
|-------------|-------|--------------------------------------|--------------------------------|
| `server`    | 4000  | `slot-math-engine/server:latest`     | Fastify backend + tenant API   |
| `studio`    | 5173  | `slot-math-engine/studio:latest`     | Game design studio SPA         |
| `operator`  | 5174  | `slot-math-engine/operator:latest`   | Operator dashboard SPA         |
| `regulator` | 5175  | `slot-math-engine/regulator:latest`  | Regulator portal SPA           |
| `postgres`  | 5432  | `postgres:16-alpine`                 | Placeholder for wallet/audit   |

## Quick start

```bash
# Build + boot everything
docker compose up -d --build

# Tail logs
docker compose logs -f server

# Health check
curl http://localhost:4000/api/health
curl http://localhost:4000/api/health/deep
curl http://localhost:4000/api/metrics
```

Studio at <http://localhost:5173>, operator at <http://localhost:5174>,
regulator at <http://localhost:5175>. The nginx config in each SPA image
proxies `/api/*` to the `server` service via the bridge network.

### Dev mode (live reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Source dirs are bind-mounted; `tsx watch` and `vite dev` pick up edits.

## Multi-tenant configuration

Tenants are managed via:

```bash
# Create
curl -X POST http://localhost:4000/api/admin/tenants \
  -H 'Content-Type: application/json' \
  -d '{"id":"acme","name":"Acme Casino","contactEmail":"ops@acme.io","allowedJurisdictions":["UKGC","MGA"],"rateLimits":{"requestsPerMinute":300}}'

# List
curl http://localhost:4000/api/admin/tenants

# Update
curl -X PATCH http://localhost:4000/api/admin/tenants/acme \
  -d '{"rateLimits":{"requestsPerMinute":1000}}'

# Delete
curl -X DELETE http://localhost:4000/api/admin/tenants/acme
```

Set `TENANT_REGISTRY_FILE=/app/state/tenants.json` to persist tenants
across restarts (the file is rewritten atomically on every CRUD op).

Clients identify themselves with the `X-Tenant-Id` header. A request
with no header binds to `default`; an unknown id returns 400. Per-tenant
rate limit is a rolling 60s window; exceeding the cap returns 429 with
a `Retry-After` header.

## CI lab submission

```bash
# Stub mode (default — no real lab call, useful in CI)
npm run cert:submit -- --game classic-5x3-20lines --jurisdiction UKGC --stub

# Real lab
CERT_LAB_URL=https://gli.example.com/api npm run cert:submit -- \
  --game classic-5x3-20lines --jurisdiction UKGC

# Custom IR + PAR + op-pkg
npm run cert:submit -- \
  --game my-game \
  --jurisdiction MGA \
  --ir out/my-game.ir.json \
  --par out/my-game.par.json \
  --operator-package out/my-game.zip
```

Exit codes: 0 = approved, 1 = rejected, 2 = timeout, 3 = bad inputs.

## IR migrations

```bash
# Single file
npm run migrate-ir -- --file web/studio/ir-library/classics/classic-5x3-20lines.ir.json

# Whole library
npm run migrate-ir -- --batch web/studio/ir-library/ --target 1.1.0

# Dry run
npm run migrate-ir -- --batch web/studio/ir-library/ --dry-run
```

Each file is backed up as `*.ir.json.bak` before rewrite. Validation
runs after every migration; on failure the file is restored from `.bak`.

## Release flow

```bash
# 1. Tag
npm run deploy:tag -- v1.0.0
git push origin v1.0.0

# 2. Build + push (REGISTRY_URL=ghcr.io/myorg)
npm run deploy:build -- v1.0.0
npm run deploy:push -- v1.0.0

# 3. Deploy (kubectl or ssh)
DEPLOY_TARGET=kubectl K8S_NAMESPACE=sme bash scripts/deploy.sh deploy v1.0.0

# 4. Smoke test
npm run deploy:smoke -- https://api.prod.example.com

# 5. Rollback if needed
npm run deploy:rollback -- v0.9.0
```

## Health & monitoring

- `GET /api/health` — fast per-component status (200 unless something throws).
- `GET /api/health/deep` — canary write to audit chain + verify; returns
  503 if any probe fails. Use this as the readiness gate in k8s.
- `GET /api/metrics` — Prometheus text format. Scrape every 15s.

## CI pipelines

`.github/workflows/full-stack.yml` runs on every PR and push to `main`:

1. Engine tests (vitest + cargo)
2. Studio tests
3. Server tests
4. Operator + Regulator tests
5. Vite builds for all three SPAs
6. Docker build smoke test
7. Playwright e2e

Matrix: `ubuntu-latest` + `macos-14` (Apple silicon).

---

## W210 Faza 600.0 — Live Operator Integration

The W210 wave introduces the production deployment-rehearsal stack:
deployment manifests, a canary controller, automated rollback, smoke
tests, blue/green scripts, and Grafana dashboards.

### Deployment manifest

Every promotion is governed by a `DeploymentManifest` (see
`server/lib/deployment/manifest.ts`):

| Field                  | Meaning                                          |
| ---------------------- | ------------------------------------------------ |
| `version`              | semver of the deployment artifact                |
| `tenantId`             | tenant UUID owning the deployment                |
| `jurisdiction`         | ISO-2 jurisdiction code (UKGC, MGA, SE, NJ, ...) |
| `games[]`              | pinned game id + semver                          |
| `walletProvider`       | wallet integration id                            |
| `complianceVerdicts[]` | cert lab verdicts authorizing the deploy         |
| `rolloutPercent`       | final target rollout (usually 100)               |
| `canaryStrategy`       | `linear` / `exponential` / `adaptive`            |
| `rollbackTriggers`     | gate thresholds (RTP, error, latency, audit)     |
| `observabilityConfig`  | scrape interval + alert hooks + dashboards       |

Manifests are persisted in the `deployments` Postgres table
(migration `012_deployments.sql`) with a JSONB column so external
tooling can index without schema-coupling.

### Canary stages

The default strategy (`linear`) advances through four stages:

| Stage | Rollout % | Hold time |
| ----- | --------: | --------- |
| s0    |        1% | 30min     |
| s1    |        5% | 30min     |
| s2    |       25% | 30min     |
| s3    |      100% | live      |

Each stage evaluates four health gates per sample:

1. **RTP drift** — `|RTPcanary - RTPproduction| < rtpDriftPp/100`.
2. **Error rate** — `errorRate < rollbackTriggers.errorRate`.
3. **Latency** — `p99 ≤ baseline × latencyP99Multiplier`.
4. **Replay determinism** — bit-identical replay of a 1000-spin sample.

If any gate fails, the controller emits a `rollback` decision with the
trigger reason. If the stage window passes cleanly, it emits `promote`
and advances. Stage 3 emits `live` once the configured hold elapses.

Adaptive strategy halves the per-stage hold when the sample shows
comfortable margin against every gate, accelerating safe rollouts.

### Rollback procedure

The `RollbackEngine` is invoked for four triggers (enumerated in
`ROLLBACK_TRIGGERS`):

- `canary_gate_failure` — emitted by the controller during canary.
- `operator_manual` — operator clicks "rollback" in the console.
- `anomaly_alert` — RTP drift > 1pp sustained for 1h on live traffic.
- `audit_corruption` — audit-log integrity break detected.

Procedure on rollback:

1. Snapshot current state (manifest + tenant config + game-state digest).
2. Restore previous manifest atomically via the `RouteSwap` interface.
3. Write `audit` entry with `from`/`to` versions + reason.
4. Notify operator (`critical` severity).
5. Mail post-mortem template (`renderPostMortem`).

**Recovery objectives:**

- **RPO ≤ 60s** — at most 60s of writes can be lost.
- **RTO ≤ 5min** — rollback wallclock under 5 minutes.

In test mode both targets are exercised at sub-second resolution.

### Smoke tests

`scripts/smoke-tests/` ships six smokes that all support `--synthetic`
mode for CI rehearsal and a `--target` URL for live verification:

| Smoke                       | Verifies                                    |
| --------------------------- | ------------------------------------------- |
| `smoke-spin-flow`           | auth → debit → spin → credit → audit chain  |
| `smoke-license-verify`      | marketplace licenses for tenant resolve     |
| `smoke-jurisdiction-rules`  | every jurisdiction profile shape is valid   |
| `smoke-rng-determinism`     | 1000-spin replay is bit-identical           |
| `smoke-cert-export`         | dossier generation completes                |
| `smoke-wallet-providers`    | every configured provider reports healthy   |

`run-all-smoke.mjs` orchestrates them in parallel with a 5-minute
total budget and writes `reports/smoke/summary.json`. Each smoke
emits a single-line JSON envelope so the orchestrator can aggregate
without parsing free-form output.

### Blue/green scripts

`scripts/deployment/` contains the blue/green helpers, all idempotent
and all `--dry-run` capable:

- `prepare-green.mjs` — stage a new version on the inactive side.
- `health-probe.mjs` — health probe against `blue` or `green`.
- `traffic-shift.mjs` — gradual shift (default 10%/min, configurable).
- `blue-green-switch.mjs` — atomic active swap, refuses unhealthy targets.

State persists in `reports/deployment/state.json` so the operations
compose and resume.

### Observability dashboards

Grafana dashboard JSONs live under `reports/observability/dashboards/`
and target the Prometheus endpoint exposed by `registerObservability`
(see `server/lib/observability.ts`):

- `dashboard-overview.json` — global RTP / hit / latency / errors.
- `dashboard-tenant.json` — per-tenant sessions / volume / revenue.
- `dashboard-deployment.json` — canary stage / health score / drift.
- `dashboard-wallet.json` — provider health, debit/credit latency.
- `dashboard-marketplace.json` — installs / purchases / earnings.
- `dashboard-cert.json` — cert pipeline by lab + verdicts.

Import each into Grafana 10.x with the `PROM` datasource UID.

### CI rehearsal

Two new workflows run on every push to main:

- `.github/workflows/deployment-rehearsal.yml` — builds the project,
  runs the smoke suite in synthetic mode, dry-runs the blue/green
  scripts, and uploads `reports/smoke/summary.json` as an artifact.
- `.github/workflows/cert-dossier-rehearsal.yml` — exercises the cert
  export smoke on every PR.

