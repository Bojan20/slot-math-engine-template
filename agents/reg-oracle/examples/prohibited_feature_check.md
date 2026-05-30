# Example: prohibited-feature pre-flight against jurisdiction profile

**Question**

> "Our slot has an autoplay-unlimited toggle (turbo mode). Will it
> pre-flight clean against UKGC?"

**Expected output**

```
NO — UKGC blocks `autoplay_unlimited`.

Profile match: tools/jurisdiction/profiles/ukgc.yaml::prohibited_features
              contains "autoplay_unlimited".

Source citation:
  RTS 13E (Autoplay) — "Autoplay must terminate when:
    (a) a loss limit reached,
    (b) a win above £100 awarded,
    (c) a single session bonus feature triggered,
    (d) 100 spins completed."

Effective:  RTS 13E mandatory for all new submissions ≥ 2021-04-01.
Source URL: gamblingcommission.gov.uk/…/remote-technical-standards#RTS13E

Remediation:
  • Replace `autoplay: unlimited` with `autoplay: { max_spins: 100,
    loss_limit_required: true, win_threshold: 100.0 }`.
  • Pin in IR `compliance.autoplay_profile = "ukgc_rts13e"`.
  • Re-run preflight; expect PASS.

Cross-jurisdiction collateral check (same feature):
  • NJ DGE   — same restriction, max 100 auto-spins
  • MGA      — no explicit cap (operator self-attest)
  • Sweden   — auto-play prohibited entirely on slots
  • Quebec   — max 50 auto-spins
  • NV       — no restriction
```

**How the agent answers**

```python
prohibited = profiles["ukgc"]["prohibited_features"]
assert "autoplay_unlimited" in prohibited  # source-of-truth gate
```

**Repro path**

```bash
python -m tools.jurisdiction.linter \
    --jurisdiction ukgc \
    --ir-feature autoplay_unlimited
# → FAIL: feature in prohibited list
```

**Why this matters**

This is the #1 false-negative class in pre-flight: operators copy a
Vegas IR (no autoplay restriction) into a UKGC submission and fail at
cert lab. The agent catches it BEFORE the cert bundle is sealed,
saving a 4-6 week re-submission cycle.
