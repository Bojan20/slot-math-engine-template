# Example: selftest scope, all green

**Invocation**

```bash
python -m tools.qa_agent selftest --seed 42
```

**Expected output (canonical)**

```
verdict: ALL_PASS  exit_code: 0
  L0       PASS   selftest      SCN=PASS; CLI=PASS; AB=PASS; RPT=PASS; SUB=PASS
```

**Why this matters**

The five L0 sub-checks (SCN scenarios, CLI surface, AB antibody roundtrip,
RPT report hash, SUB toolchain probe) form the agent's *self-belief* — if
any of them break, the agent refuses to grade other layers.

**Key surface**

| Sub-check | What it proves | Hard rule |
|---|---|---|
| SCN | every scenarios/*.yaml parses against schema v1 | Hard rule 8 |
| CLI | all 6 subcommands registered | Hard rule 1 |
| AB | antibody gate roundtrip on a synthetic DB | Hard rule 3 |
| RPT | canonical_hash stable across timestamp drift | Hard rule 2 |
| SUB | pytest/cargo/npm probed; SKIP not FAIL when missing | Hard rule 1 |
