# Disaster Recovery — `slot-math-engine-template`

**Author:** CORTI W215 (Faza 600.4)
**Last updated:** 2026-05-19
**Audience:** Operators, SRE, regulator-facing leads, CTO.

## Executive summary

The platform is engineered for a **15-minute RTO / 5-minute RPO**
posture on its critical tier (player wallet, audit chain, HSM-bound
material). Backups follow the **3-2-1 rule** (three copies, two media,
one offsite), are encrypted at rest, and are continuously verified by
the `dr-drill` workflow. Restore drills covering regional outage, DB
corruption, ransomware, and HSM loss run on the first of every month
and ship per-scenario reports under `reports/dr/`. Compliance mapping
includes GLI-19 §6, UKGC RTS 1B.6, and MGA Ch. 6.

---

## 1. Tier definitions

| Tier      | Data classes                                                     | RTO      | RPO       |
|-----------|------------------------------------------------------------------|---------:|----------:|
| critical  | Wallet ledger, audit hash chain, HSM-bound RNG seeds, KYC docs   | 15 min   | 5 min     |
| high      | Gameplay state, sessions, RNG provider state, cert evidence      | 60 min   | 30 min    |
| medium    | Analytics, dashboards, ML features, marketing telemetry          | 240 min  | 240 min   |
| low       | Long-term reporting archives, generated PDFs, audit exports      | 1440 min | 1440 min  |

Canonical source: `DEFAULT_DR_TIERS` in
[`server/lib/disaster-recovery.ts`](../server/lib/disaster-recovery.ts).

---

## 2. Backup strategy

### 2.1 3-2-1 rule

| Copy | Medium             | Region            | Encryption                   |
|------|--------------------|-------------------|------------------------------|
| 1    | Primary EBS / RDS  | us-east-1 (live)  | KMS CMK (primary key)        |
| 2    | Cross-region S3    | us-west-2         | KMS multi-region replica key |
| 3    | Glacier Deep Archive | offline-cold     | KMS, separate trust root     |

### 2.2 Retention

| Tier      | Hot retention | Cold retention | Legal hold |
|-----------|---------------|----------------|------------|
| critical  | 90 days       | 7 years        | as ordered |
| high      | 30 days       | 1 year         | as ordered |
| medium    | 14 days       | 90 days        | as ordered |
| low       | 7 days        | 30 days        | as ordered |

### 2.3 Cadence

`BackupOrchestrator.scheduleBackup(tier, intervalMinutes, now)`
enforces `interval ≤ rpo`. Production cadence:

| Tier      | Snapshot cadence |
|-----------|------------------|
| critical  | every 4 min      |
| high      | every 20 min     |
| medium    | every 3 h        |
| low       | every 12 h       |

### 2.4 Verification

`scripts/dr/backup-verify.mjs` reads the per-tier chain and asserts:

1. No RPO gap exceeds the tier target.
2. Every checksum is a sha256 hex (64 lowercase chars).
3. No future timestamps.
4. Snapshot IDs are unique within tier.

The job ships `reports/dr/BACKUP_VERIFY.md` + `.json` and exits
non-zero on any failure (`--strict` also fails on warnings).

---

## 3. Restore procedures (per-scenario)

| Scenario          | Trigger                              | RTO budget | RPO budget | Runbook |
|-------------------|--------------------------------------|-----------:|-----------:|---------|
| regional-outage   | Primary region health-check fails     | 15 min     | 5 min      | [§ regional-outage](RUNBOOK_RTO_RPO.md#regional-outage) |
| db-corruption     | Audit-chain integrity verify fails    | 60 min     | 30 min     | [§ db-corruption](RUNBOOK_RTO_RPO.md#db-corruption) |
| ransomware        | Anomaly-mitigation crypto-locker hit  | 240 min    | 240 min    | [§ ransomware](RUNBOOK_RTO_RPO.md#ransomware) |
| hsm-loss          | KMS primary region API SLO breached   | 15 min     | 5 min      | [§ hsm-loss](RUNBOOK_RTO_RPO.md#hsm-loss) |

`scripts/dr/restore-drill.mjs --scenario <name>` runs the deterministic
synthetic drill; `--all` runs the full set.

---

## 4. Failover topology (ASCII)

```
                          +---------------------------+
   Players ───── DNS ────►| Route53 health-checked    |
                          +-------------+-------------+
                                        │
                       ┌────────────────┴────────────────┐
                       ▼                                 ▼
              +-----------------+               +-----------------+
              | us-east-1       |               | us-west-2       |
              | (primary)       |               | (warm replica)  |
              |                 |◄─ streaming ─►|                 |
              |  ALB → ASG      |   replication |  ALB → ASG      |
              |  RDS primary    |   (≤ 5s lag)  |  RDS replica    |
              |  KMS CMK (P)    |◄── MRK ──────►|  KMS CMK (R)    |
              |  S3 bucket (P)  |── CRR ───────►|  S3 bucket (R)  |
              +-----------------+               +-----------------+
                       │                                 │
                       └────────► Glacier Deep Archive ◄─┘
                                  (offline-cold copy)
```

DB replication: synchronous within AZ, asynchronous cross-region with
≤ 5s replication lag SLO. KMS uses multi-region keys (MRK) so secondary
holds an identical key handle. S3 uses Cross-Region Replication (CRR)
with versioning + Object Lock for ransomware resilience.

---

## 5. Drill schedule

| Drill              | Cadence          | Surface                                |
|--------------------|------------------|----------------------------------------|
| Backup verify      | every CI run     | `reports/dr/BACKUP_VERIFY.md`          |
| Restore drill (all)| 1st of month     | `reports/dr/RESTORE_DRILL_<scenario>.md` |
| Failover test      | 1st of month     | `reports/dr/FAILOVER_TEST.md`          |
| Tabletop exercise  | quarterly        | post in `docs/runbooks/`               |
| Live cutover       | annually         | board-reviewed post-mortem             |

GitHub Actions workflow: `.github/workflows/dr-drill.yml`. Artifacts
are retained 90 days.

### 5.1 How to interpret reports

Each markdown report has the same top-of-file block:

- **Reference time** — the deterministic `now` used by the simulator.
- **Result** — PASS if both RTO and RPO budgets met.
- **Timeline** — minute-by-minute synthetic event log.

A FAIL means either the RTO budget was exceeded or the RPO budget was
exceeded. Both are P0 to triage same-day; the matrix in
`docs/INCIDENT_RESPONSE.md` §10 governs escalation.

---

## 6. Compliance mapping

| Standard            | Clause                         | Evidence in this repo                            |
|---------------------|--------------------------------|--------------------------------------------------|
| GLI-19              | § 6 (continuity, backup, RTO)  | `reports/dr/BACKUP_VERIFY.json`, drill artifacts |
| UKGC RTS 1B.6       | Continuity of service          | `reports/dr/FAILOVER_TEST.json`, this doc        |
| MGA Ch. 6           | Business continuity            | Tier table § 1, retention table § 2.2            |
| ISO 22301           | BCMS — recovery objectives     | RTO/RPO targets § 1, drill cadence § 5           |
| SOC 2 CC9.1         | Risk mitigation activities     | Monthly `dr-drill` workflow artifacts            |

---

## 7. Owner

CTO is the executive owner of the DR posture. SRE lead owns the
runbook content. Quarterly review is mandatory; any RTO/RPO change
requires CTO + regulator-liaison sign-off.
