# Security Audit Report — 2026-05-18

| Verdict | Category | Summary |
|---|---|---|
| PASS | Secret scanner | scanned=2481 critical=0 high=0 (allowlist applied) |
| PASS | Dependency CVE check | critical=0 high=0 moderate=0 (dev-only-suppressed=32) |
| PASS | TypeScript type laxity | any=306/600 asUnknownAs=92/150 tsIgnore=4/50 |
| PASS | SQL injection sentinel | hits=0 |
| PASS | CORS configuration | bad-combos=0 |
| PASS | HTTPS-only enforcement | hits=0 |
| PASS | HSM key handling | leaks=0 |
| PASS | PII handling | raw-pii-logs=0 |
| PASS | Audit log chain replay | entries=1000 broken=none |
| PASS | Rate-limit coverage | global default present |
| PASS | Tenant scoping helper coverage | pg-files=9 offenders=0 |

**Verdicts:** pass=11 warn=0 fail=0