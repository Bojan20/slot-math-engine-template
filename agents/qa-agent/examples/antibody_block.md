# Example: antibody pre-flight blocks the run

**Setup**

The antibody DB at `data/antibodies.db` (or `SLOT_MATH_ANTIBODY_DB`) contains:

```sql
INSERT INTO antibodies VALUES
  ('ab_wpf_max', 'wild prefix max double count', 'HIGH', 'recompute prefix on tier change', 'wild_scatter_bonus', '', '');
```

**Invocation**

```bash
python -m tools.qa_agent full --baseline origin/main --seed 42
```

**Why the gate fires**

Recent commit subjects contain "wild prefix max double count" → tokenised
to `{wild, prefix, max, double, count}` → matches `ab_wpf_max` at HIGH
severity → BLOCK.

**Agent verdict**

```
verdict: BLOCKED_ANTIBODY  exit_code: 4
  L0  PASS  selftest
  L1  FAIL  antibody       db=data/antibodies.db tokens=12
  L2  SKIP  syntax         blocked by L1
  ...
```

**Repro path**

1. `python -m tools.qa_agent antibody "wild prefix max double count"` —
   confirm the antibody surfaces.
2. Apply the codified `recommended_fix` (out of band).
3. Re-run `full`; gate should now PASS.

**Why this is critical**

A blocking antibody means we've seen this bug class before. Running the
full suite hides the regression in CI noise; halting at L1 gives the
operator the codified fix on a single line.
