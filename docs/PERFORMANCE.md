# Performance Hardening — W208 Faza 400.1

This document describes the cache layer, p99 latency budgets, and load
test methodology added in **W208**. Read this before tuning Redis or
debugging a budget breach in CI.

## 1. Cache layer architecture

### 1.1 Module layout

```
server/lib/cache.ts        ← abstraction + Memory + Redis adapters
server/routes/lobby.ts     ← lobby list cache (per-tenant, 60s TTL)
server/routes/catalog.ts   ← catalog read cache (per-tenant, 5min TTL)
server/routes/license.ts   ← license verify/usage/expiry cache (30s TTL)
server/routes/gaas.ts      ← jurisdiction-profile cache per session
```

### 1.2 Backend selection

| Condition                        | Backend            |
| -------------------------------- | ------------------ |
| `NODE_ENV=test`                  | InMemory (forced)  |
| `REDIS_URL` set, NODE_ENV≠test   | Redis (ioredis)    |
| Otherwise                        | InMemory           |

`ioredis` is listed under `optionalDependencies` so CI test runs work
without it. In production install it with `npm install ioredis`.

### 1.3 Key namespacing

Every adapter ctor accepts a `namespace`. The convention is:

```
svc:lobby:<tenantId>:<jurisdiction>:<category>
svc:catalog:<tenantId>:all
svc:catalog:<tenantId>:byId:<gameId>
svc:license:verify:<licenseKey>
svc:gaas:juris:<sessionId>
```

Per-tenant prefixes mean `cache.delByPrefix('lobby:tenantA:')` purges
exactly one tenant's lobby cache and nothing else — important for
multi-tenant deployments.

### 1.4 Invalidation hooks

Two explicit endpoints (`admin` role required):

- `POST /api/lobby/_invalidate` — drops lobby cache (optionally scoped
  to caller's tenant).
- `POST /api/catalog/_invalidate` — drops catalog cache.

Game install / update / delete pipelines should call these after
mutating the registry. Until a CDC pipeline is in place, this manual
trigger is the source of truth.

### 1.5 Public API

```ts
import { createCache } from './lib/cache.js';
const cache = createCache<MyValue>({ namespace: 'svc' });
await cache.set('key', value, { ttlMs: 60_000 });
const v = await cache.get('key');         // → MyValue | null
await cache.incr('counter');
await cache.expire('key', 30_000);
await cache.del('key');
await cache.delByPrefix('prefix:');
await cache.healthy();
const stats = cache.stats();              // { hits, misses, hitRate, ... }
```

A `cacheAside(cache, key, ttlMs, loader)` helper is exported for the
classic cache-aside pattern.

## 2. p99 latency budgets

`server/lib/latency-budget.ts` defines a `LatencyBudgetTracker` that
records duration samples per route in a 1 024-slot reservoir and emits
warning-level logs on breaches. The Fastify middleware
(`attachLatencyMiddleware`) wires it up via `onRequest` + `onResponse`.

### 2.1 Default budgets

| Route                              | p99 budget | Cached |
| ---------------------------------- | ----------:| ------ |
| `/api/lobby/games`                 | 50 ms      | yes    |
| `/api/license/verify`              | 30 ms      | yes    |
| `/api/license/:tenantId/usage`     | 30 ms      | yes    |
| `/api/license/:tenantId/expiry`    | 30 ms      | yes    |
| `/api/catalog`                     | 50 ms      | yes    |
| `/api/session/spin`                | 100 ms     | no     |
| `gaas.ws.spin` (WebSocket spin)    | 80 ms      | no     |

### 2.2 Admin endpoint

```
GET /api/admin/latency-budgets
→ { ts, routes: [{ route, count, p50, p95, p99, budgetP99, breaches, withinBudget }, ...] }
```

Use this to inspect live percentiles in a deployed environment. The
admin RBAC guard from `index.ts` already covers it (`/api/admin/*`).

### 2.3 Breach handling

When a single sample exceeds the route's `p99Ms` the tracker:

1. Increments `route.breaches`.
2. Calls the `warn` sink (defaults to `app.log.warn`).
3. Sets `withinBudget=false` on the next snapshot if the p99 percentile
   itself crosses the line.

A breach does **not** fail the request — budgets are SLOs, not
hard gates. CI gates may inspect the snapshot endpoint after a load run
and exit non-zero if breaches exceed a threshold.

## 3. Load test scripts

All under `scripts/load-test/`. Zero non-stdlib deps, runnable with
`node 18+`.

| Script                        | npm alias             | Purpose                          |
| ----------------------------- | --------------------- | -------------------------------- |
| `gaas-spin-load.mjs`          | `npm run load-test:gaas`   | 100 VUs × 1 000 rps spin load |
| `rest-api-load.mjs`           | `npm run load-test:rest`   | Mixed-weight REST surface     |
| `cache-hit-rate.mjs`          | `npm run cache-hit-rate`   | Cache-only hit-rate diag      |

### 3.1 Common flags

- `--target=http://host:port` — server base URL (default
  `http://localhost:4000`).
- `--quick` — short profile for CI (3 s ramp / 5 s plateau / 3 s down,
  25 VUs, 250 rps).
- `--synthetic` — skip HTTP entirely and drive an in-process stub. The
  scripts also auto-fall back to synthetic mode when the target is
  unreachable, so they always emit a report.

### 3.2 Reports

Each run emits both JSON + Markdown:

```
reports/perf/gaas-spin-load.json
reports/perf/gaas-spin-load.md
reports/perf/rest-api-load.json
reports/perf/rest-api-load.md
reports/perf/cache-hit-rate.json
reports/perf/cache-hit-rate.md
```

The Markdown report includes per-route p50/p95/p99 and a "Budget
breaches" section if any p99 exceeded the configured limit.

### 3.3 Interpreting numbers

- Synthetic numbers are **not** a substitute for real HTTP — they
  measure the script's CPU floor only. Use them to gate CI for the
  driver itself.
- Real HTTP runs include OS / network + Fastify ingress. p99 ≤ budget
  is the pass criterion.
- `cache-hit-rate` is workload-dependent: with a Zipfian key
  distribution + 1 s TTL + 50 hot keys, expect ≥ 95% hit rate.

## 4. Quick smoke (no server)

```sh
npm run load-test:gaas -- --quick --synthetic
npm run load-test:rest -- --quick --synthetic
npm run cache-hit-rate -- --requests=5000 --keys=20 --ttl=500
```

Each completes in under 10 s and writes `reports/perf/*.md`.

## 5. Tests

| Test file                                  | Specs |
| ------------------------------------------ | ----: |
| `server/tests/cache.test.ts`               | 15    |
| `server/tests/latency-budget.test.ts`      | 7     |
| `server/tests/lobby-cache.test.ts`         | 5     |

Run them with:

```sh
cd server && npx vitest run tests/cache.test.ts tests/latency-budget.test.ts tests/lobby-cache.test.ts
```

## 6. Next steps

- Wire `POST /api/lobby/_invalidate` / `/api/catalog/_invalidate` into
  the IR-library install pipeline.
- Add a Prometheus scrape of `/api/admin/latency-budgets` once metrics
  exporter lands (see W208 Faza 400.2).
- Promote `ioredis` from optional to required once Redis is deployed
  in every environment.
