# Example: cross-jurisdiction RTP-floor sweep

**Question**

> "Which of UKGC / MGA / NV / NJ / ON have an absolute RTP floor below
> which a slot game cannot be launched?"

**Expected output**

```
Five-jurisdiction sweep — RTP floor (absolute minimum):

| Jurisdiction | RTP floor | RTP ceiling | Source                                    |
|---|---:|---:|---|
| UKGC         | 85.0 %    | 97.0 %      | RTS 14B — game shall not pay below 85 %   |
| MGA          | 85.0 %    | (none)      | RG Guidance Note 2019/01                  |
| NV (NGCB)    | 75.0 %    | (none)      | Reg 14.040 minimum theoretical RTP        |
| NJ (DGE)     | 83.0 %    | (none)      | Tech Standards §6.2.1                     |
| ON (AGCO)    | 85.0 %    | 99.0 %      | Standards for Internet Gaming §3.4.1      |

Notes:
  • NV is the LOWEST floor among the five — a "race-to-the-bottom" RTP
    designed for Las Vegas brick-and-mortar parity. Online operators
    typically self-regulate to ≥ 90 %.
  • UKGC, MGA, ON share the 85 % floor (de-facto industry standard).
  • Only UKGC and ON cap from above (operator can't ship 99.5 % RTP).
```

**How the agent answers**

```python
# Pseudo-code path through tools.jurisdiction
profiles = {p.stem: yaml.safe_load(p.read_text())
            for p in (REPO / "tools/jurisdiction/profiles").glob("*.yaml")}
table = sorted(
    ((j, p["rtp_range"][0], p["rtp_range"][1])
     for j, p in profiles.items() if j in {"ukgc","mga","nv","nj","on"}),
    key=lambda r: r[1],
)
```

**Repro path**

```bash
python -m tools.jurisdiction.linter --rtp-floor-sweep ukgc mga nv nj on
```

**Why this matters**

Cross-jurisdiction launches need a SINGLE RTP that clears ALL target
floors. The agent surfaces the binding floor (here: MGA / UKGC / ON @ 85 %)
in one query instead of five separate KB lookups.
