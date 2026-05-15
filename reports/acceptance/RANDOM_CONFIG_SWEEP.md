# Faza 10.5 — Random Config Sweep Acceptance

Generated: 2026-05-15T18:50:55.500Z

## Acceptance

Master TODO §10.5: **"1000+ random configs → 0 crash"**. Gate: `crashCount == 0`.

Outcomes are 3-way classified:
* **ok** — finite, non-negative, bounded MC RTP.
* **rejected** — controlled validation rejection (engine refused unsafe input). Counts as PASS.
* **crash** — uncaught exception, NaN/Inf RTP, or runaway RTP > 1e9. Counts as FAIL.

## Result

**✅ PASS** — 1000 ok / 0 rejected / **0 crashes** across 1000 random configs (200,000 total spins, 119,261 spins/s).

## Parameters

* Configs: `1000`
* Spins per config: `200`
* Total spins: `200,000`
* Seed (script): `0xc0dec0de` — deterministic corpus; re-run reproduces bit-identical configs.
* Wall: `1677 ms`

## Crashes

_None._ Engine survived every random configuration.

## Reproducer

```
npm run build && node scripts/random-config-sweep.mjs --configs 1000 --spins 200 --seed 0xC0DEC0DE
```
