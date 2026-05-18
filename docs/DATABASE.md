# DATABASE — Postgres persistence layer (W206-PERSISTENCE)

This document describes the optional Postgres backend introduced in
Wave W206. Without `USE_POSTGRES=true`, the Fastify backend remains
fully in-memory and the existing test suite is unaffected.

## TL;DR

| Mode                                  | Sessions   | Wallet     | Audit      | Tenants    | Cert       | Games      |
|---------------------------------------|------------|------------|------------|------------|------------|------------|
| `USE_POSTGRES` unset / `false` (def.) | in-memory  | in-memory  | in-memory  | in-memory  | in-memory  | in-memory  |
| `USE_POSTGRES=true`                   | postgres   | postgres   | postgres   | postgres   | postgres   | postgres   |

Production: set `USE_POSTGRES=true` and `DATABASE_URL` in the env
block of `docker-compose.yml` and your Fly / k8s manifest.

## Schema overview

| Table                 | PK                   | Notes                                                                  |
|-----------------------|----------------------|------------------------------------------------------------------------|
| `schema_migrations`   | `version`            | Idempotent run log — one row per applied .sql file                     |
| `sessions`            | `session_id`         | Full mutable shape lives in `state JSONB`; indexed by `player_id`      |
| `wallet_balances`     | `player_id`          | `balance_minor BIGINT`, CHECK `>=0`                                    |
| `wallet_transactions` | `transaction_id`     | BIGSERIAL, indexed by `(player_id)` and `created_at DESC`              |
| `audit_log`           | `audit_id`           | Hash-chained; UNIQUE `(session_id, seq)` to prevent double-append     |
| `tenants`             | `tenant_id`          | `config JSONB` holds jurisdictions / rate-limit / branding             |
| `cert_submissions`    | `submission_id`      | Stores IR, PAR sheet, PAR PDF bytes, HSM signature, op-package        |
| `users` / `roles`     | `user_id` / `role_id`| Owned by W206-SECURITY; created here so dependencies are explicit     |
| `games`               | `game_id`            | Mirrors GamesRegistry; indexed by supplier + category                  |

## Connection lifecycle

`server/db/connection.ts` exposes a `PgConnection` with:

- `connect()` — builds the pool, retries up to 5x with exponential
  backoff (250ms → 4s).
- `query(sql, params?)` — pool.query passthrough.
- `withTransaction(fn)` — BEGIN/COMMIT/ROLLBACK wrapper.
- `health()` — `SELECT 1` + latency.
- `shutdown()` — drain the pool; called from `app.addHook('onClose', …)`
  in `server/index.ts`.

`server/db/migrate.ts` runs migrations from `server/db/migrations/`
on every server boot (when `USE_POSTGRES=true`). Migrations are
idempotent (`CREATE TABLE IF NOT EXISTS`) so reboots and partial
applications are safe.

## Hash-chain preservation

The Postgres-backed `AuditStore` (`server/state/audit-pg.ts`)
preserves the per-session hash chain across restarts:

1. `SELECT this_hash, seq FROM audit_log WHERE session_id = $1
    ORDER BY seq DESC LIMIT 1 FOR UPDATE` — read the chain head.
2. Compute `this_hash = sha256(canonical_json({seq, ts, type, payload, prev}))`.
3. `INSERT INTO audit_log (…, prev_hash, this_hash, …)` inside the
   same transaction.

After a restart, `append()` finds the prior head in the table and
the new row links to it cleanly. `verify(sessionId)` re-derives every
hash and confirms the chain is intact.

## Concurrency

- Wallet debit (`wager`, `withdraw`) uses
  `INSERT … ON CONFLICT DO UPDATE` to upsert the row, then
  `UPDATE … SET balance_minor = balance_minor - $1` inside a
  transaction. The `wallet_balance_nonneg` CHECK constraint
  blocks negative balances even if a race somehow slips through.
- Session `recordSpin` uses `SELECT … FOR UPDATE` to serialise
  per-session counter updates.

## Migration mode (env flag)

| Var               | Default | Effect                                              |
|-------------------|---------|-----------------------------------------------------|
| `USE_POSTGRES`    | `false` | When `true`, connect + run migrations on boot       |
| `DATABASE_URL`    | unset   | Full Postgres URL                                   |
| `PG_POOL_MAX`     | `20`    | Pool max connections                                |

In test code (vitest), `USE_POSTGRES` is left unset so the existing
in-memory stores serve every test. The new `*-postgres.test.ts`
suites construct a `PgConnection` with a hand-rolled fake pool
(`server/tests/fake-pg.ts`) — no real Postgres needed in CI.

For integration tests against a real cluster, run inside the
`postgres` service from `docker-compose.yml`.

## Backup / restore

- `bash scripts/db-backup.sh [out-dir]` — `pg_dump -Fc`,
  output `sme-<TS>.dump`. Encryption + S3 upload are placeholders.
- `bash scripts/db-restore.sh <dump-file>` — validates with
  `pg_restore --list`, restores with `--clean --if-exists`, then
  prints post-restore row counts on the six core tables.

Schedule daily backups via cron:

    0 3 * * *  /opt/sme/scripts/db-backup.sh /backups/sme

## Performance benchmark

`scripts/db-bench.mjs` measures p50/p95/p99 latency on:

- session create (100 in parallel)
- wallet wager (1000 sequential)
- audit append (1000 sequential)
- session GET (1000 sequential, indexed)
- wallet history SELECT (200 sequential)

Target: **p99 < 10ms** for indexed SELECT and primary-key INSERT.

    USE_POSTGRES=true DATABASE_URL=postgres://… npm run db:bench

## Files added in W206-PERSISTENCE

    server/db/connection.ts                 - PgConnection (pool + retry + health + shutdown)
    server/db/migrate.ts                    - idempotent migration runner
    server/db/migrate-cli.ts                - `npm run db:migrate` entry point
    server/db/migrations/001_initial.sql    - sessions / wallet / audit / tenants
    server/db/migrations/002_cert.sql       - cert submissions
    server/db/migrations/003_users_rbac.sql - users / roles / user_roles
    server/db/migrations/004_games.sql      - games registry
    server/state/sessions-pg.ts             - PostgresSessionStore
    server/state/wallet-pg.ts               - PostgresWalletStore  (BEGIN…COMMIT)
    server/state/audit-pg.ts                - PostgresAuditStore   (hash-chain preserved)
    server/state/tenants-pg.ts              - PostgresTenantStore
    server/state/cert-pg.ts                 - PostgresCertStore
    server/state/games-pg.ts                - PostgresGamesRegistry
    server/tests/fake-pg.ts                 - hand-rolled pg.Pool fake for vitest
    server/tests/db-connection.test.ts      - 7 specs
    server/tests/sessions-postgres.test.ts  - 13 specs
    server/tests/wallet-postgres.test.ts    - 13 specs
    server/tests/audit-postgres.test.ts     - 10 specs
    scripts/db-backup.sh                    - pg_dump wrapper
    scripts/db-restore.sh                   - pg_restore wrapper + verify
    scripts/db-bench.mjs                    - p50/p95/p99 latency bench
