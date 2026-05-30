# Example: UKGC RTS 14D minimum spin cycle lookup

**Question**

> "Does UKGC require a minimum 2.5-second spin cycle on slot games?"

**Expected output**

```
YES — UKGC Remote Technical Standards (RTS) 14D.

Effective:  2021-04-01 (updated 2023-09-22)
Source:     https://www.gamblingcommission.gov.uk/licensees-and-businesses/
            guide/page/remote-gambling-and-software-technical-standards
Clause:     RTS 14D — "The play period (the time from the player committing
            to a stake to the result being available) must not be shorter
            than 2.5 seconds, and only one play period may be initiated by
            committing to one stake."
Profile pin: tools/jurisdiction/profiles/ukgc.yaml::min_spin_duration_ms = 2500

Cross-check (cross-jurisdiction):
  • MGA (Malta)     — no minimum spin duration in current RG framework
  • NV (Nevada)     — Reg 14.040 sets no minimum
  • NJ (NJ DGE)     — Tech Standards §6.1 sets no minimum
  • SE (Sweden SGA) — 3.0 s minimum (stricter than UKGC)
```

**Why the agent answers this**

Two-tier lookup:

1. Direct hit in `tools/jurisdiction/profiles/ukgc.yaml::min_spin_duration_ms`.
2. Citation source pulled from agent's KB, derived offline from the
   profile's `informational_notes` field ("RTS 14D — min 2.5s spin cycle").

**Repro path**

```bash
python -m tools.jurisdiction.linter \
    --jurisdiction ukgc \
    --check min_spin_duration_ms \
    --against 2500
# → PASS
```

**Why this matters**

Pilot operators have failed UKGC RNG submission on this single field
twice in the last 2 years. The KB pre-flights the value before the cert
bundle is generated, eliminating the failure mode.
