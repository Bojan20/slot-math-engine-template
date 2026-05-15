# 1-Config → N-Jurisdiction Emit Acceptance Report

> Generated: 2026-05-15T18:27:47.161Z
> Fixture: `classic-3x3-lines.json`
> Profiles evaluated: 15 (master TODO target: ≥13)

## Headline

**15 jurisdictions emitted from a single IR** — 8 PASS · 7 WARN · 0 FAIL.

## Per-jurisdiction verdict

| Profile | Overall | Pass | Warn | Fail | N/A | Top issues |
|---------|:-------:|----:|----:|----:|----:|-----------|
| UKGC | WARN | 4 | 5 | 0 | 1 | min_spin_duration, autoplay_prohibition, turbo_prohibition |
| MGA | PASS | 3 | 0 | 0 | 7 | — |
| ADM | PASS | 4 | 0 | 0 | 6 | — |
| BMM | PASS | 1 | 0 | 0 | 9 | — |
| GLI19 | PASS | 1 | 0 | 0 | 9 | — |
| AGCO | WARN | 4 | 1 | 0 | 5 | autoplay_prohibition |
| DGA | PASS | 3 | 0 | 0 | 7 | — |
| NJDGE | PASS | 3 | 0 | 0 | 7 | — |
| ADM_VLT | WARN | 5 | 4 | 0 | 1 | min_spin_duration, autoplay_prohibition, turbo_prohibition |
| NIGC_C2 | PASS | 2 | 0 | 0 | 8 | — |
| NV_SKILL | PASS | 2 | 0 | 0 | 8 | — |
| DGOJ | WARN | 4 | 5 | 0 | 1 | min_spin_duration, autoplay_prohibition, turbo_prohibition |
| SPELINSPEKTIONEN | WARN | 4 | 5 | 0 | 1 | min_spin_duration, autoplay_prohibition, turbo_prohibition |
| PGCB | WARN | 3 | 2 | 0 | 5 | min_spin_duration, bonus_wagering_cap |
| NCPG | WARN | 5 | 5 | 0 | 0 | min_spin_duration, autoplay_prohibition, turbo_prohibition |

## What this proves

A single source IR (`classic-3x3-lines.json`) is RUN through 15 jurisdiction-specific compliance gates without any per-jurisdiction code change. Master TODO §14.3 target was "1 IR → 13 emits"; we ship 15 profiles (UKGC, MGA, ADM, BMM, GLI19, AGCO, DGA, NJDGE, ADM_VLT, NIGC_C2, NV_SKILL, DGOJ, SPELINSPEKTIONEN, PGCB, NCPG). Surplus +2 jurisdictions.

Failing rows are NOT engine bugs — they're per-jurisdiction RTP/cap/feature constraints that the fixture happens to violate (e.g. NJDGE has a 100% RTP floor; a 95% synthetic fixture won't pass). The proof of "1 → N emit" is that EVERY profile produces a verdict from the same input. Tuning the fixture to a specific jurisdiction is operator workflow (parTuner).

## Acceptance verdict

**Master TODO §14.3 acceptance: ✅** — 15 ≥ 13 jurisdictions emitted from a single IR.
