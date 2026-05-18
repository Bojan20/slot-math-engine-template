# Multi-tenant Isolation Guarantees

W208 — Faza 400.1. Defence-in-depth tenant isolation for the
`slot-math-engine-template` backend.

## What is enforced, where

Three independent rings of protection. A request must satisfy all three
before it can touch a multi-tenant table.

| Ring | Module | Failure mode |
|---|---|---|
| 1. HTTP middleware | `lib/tenant-isolation.ts → tenantIsolationPreHandler` | 400 `tenant_required` |
| 2. AsyncLocalStorage context | `lib/tenant-isolation.ts → tenantContextScope` | `TenantContextMissingError` |
| 3. Static query interceptor | `lib/tenant-isolation.ts → assertTenantScopedQuery` | `TenantContextMissingError` |

A break-glass admin tool can intentionally cross tenant boundaries with
`crossTenantOverride(ctx, fn)`, which marks the context flag
`isCrossTenantOverride = true`. The audit sink MUST record every such
call.

### Tables that must be tenant-scoped

```
sessions
wallets
wallet_transactions
games
certs
audits
audit_entries
```

Any SQL that touches one of those without a `tenant_id` predicate is
rejected by `assertTenantScopedQuery`.

## Request lifecycle

```
onRequest    → requestContextHook (request id + start time)
preHandler   → RBAC (X-User-Role)
preHandler   → admin route handler (resolves req.tenant from registry)
preHandler   → bridge: req.tenant.id → req.tenantId
preHandler   → tenantIsolationPreHandler (header → req.tenantId)
preHandler   → tenantContextScope (opens AsyncLocalStorage)
preHandler   → rateLimit (per tenant, default REST_DEFAULTS)
handler      → route logic; calls assertTenantContext() before DB ops
onResponse   → metrics (histogram + counter)
```

## Adding a tenant-scoped route

```ts
import { assertTenantContext } from '../lib/tenant-isolation.js';

app.get('/api/widgets/:id', async (req, reply) => {
  const ctx = assertTenantContext();          // throws if no tenant
  const id = req.params.id;
  // Always include WHERE tenant_id = $1 — the static interceptor will
  // also enforce this.
  const row = await pg.query(
    'SELECT * FROM widgets WHERE tenant_id = $1 AND id = $2',
    [ctx.tenantId, id]
  );
  return row;
});
```

## Cross-tenant admin tooling

```ts
import { crossTenantOverride } from '../lib/tenant-isolation.js';
import { logger } from '../lib/observability.js';

crossTenantOverride({ tenantId: 'sys', userId: 'ops' }, async () => {
  logger.warn('cross_tenant_override', { reason: 'data_export' });
  await runReport();
});
```

## Observable signals

`/api/admin/metrics` exposes:

- `tenant_isolation_violations_total` — should stay at 0 in production
- `rate_limit_breaches_total{route}` — per-route 429 counters
- `http_requests_total{route, status}` — for SLO dashboards

## Testing

15+ specs in `server/tests/tenant-isolation.test.ts` covering:

- AsyncLocalStorage propagation across awaits, timers, nested scopes
- Static query interceptor (SELECT, UPDATE, IN-predicate)
- HTTP middleware (unknown tenant, missing header, public-prefix skip)
- Cross-tenant override flag isolation
- Violation counter exposed to Prometheus
