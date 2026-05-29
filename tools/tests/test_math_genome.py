"""W7.1 — Self-Evolving Math Genome tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.math_genome.genome import (
    GenomeConfig,
    GenomeSpec,
    Individual,
    SelfEvolvingMathGenome,
    assign_crowding_distance,
    closed_form_rtp,
    compute_fitness,
    dominates,
    fast_non_dominated_sort,
    gaussian_mutate,
    tournament_select,
    uniform_crossover,
)
import math
import random


def _classic_spec(**overrides) -> GenomeSpec:
    defaults = dict(
        n_reels=5,
        n_symbols=2,
        paytable=[[1.0, 4.0, 10.0], []],
        min_match=3,
        paylines=20,
        anchor=0,
        target_rtp=20.224,  # matches the QMC closed-form benchmark
        target_cv=8.0,
        target_hit_freq=0.27,
        weight_min=1.0,
        weight_max=50.0,
    )
    defaults.update(overrides)
    return GenomeSpec(**defaults)


# ─── spec / config validation ────────────────────────────────────────


def test_spec_rejects_n_reels_lt_3() -> None:
    with pytest.raises(ValueError):
        _classic_spec(n_reels=2).validate()


def test_spec_rejects_anchor_out_of_range() -> None:
    with pytest.raises(ValueError):
        _classic_spec(anchor=5).validate()


def test_spec_rejects_inverted_weight_bounds() -> None:
    with pytest.raises(ValueError):
        _classic_spec(weight_min=10.0, weight_max=1.0).validate()


def test_config_rejects_tiny_population() -> None:
    with pytest.raises(ValueError):
        GenomeConfig(population_size=2).validate()


def test_config_rejects_negative_sigma() -> None:
    with pytest.raises(ValueError):
        GenomeConfig(mutation_sigma=-1.0).validate()


# ─── closed-form ──────────────────────────────────────────────────────


def test_closed_form_rtp_matches_qmc_benchmark() -> None:
    spec = _classic_spec()
    # p_anchor = 4 / (4 + 6) = 0.4 → matches QMC convergence benchmark.
    weights = [[4.0, 6.0] for _ in range(spec.n_reels)]
    rtp, cv, hf = closed_form_rtp(spec, weights)
    # qmc_estimator's closed_form_rtp returns 0.20224 (unit fraction);
    # our version returns rtp_pct (×100) = 20.224.
    assert rtp == pytest.approx(20.224, abs=1e-3)
    assert cv > 0
    assert hf > 0


def test_closed_form_returns_zero_if_total_zero() -> None:
    spec = _classic_spec()
    weights = [[0.0, 0.0] for _ in range(spec.n_reels)]
    rtp, cv, hf = closed_form_rtp(spec, weights)
    assert (rtp, cv, hf) == (0.0, 0.0, 0.0)


def test_closed_form_rtp_increases_with_anchor_weight() -> None:
    spec = _classic_spec()
    low = [[1.0, 10.0]] * spec.n_reels
    high = [[10.0, 1.0]] * spec.n_reels
    rtp_low, _, _ = closed_form_rtp(spec, low)
    rtp_high, _, _ = closed_form_rtp(spec, high)
    assert rtp_high > rtp_low * 50  # 10/11 ≫ 1/11 → MUCH higher RTP


# ─── fitness ─────────────────────────────────────────────────────────


def test_fitness_lower_when_rtp_closer_to_target() -> None:
    spec = _classic_spec(target_rtp=20.224)
    # near-target individual
    ind_good = Individual(weights=[[4.0, 6.0]] * spec.n_reels)
    # extreme-low individual
    ind_bad = Individual(weights=[[1.0, 49.0]] * spec.n_reels)
    fit_g = compute_fitness(spec, ind_good)
    fit_b = compute_fitness(spec, ind_bad)
    assert fit_g[0] < fit_b[0]


def test_fitness_fairness_penalty_increases_with_concentration() -> None:
    spec = _classic_spec(n_symbols=4, paytable=[[1.0, 4.0, 10.0], [], [], []])
    uniform = Individual(weights=[[10.0, 10.0, 10.0, 10.0]] * spec.n_reels)
    skewed = Individual(weights=[[49.0, 1.0, 1.0, 1.0]] * spec.n_reels)
    fit_u = compute_fitness(spec, uniform)
    fit_s = compute_fitness(spec, skewed)
    assert fit_s[3] > fit_u[3]


# ─── Pareto dominance ───────────────────────────────────────────────


def test_dominates_strict_subset() -> None:
    assert dominates((0.0, 0.0), (1.0, 1.0)) is True
    assert dominates((0.0, 1.0), (1.0, 1.0)) is True  # equal in one, strict in other
    assert dominates((1.0, 1.0), (1.0, 1.0)) is False


def test_dominates_requires_strict_improvement() -> None:
    assert dominates((0.0, 2.0), (1.0, 1.0)) is False
    assert dominates((1.0, 1.0), (0.0, 2.0)) is False


def test_dominates_arity_mismatch_raises() -> None:
    with pytest.raises(ValueError):
        dominates((0.0,), (0.0, 0.0))


# ─── Non-dominated sort + crowding ──────────────────────────────────


def _ind_with_fitness(fit: tuple[float, ...]) -> Individual:
    ind = Individual(weights=[[1.0, 1.0]])
    ind.fitness = fit
    return ind


def test_fast_non_dominated_sort_yields_two_fronts() -> None:
    a = _ind_with_fitness((0.0, 2.0))
    b = _ind_with_fitness((1.0, 1.0))
    c = _ind_with_fitness((2.0, 0.0))
    d = _ind_with_fitness((3.0, 3.0))
    fronts = fast_non_dominated_sort([a, b, c, d])
    assert len(fronts) == 2
    front_1 = {id(x) for x in fronts[0]}
    assert front_1 == {id(a), id(b), id(c)}
    assert fronts[1] == [d]


def test_crowding_distance_assigns_inf_to_extremes() -> None:
    front = [
        _ind_with_fitness((0.0, 2.0)),
        _ind_with_fitness((1.0, 1.0)),
        _ind_with_fitness((2.0, 0.0)),
    ]
    assign_crowding_distance(front)
    front.sort(key=lambda i: i.fitness[0])
    assert math.isinf(front[0].crowd)
    assert math.isinf(front[-1].crowd)
    assert front[1].crowd > 0  # interior point gets positive finite distance


# ─── Crossover + mutation ───────────────────────────────────────────


def test_uniform_crossover_inherits_from_either_parent() -> None:
    rng = random.Random(1)
    a = Individual(weights=[[1.0, 2.0, 3.0]])
    b = Individual(weights=[[10.0, 20.0, 30.0]])
    child = uniform_crossover(a, b, rng)
    for s in range(3):
        assert child.weights[0][s] in {a.weights[0][s], b.weights[0][s]}


def test_gaussian_mutate_respects_weight_bounds() -> None:
    spec = _classic_spec()
    rng = random.Random(42)
    ind = Individual(weights=[[2.0, 5.0]] * spec.n_reels)
    gaussian_mutate(ind, spec, rng, sigma=100.0, prob=1.0)
    for reel in ind.weights:
        for w in reel:
            assert spec.weight_min <= w <= spec.weight_max


# ─── Tournament selection ───────────────────────────────────────────


def test_tournament_select_prefers_lower_rank() -> None:
    pop = [
        _ind_with_fitness((0.0, 0.0)),
        _ind_with_fitness((1.0, 1.0)),
        _ind_with_fitness((2.0, 2.0)),
    ]
    pop[0].rank = 1
    pop[1].rank = 2
    pop[2].rank = 3
    # With population of 3 and k=3 the tournament always sees everyone;
    # rank-1 individual must always win.
    rng = random.Random(0)
    winner = tournament_select(pop, rng, k=3)
    assert winner is pop[0]


# ─── End-to-end evolve ──────────────────────────────────────────────


def test_evolve_returns_non_empty_pareto_frontier() -> None:
    spec = _classic_spec()
    cfg = GenomeConfig(population_size=12, generations=8, seed=12345)
    pareto = SelfEvolvingMathGenome(spec, cfg).evolve()
    assert len(pareto.members) >= 1
    for m in pareto.members:
        assert m.rank == 1
        assert all(f >= 0 for f in m.fitness)


def test_evolve_is_deterministic_with_same_seed() -> None:
    spec = _classic_spec()
    cfg = GenomeConfig(population_size=12, generations=6, seed=7)
    a = SelfEvolvingMathGenome(spec, cfg).evolve()
    b = SelfEvolvingMathGenome(spec, cfg).evolve()
    # Same seed ⇒ same Pareto frontier (same RTPs, same fitness vectors).
    assert [m.fitness for m in a.members] == [m.fitness for m in b.members]


def test_evolve_improves_best_rtp_err_over_generations() -> None:
    spec = _classic_spec(target_rtp=96.0)  # much higher than initial uniform
    cfg = GenomeConfig(population_size=24, generations=2, seed=11)
    early = SelfEvolvingMathGenome(spec, cfg).evolve()
    cfg = GenomeConfig(population_size=24, generations=30, seed=11)
    late = SelfEvolvingMathGenome(spec, cfg).evolve()
    best_early = min(m.fitness[0] for m in early.members)
    best_late = min(m.fitness[0] for m in late.members)
    assert best_late <= best_early


def test_evolve_writes_round_trip_json() -> None:
    spec = _classic_spec()
    cfg = GenomeConfig(population_size=8, generations=4, seed=21)
    pareto = SelfEvolvingMathGenome(spec, cfg).evolve()
    doc = pareto.to_dict()
    raw = json.dumps(doc, sort_keys=True)
    parsed = json.loads(raw)
    assert parsed["generation"] == cfg.generations - 1
    assert len(parsed["members"]) == len(pareto.members)


# ─── CLI smoke ──────────────────────────────────────────────────────


def test_cli_main_emits_pareto_frontier_json(tmp_path: Path) -> None:
    from tools.math_genome.__main__ import main as cli_main  # noqa: PLC0415
    out = tmp_path / "pareto.json"
    rc = cli_main([
        "--population", "12",
        "--generations", "6",
        "--seed", "555",
        "--target-rtp", "20.224",
        "--target-cv", "8.0",
        "--target-hit-freq", "0.27",
        "--out", str(out),
    ])
    assert rc == 0
    doc = json.loads(out.read_text())
    assert doc["frontier_size"] >= 1
    assert "spec" in doc and "config" in doc and "pareto" in doc
