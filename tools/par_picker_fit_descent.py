"""W4.13/W4.19 ORGANIC CLOSEOUT — Gradient-descent picker / rows-weights /
FS reel-strip fit.

Reverse-engineers the structurally-missing weights for Skeleton Key
(rows_weights), Fortune Coin Boost Classic (BG + FS reel-set picker
weights), and Fort Knox Wolf Run (FS reel-strip per-symbol weights) so
the engine's organic Monte-Carlo RTP matches the Excel target without
falling back to deterministic replay paths or named compensation
constants.

Algorithm (per SWID):
  1. Load the canonical IR + remove `rtp_source = "breakdown"`.
  2. Parameterize the unknown weights as softmax of free reals so the
     non-negative + Σ=1 simplex constraints are automatic.
  3. Inner loop: write a temp IR with current weights → invoke
     `engine/slot-sim` MC binary with a fixed seed → parse RTP /
     hit_freq → compute loss `(ΔRTP)² + λ·(Δ_hit_freq)²`.
  4. Outer loop: two-stage —
       a) coarse 2-param sweep over a designed family of rows_weights
          (or picker weights / per-symbol scalars) to locate the right
          basin
       b) scipy `Powell` refinement over the full softmax parameter
          space starting from the basin centre.
     Cache the same seed each evaluation so the loss surface is
     deterministic.
  5. Write converged weights to
     `games/<game>/out/<game>.<swid>.picker_fit.json` overlay AND echo
     a Python literal so they can be baked into `build_ir.py`.

W4.19 — FKWR FS reel-strip stop weight optimizer.
  FKWR has only 1 FS reel set, but each reel has 68..105 stops carrying
  integer weights. Optimizing per-stop weights directly is ill-posed
  (~460 free vars, MC noise floor swamps the gradient). The optimizer
  parameterizes per-symbol multipliers shared across reels — 12 free
  vars for the 12 distinct FS symbols. For each FS reel r and symbol s,
  every stop with symbol s gets weight `round(exp(theta_s) * 100)`.
  This collapses the FS overshoot caused by uniform-weight stops with
  higher high-pay symbol density than the published `free_spins_bonus`
  share captures, while preserving the physical reel-strip order
  (vendor's auditable reel-strip topology stays intact).

Privacy: emits only RTP / hit_freq deltas + iteration counts to stdout
— no raw vendor symbol weights.

Usage:
    python3 -m tools.par_picker_fit_descent skeleton-key            # all 3 SWIDs
    python3 -m tools.par_picker_fit_descent fortune-coin-boost-classic
    python3 -m tools.par_picker_fit_descent fort-knox-wolf-run       # W4.19
    python3 -m tools.par_picker_fit_descent skeleton-key 200-1517-001
    python3 -m tools.par_picker_fit_descent all
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import numpy as np


REPO = Path(__file__).resolve().parents[1]
GAMES = REPO / "games"
ENGINE_BIN = REPO / "engine" / "slot-sim" / "target" / "release" / "slot-sim"

# Fixed seed used for every MC invocation during the fit. Reproducibility
# is what makes the fit deterministic — same params → same loss.
MC_SEED = 0xC0DEBABE

# MC spin count per coarse-grid evaluation. 500k gives RTP variance ~7e-4
# which is enough to rank gross differences in the coarse sweep.
COARSE_SPINS = 500_000

# MC spin count per single MC run during Powell refinement. Each loss
# eval averages `multi_seed` independent runs.
REFINE_SPINS = 500_000

# MC spin count for the final convergence-confirmation pass (per seed).
FINAL_SPINS = 5_000_000

# Number of independent seeds averaged in the final convergence test.
# 8 seeds × 5M spins = 40M effective spins; standard error of the mean
# RTP is then ~stdev/sqrt(8) which for Megaways (raw σ≈2.4e-3 at 20M)
# crosses ~7e-4. Sufficient to confirm the fit reached the noise floor.
FINAL_SEEDS = 8

# Loss weight for hit-frequency residual relative to RTP residual.
# The Powell refinement focuses on RTP exclusively (LAMBDA_HF=0) since
# the 1e-4 RTP tolerance is the hard requirement. The 2D coarse sweep
# does steer toward a basin where hit_freq is close, so the final
# hit_freq residual is reported honestly without padding.
LAMBDA_HF = 0.0

# Loss weight used ONLY in the coarse 2-D sweep (matters for basin
# selection — we want the basin where hit_freq is also close).
LAMBDA_HF_COARSE = 0.5


# ──────────────────────── MC harness ────────────────────────


def _run_mc(ir: dict, spins: int = REFINE_SPINS, seed: int = MC_SEED) -> dict:
    """Invoke slot-sim release binary and return parsed stats."""
    with tempfile.NamedTemporaryFile(
        suffix=".slot-sim.ir.json", delete=False, mode="w"
    ) as tmp:
        json.dump(ir, tmp)
        tmp_path = tmp.name
    try:
        r = subprocess.run(
            [str(ENGINE_BIN), "--ir", tmp_path,
             "--spins", str(spins), "--seed", str(seed)],
            capture_output=True, text=True, timeout=600,
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
    if r.returncode != 0:
        raise RuntimeError(f"slot-sim failed (rc={r.returncode}): {r.stderr[:400]}")
    rtp = None
    hit = None
    for line in r.stdout.splitlines():
        if line.startswith("RTP:"):
            rtp = float(line.split()[1])
        elif line.startswith("Hit freq:"):
            hit = float(line.split()[2])
        if rtp is not None and hit is not None:
            break
    if rtp is None or hit is None:
        raise RuntimeError(f"slot-sim output unparseable: {r.stdout[:400]}")
    return {"rtp": rtp, "hit_freq": hit}


# ──────────────────────── softmax helpers ────────────────────────


def _softmax(x: np.ndarray) -> np.ndarray:
    """Numerically-stable softmax mapping R^n → simplex."""
    e = np.exp(x - x.max())
    return e / e.sum()


def _to_int_weights(p: np.ndarray, scale: int = 10_000) -> list[int]:
    """Convert simplex probabilities → integer weights summing to ~scale.

    Rounding error of ≤ n/2 keeps the relative weights to 1/scale
    precision, which is ample for RTP convergence ≤ 1e-4.
    """
    w = np.maximum(np.round(p * scale).astype(int), 0)
    if w.sum() == 0:
        w[int(np.argmax(p))] = 1
    return w.tolist()


# ──────────────────────── Skeleton Key fit ────────────────────────


def _sk_apply(ir: dict, params: np.ndarray) -> dict:
    """SK free vars = 5 reels × 4 row buckets + N base picker + M FS picker.

    Layout: params[0:20] = rows_weights (5 reels × 4 buckets);
            params[20:20+N] = BG picker softmax inputs;
            params[20+N:20+N+M] = FS picker softmax inputs.
    Returns the IR with all three weight tables updated and rtp_source
    removed.
    """
    out = json.loads(json.dumps(ir))
    out["meta"].pop("rtp_source", None)
    rows_weights = []
    for r in range(5):
        p = _softmax(params[r * 4:(r + 1) * 4])
        rows_weights.append(_to_int_weights(p, scale=10_000))
    out["topology"]["rows_weights"] = rows_weights
    # Optional base + fs picker reweighting when params are present.
    n_base = len(out["reels"]["base_weights"]["weights"])
    n_fs = (
        len(out["reels"]["fs_weights"]["weights"])
        if out["reels"].get("fs_weights") else 0
    )
    if params.size >= 20 + n_base:
        bg = _softmax(params[20:20 + n_base])
        bg_int = _to_int_weights(bg, scale=10_000)
        for i, w in enumerate(out["reels"]["base_weights"]["weights"]):
            w["weight"] = bg_int[i]
        out["reels"]["base_weights"]["total"] = sum(bg_int)
    if params.size >= 20 + n_base + n_fs and n_fs > 0:
        fs = _softmax(params[20 + n_base:20 + n_base + n_fs])
        fs_int = _to_int_weights(fs, scale=10_000)
        for i, w in enumerate(out["reels"]["fs_weights"]["weights"]):
            w["weight"] = fs_int[i]
        out["reels"]["fs_weights"]["total"] = sum(fs_int)
    return out


def _sk_params_from_rows(rows: list[list[float]]) -> np.ndarray:
    """Convert per-reel `[p3, p4, p5, p6]` distributions → log-space
    params suitable as softmax input. log(p) preserves the distribution
    under softmax (up to a constant shift)."""
    flat = []
    for r in rows:
        # Avoid log(0) — clip to tiny positive value.
        p = np.maximum(np.array(r, dtype=float), 1e-6)
        p = p / p.sum()
        flat.extend(np.log(p).tolist())
    return np.array(flat, dtype=float)


def _sk_coarse(ir: dict) -> tuple[np.ndarray, dict]:
    """Coarse search over a designed 2-param family covering the
    feasible (RTP, hit_freq) basin. Returns (best_params, best_stats).

    Family: reels 0,1 split between rows 3/4 with mix `p4`; reels 2,3,4
    split between rows 5/6 with mix `p5`. Probing the 2D grid takes ~30 s
    and lands us within Δrtp ~ 0.02 of target, from which Powell can
    converge below 1e-4 in ~30 iters.
    """
    target_rtp = ir["meta"]["rtp_total"]
    target_hf = ir["meta"]["hit_frequency"]
    best = {"loss": float("inf"), "rows": None, "stats": None}
    grid_p4 = np.linspace(0.0, 0.3, 7)
    grid_p5 = np.linspace(0.2, 0.7, 6)
    for p4 in grid_p4:
        for p5 in grid_p5:
            rows = (
                [[1 - p4, p4, 0.0, 0.0]] * 2
                + [[0.0, 0.0, p5, 1 - p5]] * 3
            )
            ir_x = _sk_apply(ir, _sk_params_from_rows(rows))
            try:
                st = _run_mc(ir_x, spins=COARSE_SPINS)
            except Exception:
                continue
            d_rtp = st["rtp"] - target_rtp
            d_hf = st["hit_freq"] - target_hf
            L = d_rtp * d_rtp + LAMBDA_HF_COARSE * d_hf * d_hf
            if L < best["loss"]:
                best["loss"] = L
                best["rows"] = rows
                best["stats"] = st
                best["p4"] = float(p4)
                best["p5"] = float(p5)
    print(f"  coarse best p4={best['p4']:.2f} p5={best['p5']:.2f} "
          f"rtp={best['stats']['rtp']:.6f} hf={best['stats']['hit_freq']:.6f}",
          file=sys.stderr)
    # Extend with zero softmax params for BG + FS picker (uniform).
    n_fs = (
        len(ir["reels"]["fs_weights"]["weights"])
        if ir["reels"].get("fs_weights") else 0
    )
    # Preserve the published vendor picker as the BG init (the W4.13
    # fit nudges from there). Use log(weight/total) so softmax
    # reproduces it.
    bg_init = np.log(np.maximum(
        np.array([w["weight"] for w in ir["reels"]["base_weights"]["weights"]],
                  dtype=float),
        1.0,
    ))
    bg_init -= bg_init.max()
    fs_init = np.zeros(n_fs)
    if n_fs > 0 and ir["reels"].get("fs_weights"):
        fs_init = np.log(np.maximum(
            np.array([w["weight"] for w in ir["reels"]["fs_weights"]["weights"]],
                      dtype=float),
            1.0,
        ))
        fs_init -= fs_init.max()
    rows_params = _sk_params_from_rows(best["rows"])
    full = np.concatenate([rows_params, bg_init, fs_init])
    return full, best["stats"]


# ──────────────────────── Fortune Coin fit ────────────────────────


def _fc_apply(ir: dict, params: np.ndarray) -> dict:
    """FC free vars = n_base BG picker + n_fs FS picker softmax params."""
    out = json.loads(json.dumps(ir))
    out["meta"].pop("rtp_source", None)
    n_base = len(out["reels"]["base_weights"]["weights"])
    n_fs = (
        len(out["reels"]["fs_weights"]["weights"])
        if out["reels"].get("fs_weights")
        else 0
    )
    bg = _softmax(params[:n_base])
    bg_int = _to_int_weights(bg, scale=10_000)
    for i, w in enumerate(out["reels"]["base_weights"]["weights"]):
        w["weight"] = bg_int[i]
    out["reels"]["base_weights"]["total"] = sum(bg_int)
    if n_fs > 0:
        fs = _softmax(params[n_base:n_base + n_fs])
        fs_int = _to_int_weights(fs, scale=10_000)
        for i, w in enumerate(out["reels"]["fs_weights"]["weights"]):
            w["weight"] = fs_int[i]
        out["reels"]["fs_weights"]["total"] = sum(fs_int)
    return out


def _fc_coarse(ir: dict) -> tuple[np.ndarray, dict]:
    """Coarse search for FC: each ST set is tried solo + uniform mix.
    Picks the convex combination with best (RTP, hit_freq) match.

    Since FC's BG-picker baseline at uniform gives RTP=0.94 (close to
    target 0.95), the coarse stage just confirms uniform is a good
    starting point. Returns init params and uniform stats.
    """
    n_base = len(ir["reels"]["base_weights"]["weights"])
    n_fs = (
        len(ir["reels"]["fs_weights"]["weights"])
        if ir["reels"].get("fs_weights")
        else 0
    )
    # Uniform across all sets in both pickers.
    x0 = np.zeros(n_base + n_fs)
    ir_x = _fc_apply(ir, x0)
    st = _run_mc(ir_x, spins=COARSE_SPINS)
    print(f"  coarse uniform: rtp={st['rtp']:.6f} hf={st['hit_freq']:.6f}",
          file=sys.stderr)
    return x0, st


# ──────────────────────── FKWR FS reel-strip fit (W4.19) ────────────────────────


def _fkwr_fs_symbols(ir: dict) -> list[str]:
    """Return sorted list of distinct symbols across all FS reel-strip
    stops. Used to parameterize the per-symbol weight multiplier vector.
    """
    seen: set[str] = set()
    for rs in ir["reels"]["fs"]:
        for reel in rs["reels"]:
            for stop in reel:
                seen.add(stop["symbol"])
    return sorted(seen)


def _fkwr_apply(ir: dict, params: np.ndarray) -> dict:
    """Apply per-symbol log-weight multipliers to every FS reel-strip stop.

    `params` has length len(symbols). Each symbol s gets multiplier
    `exp(params[s_idx])`, snapped to integer ≥ 1 after scaling by 100.
    All FS reel-strip stops with symbol s receive that weight, replacing
    the published uniform weight (=1). The IR's vendor-published reel-
    strip ORDER (which symbols sit at which stops) is unchanged — only
    the visit probability per stop is reweighted.

    The base reel strips, paytable, and all bonus mechanics are left
    untouched: only FS reel-strip stop weights are mutated. The hold-
    and-win `avg_pay_per_trigger` is recomputed from raw
    `fk_avg_pay / bm1_total_bet_coins` (no overshoot discount) so the
    organic engine MC RTP is end-to-end physical.
    """
    out = json.loads(json.dumps(ir))
    out["meta"].pop("rtp_source", None)
    symbols = _fkwr_fs_symbols(out)
    sym_idx = {s: i for i, s in enumerate(symbols)}
    # Per-symbol multiplier (≥ 1 after snapping). Centered at exp(0)=1.
    mult = np.maximum(np.round(np.exp(params) * 100.0).astype(int), 1)
    for rs in out["reels"]["fs"]:
        for reel in rs["reels"]:
            for stop in reel:
                stop["weight"] = int(mult[sym_idx[stop["symbol"]]])
    # W4.19 — remove the named-constant overshoot discount on Fort Knox
    # avg_pay_per_trigger. The hold_and_win entry must now carry the raw
    # `fk_avg_pay / bm1_total_bet_coins` value. The IR's overlay carries
    # the discounted value baked at build time; an overlay slot stores
    # the raw value alongside so the fitter can reapply it cleanly.
    hw = next(
        (f for f in out["features"] if f.get("kind") == "hold_and_win"),
        None,
    )
    if hw is not None and hw.get("_w419_raw_avg_pay_per_trigger") is not None:
        hw["avg_pay_per_trigger"] = float(hw["_w419_raw_avg_pay_per_trigger"])
    return out


def _fkwr_undiscount(ir: dict) -> dict:
    """Restore the raw (undiscounted) Fort Knox `avg_pay_per_trigger`
    in-place. The discount factor 0.015 / trigger_prob was baked at
    W4.17; reverse it so the fitter starts from a physical baseline.

    Stores the raw value into a private slot `_w419_raw_avg_pay_per_trigger`
    so `_fkwr_apply` can re-apply it inside each MC evaluation.
    """
    out = json.loads(json.dumps(ir))
    hw = next(
        (f for f in out["features"] if f.get("kind") == "hold_and_win"),
        None,
    )
    if hw is not None and hw.get("avg_pay_per_trigger") is not None \
            and hw.get("trigger_prob") is not None:
        # discount = FKWR_FS_ENGINE_OVERSHOOT_RTP_W416 / trigger_prob
        discount = 0.015 / float(hw["trigger_prob"])
        raw = float(hw["avg_pay_per_trigger"]) + discount
        hw["_w419_raw_avg_pay_per_trigger"] = raw
        hw["avg_pay_per_trigger"] = raw
    return out


def _fkwr_coarse(ir: dict) -> tuple[np.ndarray, dict]:
    """Coarse 1-D sweep over a uniform high-pay-symbol down-scaling
    parameter `s`. For symbols classified as high-pay (WildWolf, Whitewolf,
    DarkWolf, BearTotem, BirdTotem, Ace, King), the multiplier is exp(s);
    for low-pay (Queen, Jack, Ten, Nine), the multiplier is exp(-s);
    Bonus is exp(0). The sweep over s ∈ [-0.5, 0.2] locates the basin
    where engine FS RTP share aligns with published 0.074.

    Returns the full 12-d softmax-input vector init at the basin centre.
    """
    target_rtp = ir["meta"]["rtp_total"]
    target_hf = ir["meta"]["hit_frequency"]
    symbols = _fkwr_fs_symbols(ir)
    high_pay = {"WildWolf", "Whitewolf", "DarkWolf", "BearTotem",
                "BirdTotem", "Ace", "King"}
    low_pay = {"Queen", "Jack", "Ten", "Nine"}
    best = {"loss": float("inf"), "s": 0.0, "x": np.zeros(len(symbols)),
            "stats": None}
    for s in np.linspace(-0.5, 0.2, 8):
        x = np.zeros(len(symbols))
        for i, sym in enumerate(symbols):
            if sym in high_pay:
                x[i] = float(s)
            elif sym in low_pay:
                x[i] = float(-s)
            # Bonus and any unknown stay at 0 (no scaling).
        ir_x = _fkwr_apply(ir, x)
        try:
            st = _run_mc(ir_x, spins=COARSE_SPINS)
        except Exception:
            continue
        d_rtp = st["rtp"] - target_rtp
        d_hf = st["hit_freq"] - target_hf
        L = d_rtp * d_rtp + LAMBDA_HF_COARSE * d_hf * d_hf
        if L < best["loss"]:
            best["loss"] = L
            best["s"] = float(s)
            best["x"] = x
            best["stats"] = st
    if best["stats"] is None:
        # Fallback: uniform init (no scaling).
        x0 = np.zeros(len(symbols))
        st = _run_mc(_fkwr_apply(ir, x0), spins=COARSE_SPINS)
        best["x"] = x0
        best["stats"] = st
    print(f"  coarse best s={best['s']:+.3f} "
          f"rtp={best['stats']['rtp']:.6f} hf={best['stats']['hit_freq']:.6f}",
          file=sys.stderr)
    return best["x"], best["stats"]


# ──────────────────────── Powell refinement ────────────────────────


def _avg_eval(
    ir: dict,
    apply_fn,
    x: np.ndarray,
    spins: int,
    n_seeds: int,
) -> dict:
    """Average RTP / hit_freq across `n_seeds` independent seeds."""
    ir_x = apply_fn(ir, x)
    rtps: list[float] = []
    hfs: list[float] = []
    for k in range(n_seeds):
        st = _run_mc(ir_x, spins=spins,
                     seed=MC_SEED ^ (0x9E37_79B9 * (k + 1)))
        rtps.append(st["rtp"])
        hfs.append(st["hit_freq"])
    return {
        "rtp": float(np.mean(rtps)),
        "hit_freq": float(np.mean(hfs)),
        "rtp_stdev": float(np.std(rtps, ddof=1)) if n_seeds > 1 else 0.0,
        "hit_freq_stdev": float(np.std(hfs, ddof=1)) if n_seeds > 1 else 0.0,
        "n_seeds": n_seeds,
        "spins_per_seed": spins,
    }


def _refine_powell(
    ir: dict,
    apply_fn,
    x0: np.ndarray,
    target_rtp: float,
    target_hf: float,
    max_iters: int = 80,
    spins: int = REFINE_SPINS,
    multi_seed: int = 3,
) -> tuple[np.ndarray, dict, int]:
    """Powell refinement with multi-seed averaging to suppress MC noise.

    `multi_seed=N` averages each loss eval over N seeds — reduces loss
    surface noise by sqrt(N) so the optimizer doesn't chase lucky
    single-eval minima.
    """
    from scipy.optimize import minimize

    iter_count = {"n": 0}
    best = {"loss": float("inf"), "x": x0.copy(), "stats": None}

    def loss(x: np.ndarray) -> float:
        iter_count["n"] += 1
        try:
            st = _avg_eval(ir, apply_fn, x, spins, multi_seed)
        except Exception:
            return 1e6
        d_rtp = st["rtp"] - target_rtp
        d_hf = st["hit_freq"] - target_hf
        L = d_rtp * d_rtp + LAMBDA_HF * d_hf * d_hf
        if L < best["loss"]:
            best["loss"] = L
            best["x"] = x.copy()
            best["stats"] = st
            print(f"    iter {iter_count['n']:3d}: "
                  f"Δrtp={d_rtp:+.6f} (±{st['rtp_stdev']/np.sqrt(multi_seed):.0e}) "
                  f"Δhf={d_hf:+.6f} loss={L:.2e}",
                  file=sys.stderr)
        # Early-stop: averaged Δrtp comfortably within 0.5× tolerance.
        # (Tighter than the 1e-4 task tolerance because a single 8-seed
        # average is still noisy by ~stdev/sqrt(8); we want to make sure
        # the final 8×5M re-evaluation lands within 1e-4 too.)
        if abs(d_rtp) < 5e-5:
            raise StopIteration("converged early")
        return L

    try:
        minimize(
            loss,
            x0,
            method="Powell",
            options={
                "maxiter": max_iters,
                "xtol": 1e-4,
                "ftol": 1e-10,
                "disp": False,
            },
        )
    except StopIteration:
        pass

    return best["x"], best["stats"], iter_count["n"]


# ──────────────────────── Per-SWID fit entry ────────────────────────


def fit_one(
    game: str,
    swid: str,
    ir_path: Path,
) -> dict[str, Any]:
    ir = json.loads(ir_path.read_text())
    target_rtp = ir["meta"]["rtp_total"]
    target_hit = ir["meta"]["hit_frequency"]
    print(f"  targets: rtp={target_rtp:.6f} hit={target_hit:.6f}",
          file=sys.stderr)

    if game == "skeleton-key":
        apply_fn = _sk_apply
        x0, init_stats = _sk_coarse(ir)
    elif game == "fortune-coin-boost-classic":
        apply_fn = _fc_apply
        x0, init_stats = _fc_coarse(ir)
    elif game == "fort-knox-wolf-run":
        # W4.19 — undiscount the Fort Knox `avg_pay_per_trigger` ONCE
        # (reverse the W4.17 named-constant overshoot absorption) so the
        # fitter sees a physical baseline. `_fkwr_apply` re-applies the
        # raw value inside every MC eval.
        ir = _fkwr_undiscount(ir)
        apply_fn = _fkwr_apply
        x0, init_stats = _fkwr_coarse(ir)
    else:
        raise ValueError(f"unsupported game: {game}")

    init_delta_rtp = abs(init_stats["rtp"] - target_rtp)
    init_delta_hf = abs(init_stats["hit_freq"] - target_hit)

    refine_seeds = 8
    print(f"  refining (Powell, {REFINE_SPINS//1000}k spins × {refine_seeds} seeds/eval)…",
          file=sys.stderr)
    x_best, mid_stats, iters = _refine_powell(
        ir, apply_fn, x0, target_rtp, target_hit,
        max_iters=40, spins=REFINE_SPINS, multi_seed=refine_seeds,
    )

    # Final high-spin re-evaluation averaged across FINAL_SEEDS seeds.
    print(f"  final eval ({FINAL_SEEDS} seeds × {FINAL_SPINS//1_000_000}M spins)…",
          file=sys.stderr)
    final_stats = _avg_eval(ir, apply_fn, x_best, FINAL_SPINS, FINAL_SEEDS)
    final_delta_rtp = abs(final_stats["rtp"] - target_rtp)
    final_delta_hf = abs(final_stats["hit_freq"] - target_hit)
    sem_rtp = final_stats["rtp_stdev"] / np.sqrt(FINAL_SEEDS)
    sem_hf = final_stats["hit_freq_stdev"] / np.sqrt(FINAL_SEEDS)
    # Convergence: |Δrtp| ≤ 1e-4 (hard task tolerance) OR |Δrtp| within
    # 1× SEM of zero (statistical convergence — the fit hit the MC noise
    # floor for this game family). The latter case is reported as a
    # near-converge with the SEM noted, per Boki's "truth over green
    # checkmarks" rule.
    hard_converged = final_delta_rtp <= 1e-4
    noise_converged = final_delta_rtp <= sem_rtp
    converged = bool(hard_converged)
    print(f"  FINAL ({FINAL_SEEDS}×{FINAL_SPINS//1_000_000}M = "
          f"{FINAL_SEEDS*FINAL_SPINS//1_000_000}M spins): "
          f"rtp={final_stats['rtp']:.6f} (±{sem_rtp:.2e}) "
          f"hit={final_stats['hit_freq']:.6f} (±{sem_hf:.2e}) "
          f"Δrtp={final_delta_rtp:.3e} Δhf={final_delta_hf:.3e} "
          f"iters={iters} converged={converged}", file=sys.stderr)

    # Extract structured fitted weights from the materialized IR.
    ir_materialized = apply_fn(ir, x_best)
    fitted: dict[str, Any] = {}
    if game == "fort-knox-wolf-run":
        # W4.19 — per-symbol multiplier table + the per-reel materialized
        # stop weights so build_ir.py can paste them back into the IR
        # emission path without re-running the fitter.
        symbols = _fkwr_fs_symbols(ir)
        mult = np.maximum(np.round(np.exp(x_best) * 100.0).astype(int), 1)
        fitted["fs_strip_symbol_multipliers"] = {
            s: int(mult[i]) for i, s in enumerate(symbols)
        }
        fitted["fs_strip_weights_per_reel"] = []
        for rs in ir_materialized["reels"]["fs"]:
            per_reel = []
            for reel in rs["reels"]:
                per_reel.append([int(stop["weight"]) for stop in reel])
            fitted["fs_strip_weights_per_reel"].append(per_reel)
        # Also expose the raw avg_pay_per_trigger so build_ir.py knows
        # to skip the W4.17 discount.
        hw = next(
            (f for f in ir_materialized["features"]
             if f.get("kind") == "hold_and_win"),
            None,
        )
        if hw is not None:
            fitted["hold_and_win_avg_pay_per_trigger"] = float(
                hw.get("avg_pay_per_trigger") or 0.0
            )
    elif game == "skeleton-key":
        fitted["rows_weights"] = ir_materialized["topology"]["rows_weights"]
        # W4.13: SK fit also tunes BG + FS picker weights — bake them too.
        fitted["base_weights"] = [
            {"set": w["set"], "weight": w["weight"]}
            for w in ir_materialized["reels"]["base_weights"]["weights"]
        ]
        fitted["base_weights_total"] = ir_materialized["reels"]["base_weights"]["total"]
        if ir_materialized["reels"].get("fs_weights"):
            fitted["fs_weights"] = [
                {"set": w["set"], "weight": w["weight"]}
                for w in ir_materialized["reels"]["fs_weights"]["weights"]
            ]
            fitted["fs_weights_total"] = ir_materialized["reels"]["fs_weights"]["total"]
    else:
        fitted["base_weights"] = [
            {"set": w["set"], "weight": w["weight"]}
            for w in ir_materialized["reels"]["base_weights"]["weights"]
        ]
        fitted["base_weights_total"] = ir_materialized["reels"]["base_weights"]["total"]
        if ir_materialized["reels"].get("fs_weights"):
            fitted["fs_weights"] = [
                {"set": w["set"], "weight": w["weight"]}
                for w in ir_materialized["reels"]["fs_weights"]["weights"]
            ]
            fitted["fs_weights_total"] = ir_materialized["reels"]["fs_weights"]["total"]

    return {
        "game": game,
        "swid": swid,
        "target_rtp": target_rtp,
        "target_hit_freq": target_hit,
        "init": {
            "rtp": init_stats["rtp"], "hit_freq": init_stats["hit_freq"],
            "delta_rtp": init_delta_rtp, "delta_hit_freq": init_delta_hf,
        },
        "final": {
            "rtp": final_stats["rtp"], "hit_freq": final_stats["hit_freq"],
            "delta_rtp": final_delta_rtp, "delta_hit_freq": final_delta_hf,
            "rtp_sem": sem_rtp, "hit_freq_sem": sem_hf,
            "n_seeds": FINAL_SEEDS, "spins_per_seed": FINAL_SPINS,
        },
        "iters": iters,
        "fitted": fitted,
        "converged": converged,
        "noise_converged": bool(noise_converged),
    }


# ──────────────────────── Entry-point ────────────────────────


def _ir_paths(game: str, swid_filter: str | None = None) -> list[Path]:
    game_dir = GAMES / game / "out"
    out: list[Path] = []
    for p in sorted(game_dir.glob("*.slot-sim.ir.json")):
        ir = json.loads(p.read_text())
        if swid_filter and ir["meta"]["swid"] != swid_filter:
            continue
        out.append(p)
    return out


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if not ENGINE_BIN.exists():
        print(f"ERROR: slot-sim binary not found at {ENGINE_BIN}", file=sys.stderr)
        print("Build it first:", file=sys.stderr)
        print("  cd engine/slot-sim && cargo build --release --bin slot-sim",
              file=sys.stderr)
        return 1
    if args[0] == "all":
        games = ["skeleton-key", "fortune-coin-boost-classic",
                 "fort-knox-wolf-run"]
        swid_filter = None
    else:
        games = [args[0]]
        swid_filter = args[1] if len(args) > 1 else None

    all_results: list[dict] = []
    for game in games:
        for ir_path in _ir_paths(game, swid_filter):
            ir = json.loads(ir_path.read_text())
            swid = ir["meta"]["swid"]
            print(f"\n=== {game} / {swid} ===", file=sys.stderr)
            res = fit_one(game, swid, ir_path)
            all_results.append(res)
            overlay_path = (
                GAMES / game / "out" / f"{game}.{swid}.picker_fit.json"
            )
            overlay_path.write_text(json.dumps(res, indent=2))
            print(f"  overlay → {overlay_path.name}", file=sys.stderr)

    # Emit a compact Python literal for paste into build_ir.py.
    print("\n# ──────── BAKE-IN TABLE (paste into build_ir.py) ────────")
    sk_table: dict[str, dict] = {}
    fc_table: dict[str, dict] = {}
    fkwr_table: dict[str, dict] = {}
    for r in all_results:
        if r["game"] == "skeleton-key":
            sk_table[r["swid"]] = r["fitted"]
        elif r["game"] == "fortune-coin-boost-classic":
            fc_table[r["swid"]] = r["fitted"]
        elif r["game"] == "fort-knox-wolf-run":
            fkwr_table[r["swid"]] = r["fitted"]
    if sk_table:
        print("SK_FITTED_W413 =", json.dumps(sk_table, indent=2))
    if fc_table:
        print("FC_FITTED_W413 =", json.dumps(fc_table, indent=2))
    if fkwr_table:
        print("FKWR_FITTED_W419 =", json.dumps(fkwr_table, indent=2))

    # Convergence summary.
    print("\n# ──────── W4.13 fit summary ────────")
    print(f"{'game':25s} {'swid':14s} "
          f"{'init_Δrtp':>10s} {'final_Δrtp':>11s} {'final_Δhf':>11s} "
          f"{'iters':>6s} {'conv':>5s}")
    for r in all_results:
        print(f"{r['game']:25s} {r['swid']:14s} "
              f"{r['init']['delta_rtp']:10.6f} "
              f"{r['final']['delta_rtp']:11.3e} "
              f"{r['final']['delta_hit_freq']:11.3e} "
              f"{r['iters']:>6d} {'YES' if r['converged'] else 'NO':>5s}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
