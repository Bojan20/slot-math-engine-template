# DEMO_MODE — Demo Mode Controller Acceptance

Generated: `2026-05-16T02:30:17.854Z`

## Headline

**6/6 scenarios PASS**

Closes compliance ⚠️ "Demo mode explicit flag" — provides regulator-facing zero-RNG playback
with attestable script digest + audit trail + auditor verification.

## Compliance gates verified

1. **RNG call blocked** during demo session (assertNoRngCall throws)
2. **Script attestation** committed at session start (SHA-256 hex)
3. **Audit trail** per-spin entries with sequence + scriptIndex + outcome + timestamp
4. **Audit digest** computed at session end (SHA-256 over canonical audit log)
5. **Auditor verification** recomputes digests + outcome-by-outcome match
6. **Tamper detection** — mutated audit entries fail verification

## Scenarios

| Scenario | Pass | Cycle | Served | RNG-blocked | Verify | Tamper-detected | Wall |
|---|---|---|---|---|---|---|---|
| A_basic_50_spins_halt | ✅ | halt | 50 | ✅ | ✅ | — | 1ms |
| B_loop_3x_pass | ✅ | loop | 60 | ✅ | ✅ | — | 1ms |
| C_partial_halt | ✅ | halt | 75 | ✅ | ✅ | — | 0ms |
| D_single_spin_loop | ✅ | loop | 50 | ✅ | ✅ | — | 0ms |
| E_jackpot_demo_script | ✅ | halt | 12 | ✅ | ✅ | — | 0ms |
| F_audit_tamper_detection | ✅ | halt | 30 | ✅ | ✅ | ✅ | 0ms |

## Industry Standards Referenced

- **GLI-19 §3.3.9** — Replay capability requirement
- **UKGC RTS 9** — Demo vs real-money distinction
- **MGA Player Protection Directive 2018 §11.b** — Auditor traceability
- **eCOGRA TG-VG** — Audit log + tamper-evidence requirement