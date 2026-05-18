# Deployment

Containerised deploy. Every mini-app has a Dockerfile and a corresponding `docker-compose` service. The default topology is:

```
[ ingress nginx ]
      |
      +-- /api  -> server (Fastify + Postgres)
      +-- /     -> studio, operator, regulator, marketplace, docs, pitch
```

## Docker quickstart

```bash
npm run docker:up
```

Boots the full stack on a single host. The compose file is `docker-compose.yml` (production) or `docker-compose.dev.yml` (with hot-reload).

Services:

| Container | Port | Image |
|---|---|---|
| server | 4000 | `Dockerfile.server` |
| studio | 5173 | `Dockerfile.studio` |
| operator | 5174 | `Dockerfile.operator` |
| regulator | 5175 | `Dockerfile.regulator` |
| postgres | 5432 | `postgres:16` |

## Kubernetes

A reference Helm chart lives under `docker/k8s/`. Highlights:

- 3 replica `server` deployment with a horizontal pod autoscaler
- `postgres` StatefulSet with a 50 GB persistent volume claim
- `nginx` ingress with TLS terminating at the cluster
- Prometheus ServiceMonitor scraping `/api/metrics`

```bash
helm install slot-math-engine docker/k8s/ \
  --set server.replicas=3 \
  --set ingress.host=engine.example.com
```

## Multi-region

For multi-region (EU + NA + ANZ) the recommended layout is:

- Per-region Postgres primary with cross-region async replicas
- Cert hash-chain replicated to S3 with object-lock to satisfy chain-of-custody
- Per-region HSM ed25519 key, audit chain signed regionally, cross-signed for global replay

## Environment variables

| Var | Purpose | Default |
|---|---|---|
| `PORT` | server listen port | `4000` |
| `DATABASE_URL` | Postgres connection string | required |
| `GAAS_API_KEYS` | comma-separated API keys | empty (dev mode) |
| `HSM_KEY_PATH` | path to HSM ed25519 keypair | `server/data/hsm-keys.json` |
| `LOG_LEVEL` | pino log level | `info` |
| `CORS_ORIGIN` | CORS allow-list | `true` (open) |

## Database migrations

```bash
npm run db:migrate
```

Schema-version-tagged. Idempotent. Re-runnable on every container start.

## Backup + restore

```bash
npm run db:backup    # pg_dump to ./out/db-backup-<ts>.sql
npm run db:restore   # psql restore from latest backup
```

Production cron: nightly backup + weekly restore-test against a scratch instance.

## Smoke test after deploy

```bash
npm run deploy:smoke
```

Hits `/api/health/deep`, runs a synthetic spin, and verifies the audit chain. Fails the CD pipeline on any non-200.

## Rollback

```bash
npm run deploy:rollback
```

Retags the previous image as `current` and restarts the deployment. Postgres migrations are forward-only; the rollback strategy is to keep one major release of backwards-compatible reads.
