# RTO/RPO Runbook — Engineering procedures

**Author:** CORTI W215 (Faza 600.4)
**Last updated:** 2026-05-19
**Audience:** SRE on-call, DBRE, security responders.

Quick-reference: open this on the second monitor as soon as you ack a
DR-relevant page. Each section is self-contained — execute top to
bottom. All operator commands assume the on-call has the standard
ops profile (`aws-vault exec slot-eng-prod -- ...`).

> Drill counterparts (deterministic, runnable any time):
> `node scripts/dr/restore-drill.mjs --scenario <name>`.

---

## regional-outage

**Trigger:** Route53 health-check fails for the primary region or
internal SLO burn on `availability` > 5x for ≥ 3 min.

**RTO budget:** 15 min  •  **RPO budget:** 5 min  •  **Tier:** critical

### Steps

1. **Confirm the outage is regional** (vs. tenant-scoped). Check the
   AWS Service Health Dashboard and our internal `availability-by-region`
   board. If only one AZ, follow `db-corruption` instead — no DR
   failover needed.
2. **Promote replica DB.** `patronictl -c /etc/patroni.yaml failover
   --candidate replica-usw2-1`. Verify with `psql -c "SELECT pg_is_in_recovery();"`
   returning `f`.
3. **Flip Route53 health policy.** Already automated — confirm with
   `aws route53 get-health-check-status --health-check-id $HC_ID`.
   Manual override: `bin/route53-flip --to us-west-2`.
4. **Re-bind wallet provider.** `bin/wallet-rebind --region us-west-2`.
5. **Smoke test.** Run `npm run smoke:prod -- --region us-west-2`
   (a single spin + payout end-to-end).
6. **Update status page.** Severity = SEV2 (single region) or SEV1
   (data plane fully unavailable).
7. **Page security lead** if anything that smells like an attack
   surfaced during failover.

### Rollback path

When primary recovers: `bin/route53-flip --to us-east-1 --drain 30m`,
then re-attach replica from new primary.

---

## db-corruption

**Trigger:** Audit-chain integrity verify fails (`hashChain.ts` reports
`expected != observed`) or pg_repack detects page-level corruption.

**RTO budget:** 60 min  •  **RPO budget:** 30 min  •  **Tier:** high

### Steps

1. **Freeze writes** for the affected tenant slice. Use the anomaly
   mitigation `freeze_writes` action (already wired in
   `server/lib/anomaly-mitigation.ts`).
2. **Snapshot the corrupted volume** (forensic copy, do not overwrite).
   `aws ec2 create-snapshot --volume-id $VOL --description "forensic_w215_$(date -u +%s)"`.
3. **Stand up recovery instance** from the most recent base backup
   that pre-dates the corruption marker. `bin/pg-restore-base
   --before $CORRUPTION_TS`.
4. **Replay WAL** up to one segment before the corruption marker.
   `bin/pg-replay-wal --until $CORRUPTION_TS_MINUS_1S`.
5. **Re-run PAR validation** for the tenant.
   `npm run par-stress -- --tenant $TENANT --quick`.
6. **Verify audit-chain integrity** end-to-end before thaw.
7. **Thaw writes**, post-mortem.

### Acceptance check

`BackupOrchestrator.selectRestorePoint('high', $CORRUPTION_TS)` must
return a non-null snapshot. If it returns `null`, escalate to SEV1
immediately — RPO breach.

---

## ransomware

**Trigger:** Anomaly-mitigation detects mass crypto-locker pattern or
backup checksums diverge across replicas.

**RTO budget:** 240 min  •  **RPO budget:** 240 min  •  **Tier:** medium

### Steps

1. **Network-segment the affected AZ.** Pull all security groups
   except mgmt + forensics. `bin/sg-quarantine --az us-east-1a`.
2. **Invalidate all sessions + rotate KMS keys.** `bin/sessions-burn
   --all`, then `bin/kms-rotate --immediate`.
3. **Verify offline-archive integrity.** The Glacier copy is air-gapped
   and Object-Lock'd; checksum it before restoring. `bin/glacier-verify
   --tier high`.
4. **Redeploy clean compute** from gold AMI. `bin/deploy --from-ami
   ami-gold-w215 --region us-west-2`.
5. **Restore data** from offline archive to clean DB.
6. **Forensic preservation:** capture EBS snapshot of every infected
   volume; chain-of-custody log into incident ticket.
7. **Notify regulators per § 10.5 of `docs/INCIDENT_RESPONSE.md`**.
8. **Public postmortem** within 14 days.

---

## hsm-loss

**Trigger:** Primary KMS region API errors > SLO budget OR
HSM attestation fails on cert path.

**RTO budget:** 15 min  •  **RPO budget:** 5 min  •  **Tier:** critical

### Steps

1. **Confirm scope.** Are reads failing too, or only writes? KMS API
   degradation often affects only one call shape.
2. **Re-bind to multi-region replica key.** `bin/kms-rebind --to us-west-2`.
   App attests the secondary key fingerprint automatically on next
   restart.
3. **Re-sign latest PAR snapshot** with the secondary key to confirm
   the signing chain is intact. `bin/par-sign --refresh`.
4. **Run end-to-end attestation chain check.** `npm run cert:daily --
   --attest-only`.
5. **No data loss expected** — multi-region keys share material;
   plaintext data was never in the impaired region.

### Recovery path

When primary KMS recovers: re-attest, re-sign with primary, retire
secondary back to standby. Do NOT delete multi-region replica key
— that's the whole point.

---

## Common verification commands

```sh
# Verify backup chain integrity (any scenario, before thaw):
node scripts/dr/backup-verify.mjs --strict

# Re-run a deterministic restore drill against the same scenario:
node scripts/dr/restore-drill.mjs --scenario <name>

# Re-test failover paths (DB / KMS / S3 / compute):
node scripts/dr/failover-test.mjs --strict

# Roll-up incident KPIs for the last 24h:
node -e "import('./server/lib/incident-response.js').then(m => { const e = new m.IncidentResponseEngine(); console.log(e.summarizeWindow(new Date().toISOString(), 24)); })"
```
