# Load-test report — gaas-spin-load

Generated: 2026-05-18T18:08:06.716Z

Mode: `synthetic`
Target: `http://localhost:4000`
Duration: 11.9s

## Aggregate

| Metric | Value |
| --- | --- |
| Total requests | 2083 |
| OK | 2083 |
| Errors | 0 |
| Error rate | 0.00% |
| p50 latency (ms) | 0.01 |
| p95 latency (ms) | 0.176 |
| p99 latency (ms) | 0.368 |
| Throughput (rps) | 176 |

## Notes

- Latency includes network + server + JSON parse.
- p99 budgets come from `server/lib/latency-budget.ts`.
