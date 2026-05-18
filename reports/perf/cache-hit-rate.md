# Load-test report — cache-hit-rate

Generated: 2026-05-18T18:08:16.695Z

Mode: `in-process`
Duration: 0.01s

## Aggregate

| Metric | Value |
| --- | --- |
| Total requests | 5000 |
| OK | 5000 |
| Errors | 0 |
| Error rate | 0.00% |
| p50 latency (ms) | 0 |
| p95 latency (ms) | 0 |
| p99 latency (ms) | 0 |
| Throughput (rps) | 833333 |

## Notes

- Latency includes network + server + JSON parse.
- p99 budgets come from `server/lib/latency-budget.ts`.
