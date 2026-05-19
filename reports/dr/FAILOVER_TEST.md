# Failover Test

- Reference time: `2026-05-19T00:00:00Z`
- Overall: **PASS**

| Component | Failover (ms) | Soft budget (ms) | Status |
|-----------|--------------:|-----------------:|--------|
| PostgreSQL streaming replica | 4200 | 10000 | PASS |
| AWS KMS multi-region key | 800 | 5000 | PASS |
| S3 cross-region replication | 1500 | 8000 | PASS |
| Compute ASG (AZ-A → AZ-B) | 9200 | 15000 | PASS |

## Notes
- **PostgreSQL streaming replica** — Promote replica via patroni, sync_replication=remote_apply
- **AWS KMS multi-region key** — Replica key already in target region, app re-attests fingerprint
- **S3 cross-region replication** — Bucket policy flips to read from replica, IAM role swap
- **Compute ASG (AZ-A → AZ-B)** — Pre-warmed instances in AZ-B, ALB health-check drives cutover
