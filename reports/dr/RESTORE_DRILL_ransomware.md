# Restore Drill — ransomware

- Reference time: `2026-05-19T00:00:00Z`
- Target tier: `medium` (RTO 240min / RPO 240min)
- Achieved: RTO 55min, data-loss 15min
- Result: **PASS**
- Notes: Restore from offline archive, rebuild AZ from gold AMI

## Timeline

| t+min | Event |
|------:|-------|
| 0 | Anomaly auto-mitigation detects mass crypto-locker pattern |
| 1 | Network segmentation isolates affected AZ |
| 5 | Gold AMI redeploys clean compute fleet |
| 20 | Offline-archive snapshot restored to clean DB |
| 40 | Forensic snapshot of compromised volumes captured |
| 50 | KMS keys rotated, all sessions invalidated |
| 55 | Tenant onboarding flow validated, RTO met |
