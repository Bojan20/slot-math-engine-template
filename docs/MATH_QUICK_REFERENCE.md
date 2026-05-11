# Slot Math Quick Reference Card

## RTP Formula

```
Total RTP = Base Game RTP + Feature RTP + Scatter Pay RTP

Feature RTP = Trigger Rate × Average Feature Win
```

## Volatility Index

| Volatility | Std Dev | Hit Rate | Dead Spin % | P99 |
|------------|---------|----------|-------------|-----|
| Low | 3-4 | 35-40% | 60-65% | 40x |
| Medium | 4-6 | 25-35% | 65-75% | 80x |
| High | 6-10 | 20-28% | 72-80% | 150x |
| Very High | 10-15 | 15-22% | 78-85% | 300x |

## Paytable Guidelines (x Total Bet)

| Tier | 3oak | 4oak | 5oak |
|------|------|------|------|
| LP-Low | 0.4-0.6x | 1.5-2x | 4-6x |
| LP-Mid | 0.6-0.9x | 2-3x | 6-9x |
| HP-Low | 1.5-2x | 5-8x | 25-40x |
| HP-Mid | 2-2.5x | 8-12x | 40-50x |
| HP-Top | 2.5-3.5x | 10-15x | 50-70x |

## Feature Trigger Rates

| Feature | Typical Rate | RTP Contribution |
|---------|--------------|------------------|
| Free Spins | 1/100-200 | 15-25% |
| Hold & Win | 1/150-250 | 15-25% |
| Bonus Round | 1/200-400 | 10-20% |

## Reel Strip Formula

```
P(symbol in window) = (count / strip_length) × rows

Example: 2 scatters on 54-stop strip, 3 rows
P(scatter per reel) = (2/54) × 3 = 11.1%

P(3+ scatters on 5 reels) ≈ 1/117-140
```

## Free Spins Math

```
FS RTP = (1 / trigger_rate) × avg_FS_win

Target: ~20% RTP contribution
If trigger = 1/140, need avg win = 140 × 0.20 = 28x
```

## Hold & Win Math

```
H&W RTP = (1 / trigger_rate) × avg_H&W_win

Target: ~20% RTP contribution
If trigger = 1/190, need avg win = 190 × 0.20 = 38x
```

## Max Win Safety

```
Max theoretical = max_feature_multiplier × max_base_win × max_symbols

Always set hard cap < max theoretical
Typical caps: 2500x - 10000x
```

## Simulation Confidence

| Spins | RTP Error | Use Case |
|-------|-----------|----------|
| 1M | ±0.30% | Quick sanity |
| 10M | ±0.10% | Rough tuning |
| 50M | ±0.05% | Pre-lock |
| 100M | ±0.03% | Serious balance |
| 500M | ±0.01% | Final lock |

## RTP Tolerance (PRODUCTION RULE)

**Target: 96.00% ±0.01%**
- Valid range: 95.99% - 96.01%
- Must pass before commit

## Common RTP Budgets

### Medium Volatility (96% target)
- Base Game: 50-55%
- Free Spins: 18-22%
- Hold & Win: 18-22%
- Scatter Pays: 2-3%

### High Volatility (96% target)
- Base Game: 40-45%
- Free Spins: 25-30%
- Hold & Win: 20-25%
- Scatter Pays: 2-3%

## Scatter Pay Table (Typical)

| Count | Pay | Free Spins |
|-------|-----|------------|
| 3 | 2x | 8 |
| 4 | 10x | 12 |
| 5 | 50x | 15 |

## Dead Spin Distribution

```
Good medium volatility:
- Average streak: 2-3 spins
- P90 streak: 7-8 spins
- Max observed (500M): ~40 spins
```

## Multiplier Guidelines

| Type | Range | Cap |
|------|-------|-----|
| FS Progressive | 1x-10x | 10-15x |
| Random Win Mult | 2x-10x | 15x |
| Symbol Mult | 2x-5x | 10x |

## Industry Standards

| Market | RTP Range |
|--------|-----------|
| Online EU | 94-97% |
| Online UK | 94-96% |
| Land-based | 88-94% |
| Social | 97-99% |
