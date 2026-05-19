# Restore Drill — db-corruption

- Reference time: `2026-05-19T00:00:00Z`
- Target tier: `high` (RTO 60min / RPO 30min)
- Achieved: RTO 22min, data-loss 3min
- Result: **PASS**
- Notes: Point-in-time recovery from base + WAL within RPO

## Timeline

| t+min | Event |
|------:|-------|
| 0 | Audit-chain integrity check fails on tenant slice |
| 2 | Writes frozen for affected tenant |
| 5 | Base backup restored to recovery instance |
| 14 | WAL replayed up to corruption marker |
| 20 | Validation harness re-runs PAR sample — green |
| 22 | Tenant writes thawed, RTO met |
