# Security Audit Report — 2026-05-18

| Verdict | Category | Summary |
|---|---|---|
| PASS | Secret scanner | scanned=2368 critical=0 high=0 (allowlist applied) |
| WARN | Dependency CVE check | critical=0 high=2 moderate=28 |
| PASS | TypeScript type laxity | any=303/600 asUnknownAs=90/150 tsIgnore=4/50 |
| PASS | SQL injection sentinel | hits=0 |
| PASS | CORS configuration | bad-combos=0 |
| PASS | HTTPS-only enforcement | hits=0 |
| PASS | HSM key handling | leaks=0 |
| WARN | PII handling | raw-pii-logs=1 |
| PASS | Audit log chain replay | entries=1000 broken=none |
| PASS | Rate-limit coverage | global default present |
| WARN | Tenant scoping helper coverage | pg-files=9 offenders=4 |

**Verdicts:** pass=8 warn=3 fail=0