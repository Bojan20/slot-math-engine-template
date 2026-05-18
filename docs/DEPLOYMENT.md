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
