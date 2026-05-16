# MEGACLUSTER_STACK_WAYS — Megacluster Stack-Reveal Ways Acceptance

Generated: `2026-05-16T02:13:52.111Z`

## Headline

**6/6 configs PASS** at 1000000 MC spins each.

Closes Faza 12 scenario: ⚠️→✅ "Megacluster + reveal-stack-ways hybrid".

## Method

N independent reels; per reel, stack size S_c ~ stackPmf (iid), lead symbol = TARGET wp p.
K = #target-matched reels ~ Binomial(N, p). Ways product W_k = Π_{c: matched} S_c, conditional on
k matches → E[W_k] = E[S]^k, E[W_k²] = E[S²]^k (independence). Payout Y = paytable(k) × W_k +
bonus×1[k=N]. E[Y] = Σ_k P(K=k)·(paytable(k)·E[S]^k + bonus·1[k=N]).
Var via E[Y²]−E[Y]² with similar k-sum decomposition. Optional ways-cap enumeration via DP over
joint stack products.

## Tolerances

| Metric | Tolerance |
|---|---|
| E[Y] | rel ≤ 5.0% |
| hit rate | abs ≤ 0.005 |
| E[K] | rel ≤ 1.0% |

## Configs

| Config | Pass | CF E[Y] | MC E[Y] | rel | CF σ[Y] | hit rate | E[K] CF |
|---|---|---|---|---|---|---|---|
| A_6reel_classic | ✅ | 7.0023 | 6.9855 | 0.24% | 130.13 | 0.25569 | 1.80 |
| B_6reel_heavy_stacks | ✅ | 25.1865 | 25.2652 | 0.31% | 1080.58 | 0.16943 | 1.50 |
| C_8reel_low_p | ✅ | 4.2335 | 4.2970 | 1.50% | 290.75 | 0.20308 | 1.60 |
| D_4reel_high_p | ✅ | 8.5802 | 8.6004 | 0.24% | 49.96 | 0.52480 | 1.60 |
| E_capped_ways | ✅ | 5.2497 | 5.2074 | 0.81% | 42.34 | 0.25569 | 1.80 |
| F_full_match_bonus | ✅ | 10.6473 | 10.5055 | 1.33% | 219.71 | 0.25569 | 1.80 |
