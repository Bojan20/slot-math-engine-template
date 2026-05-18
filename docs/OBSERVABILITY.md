# Observability — Structured Logging + Prometheus

W208 — Faza 400.1. Single-line JSON logs + Prometheus text format
metrics. Zero external dependencies.

## Logging schema

Every log record is a single JSON object on one line:

| Field | Type | Notes |
|---|---|---|
| `ts` | ISO 8601 string | UTC timestamp |
| `level` | `trace`\|`debug`\|`info`\|`warn`\|`error` | |
| `msg` | string | Short, stable event name preferred |
| `tenantId` | string? | From `currentTenant()` (AsyncLocalStorage) |
| `requestId` | string? | From `currentRequest()` (UUID v4 or echoed `X-Request-Id`) |
| `route` | string? | URL without query |
| `latencyMs` | number? | Populated by route-level logging |
| `userId` | string? | When the request carries `X-User-Id` |
| `meta` | object? | Caller-supplied structured payload |

```ts
import { logger } from '../lib/observability.js';
logger.info('session_created', { sessionId, jurisdiction });
```

The shared `logger` honours `LOG_LEVEL` from env. Default `info`.

### Request id propagation

Every request gets `X-Request-Id` (response header), either:

1. echoed from the incoming `X-Request-Id` header, or
2. freshly generated via `crypto.randomUUID()`.

The id is also stored in the `AsyncLocalStorage<RequestContext>` so any
log emitted during the request handler — including those inside awaits,
timers, or child callbacks — picks it up automatically.

## Metrics catalog

Exposed at `GET /api/admin/metrics` in Prometheus text format v0.0.4.

| Name | Type | Labels | Help |
|---|---|---|---|
| `http_request_duration_seconds` | histogram | `route` | Buckets 5ms … 10s |
| `http_requests_total` | counter | `route`, `status` | All HTTP traffic |
| `rate_limit_breaches_total` | counter | `route?` | 429 rejections |
| `tenant_isolation_violations_total` | counter | — | Should be 0 |
| `gaas_spins_total` | counter | `tenant`, `game` | GaaS spin volume |
| `cache_hits_total` | counter | — | Cache layer hits |
| `cache_misses_total` | counter | — | Cache layer misses |

### Sample scrape output

```
# HELP http_request_duration_seconds HTTP request duration in seconds.
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{route="/api/lobby/games",le="0.005"} 3
http_request_duration_seconds_bucket{route="/api/lobby/games",le="0.01"} 7
http_request_duration_seconds_bucket{route="/api/lobby/games",le="+Inf"} 9
http_request_duration_seconds_sum{route="/api/lobby/games"} 0.052
http_request_duration_seconds_count{route="/api/lobby/games"} 9
# HELP http_requests_total Total HTTP requests.
# TYPE http_requests_total counter
http_requests_total{route="/api/lobby/games",status="200"} 9
# HELP rate_limit_breaches_total Rate limit rejections.
# TYPE rate_limit_breaches_total counter
rate_limit_breaches_total 0
# HELP tenant_isolation_violations_total Tenant isolation violations (defensive — should be 0).
# TYPE tenant_isolation_violations_total counter
tenant_isolation_violations_total 0
```

## Prometheus scrape config

```yaml
scrape_configs:
  - job_name: slot-math-engine-backend
    metrics_path: /api/admin/metrics
    scrape_interval: 15s
    static_configs:
      - targets: ['backend:4000']
    relabel_configs:
      - source_labels: [__address__]
        target_label: tenant
        regex: '.*-(.+):\\d+'
        replacement: '$1'
```

## Grafana dashboard (skeleton)

```json
{
  "title": "SME Backend — W208 Multi-tenant",
  "panels": [
    {
      "title": "Request rate (5m)",
      "targets": [
        { "expr": "sum by (route) (rate(http_requests_total[5m]))" }
      ]
    },
    {
      "title": "p95 latency (s)",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))"
        }
      ]
    },
    {
      "title": "Rate-limit breaches",
      "targets": [
        { "expr": "sum by (route) (rate(rate_limit_breaches_total[5m]))" }
      ]
    },
    {
      "title": "Tenant isolation violations (must stay 0)",
      "targets": [
        { "expr": "tenant_isolation_violations_total" }
      ],
      "alert": {
        "name": "tenant_isolation_violation",
        "conditions": [{ "evaluator": { "type": "gt", "params": [0] } }]
      }
    }
  ]
}
```

## Tests

10+ specs in `server/tests/observability.test.ts` cover:

- JSON record shape + min-level filtering
- Tenant id / request id propagation through AsyncLocalStorage
- Histogram bucket math
- Counter labels render correctly in Prom text format
- `/api/admin/metrics` returns parseable Prom text
- `X-Request-Id` round-trip
