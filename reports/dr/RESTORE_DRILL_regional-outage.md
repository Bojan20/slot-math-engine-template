# Restore Drill — regional-outage

- Reference time: `2026-05-19T00:00:00Z`
- Target tier: `critical` (RTO 15min / RPO 5min)
- Achieved: RTO 12min, data-loss 4min
- Result: **PASS**
- Notes: DNS failover + replica promote, last streaming WAL replayed

## Timeline

| t+min | Event |
|------:|-------|
| 0 | Primary region health-check fails (3 consecutive) |
| 1 | Route53 health policy flips to replica region |
| 3 | Replica DB promoted to primary, write traffic re-routed |
| 7 | Auto-scaling group warms compute in replica AZ |
| 10 | Wallet provider re-bound to replica wallet endpoint |
| 12 | Synthetic spin/payout transaction succeeds — RTO met |
