# Load-test report — rest-api-load

Generated: 2026-05-18T18:08:16.613Z

Mode: `synthetic`
Target: `http://localhost:4000`
Duration: 5.0s

## Aggregate

| Metric | Value |
| --- | --- |
| Total requests | 7052 |
| OK | 7052 |
| Errors | 0 |
| Error rate | 0.00% |
| p50 latency (ms) | 1.24 |
| p95 latency (ms) | 2.483 |
| p99 latency (ms) | 2.575 |
| Throughput (rps) | 1407 |

## Per-route

| Route | Count | p50 | p95 | p99 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| /api/health | 1848 | 1.225 | 1.303 | 1.364 | 0 |
| /api/lobby/games | 2293 | 1.249 | 2.501 | 2.584 | 0 |
| /api/catalog | 1072 | 1.248 | 2.493 | 2.589 | 0 |
| /api/license/verify | 1113 | 1.252 | 2.493 | 2.597 | 0 |
| /api/signup | 726 | 1.255 | 2.513 | 2.61 | 0 |

## Notes

- Latency includes network + server + JSON parse.
- p99 budgets come from `server/lib/latency-budget.ts`.
