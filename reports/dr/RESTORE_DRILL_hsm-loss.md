# Restore Drill — hsm-loss

- Reference time: `2026-05-19T00:00:00Z`
- Target tier: `critical` (RTO 15min / RPO 5min)
- Achieved: RTO 8min, data-loss 0min
- Result: **PASS**
- Notes: KMS multi-region key, no plaintext lost, app re-bound to secondary

## Timeline

| t+min | Event |
|------:|-------|
| 0 | Primary KMS region API errors > SLO budget |
| 1 | Multi-region replica key handles inbound encrypt/decrypt |
| 4 | RNG provider re-attests secondary key fingerprint |
| 6 | PAR snapshot signed with secondary key |
| 8 | End-to-end attestation chain validated, RTO met |
