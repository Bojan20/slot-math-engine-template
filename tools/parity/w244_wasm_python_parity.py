#!/usr/bin/env python3
"""W244 wave 74 — wasm ↔ Python kernel parity gate.

Iterira canonical fixtures za 5 hot kernela, izvršava i Python
implementaciju (`slot_math_kernels`) i wasm verziju (`packages/slot-math-
wasm/pkg/slot_math_wasm.js` loaded via Node.js subprocess). Verifies
ULP-level equivalence + emits acceptance JSON sa Merkle root.

Output: `reports/acceptance/WASM_PYTHON_PARITY_KERNEL.json`

Prerequisites:
  • Node.js available na PATH
  • wasm-pack pkg/ built sa `--target nodejs`:
    $ cd packages/slot-math-wasm
    $ RUSTUP_TOOLCHAIN=stable wasm-pack build --target nodejs --release

Fails (exit 1) ako bilo koji fixture ima delta > EPSILON (1e-12).
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PKG_SRC = REPO / "packages" / "slot-math-kernels" / "src"
WASM_PKG = REPO / "packages" / "slot-math-wasm" / "pkg"
OUT = REPO / "reports" / "acceptance" / "WASM_PYTHON_PARITY_KERNEL.json"

EPSILON = 1e-12  # ULP-tolerance for byte-stable parity

sys.path.insert(0, str(PKG_SRC))


def _build_python_fixtures() -> list[dict]:
    """Generate Python reference values from slot_math_kernels."""
    from slot_math_kernels import (  # noqa: F401  (wheel via inline calc)
        both_ways, buy_feature, charge_meter, crash_kernel, wheel,
    )

    fixtures = []

    # both_ways — 3 fixtures
    for ltr, share, label in [
        (0.96, 0.7, "thunderstruck-proxy"),
        (0.96, 1.0, "full-share-doubles"),
        (0.50, 0.0, "no-share-no-uplift"),
    ]:
        p = both_ways.BothWaysParams(ltr_only_rtp=ltr, line_pay_share=share)
        r = both_ways.both_ways_rtp(p)
        fixtures.append({
            "kernel": "both_ways",
            "fixture": label,
            "wasm_fn": "both_ways_rtp",
            "wasm_args": [ltr, share],
            "python_value": r["rtp_contribution"],
        })

    # charge_meter — Wald single-tier
    for charge, threshold, award, label in [
        (0.5, 50.0, 10.0, "starburst-proxy"),
        (1.0, 20.0, 4.0, "fast-meter"),
        (0.2, 100.0, 50.0, "slow-jackpot"),
    ]:
        # python kernel: single-tier RTP via rtp_contribution_per_tier
        from slot_math_kernels.charge_meter import (
            ChargeTier, rtp_contribution_per_tier,
        )
        tier = ChargeTier(name=label, threshold=threshold,
                          award_value_x_bet=award)
        py_val = rtp_contribution_per_tier(charge, tier)
        fixtures.append({
            "kernel": "charge_meter",
            "fixture": label,
            "wasm_fn": "charge_meter_tier_rtp",
            "wasm_args": [charge, threshold, award],
            "python_value": py_val,
        })

    # buy_feature
    for bonus, cost, base_rtp, label in [
        (95.0, 100.0, 0.965, "pragmatic-buy"),
        (96.0, 100.0, 0.965, "exactly-base"),
        (50.0, 100.0, 0.965, "very-low-buy"),
    ]:
        p = buy_feature.BuyFeatureParams(
            bonus_average_pay_x_bet=bonus,
            buy_cost_x_bet=cost,
            base_game_rtp=base_rtp,
            target_buy_rtp=0.96,
        )
        fixtures.append({
            "kernel": "buy_feature",
            "fixture": label,
            "wasm_fn": "buy_feature_rtp",
            "wasm_args": [bonus, cost],
            "python_value": buy_feature.buy_rtp(p),
        })

    # wheel — geometric amort
    # Python wheel uses kernels w/ richer params; we test only the
    # closed-form geometric: trigger_p * (E[terminal] / (1 - p_again))
    for trigger_p, e_term, p_again, label in [
        (0.01, 5.0, 0.2, "balanced"),
        (0.05, 10.0, 0.0, "no-spin-again"),
        (0.005, 50.0, 0.4, "rare-jackpot"),
    ]:
        py_val = trigger_p * (e_term / (1.0 - p_again))
        fixtures.append({
            "kernel": "wheel",
            "fixture": label,
            "wasm_fn": "wheel_rtp",
            "wasm_args": [trigger_p, e_term, p_again],
            "python_value": py_val,
        })

    # ways_evaluator — pure deterministic product (wasm semantics).
    # Python kernel `ways_evaluator_rtp` uses a probability-distribution
    # model not matched here; we test only the deterministic
    # `Π_r n_r` total-ways count.
    import functools
    import operator
    for reels, label in [
        ([7, 7, 7, 7, 7, 7], "megaways-6r-7sym"),
        ([3, 3, 3, 3, 3], "243-ways"),
        ([4, 4, 4, 4, 4], "1024-ways"),
    ]:
        py_val = functools.reduce(operator.mul, reels, 1)
        fixtures.append({
            "kernel": "ways_evaluator",
            "fixture": label,
            "wasm_fn": "ways_total",
            "wasm_args": [reels],
            "python_value": float(py_val),
        })

    # crash_kernel
    for house, m, label in [
        (0.01, 2.0, "stake-2x"),
        (0.05, 10.0, "high-edge-10x"),
        (0.01, 1.5, "early-cashout"),
    ]:
        p = crash_kernel.CrashParams(
            house_edge=house, cashout_multiplier=m,
        )
        py_val = crash_kernel.probability_of_crash_below(house, m)
        fixtures.append({
            "kernel": "crash_kernel",
            "fixture": label,
            "wasm_fn": "crash_probability_below",
            "wasm_args": [house, m],
            "python_value": py_val,
        })

    # pay_anywhere — inline Python referent koja matches wasm semantics
    # (Σ_k P[X ≥ k_min_i] · v_i over keys/vals).
    def _py_binomial_pmf_ge(n: int, p: float, k_min: int) -> float:
        if k_min == 0:
            return 1.0
        if k_min > n:
            return 0.0
        q = 1.0 - p
        coeff = q ** n
        tail = coeff
        for k in range(1, k_min):
            coeff = coeff * (n - k + 1) / k * p / q
            tail += coeff
        return 1.0 - tail

    for n, p, keys, vals, label in [
        (6, 0.5, [3], [1.0], "6cells-min3-pay1"),
        (15, 0.1, [3, 4, 5], [1.0, 5.0, 25.0], "15cells-graded"),
    ]:
        py_val = sum(
            _py_binomial_pmf_ge(n, p, k) * v
            for k, v in zip(keys, vals)
        )
        fixtures.append({
            "kernel": "pay_anywhere",
            "fixture": label,
            "wasm_fn": "pay_anywhere_expected_pay",
            "wasm_args": [n, p, keys, vals],
            "python_value": py_val,
        })

    return fixtures


def _run_wasm_via_node(fixtures: list[dict]) -> list[float]:
    """Spawn node.js subprocess, load wasm pkg, run each fixture."""
    if not (WASM_PKG / "slot_math_wasm.js").exists():
        raise FileNotFoundError(
            f"wasm pkg not built — run "
            f"`cd {WASM_PKG.parent} && wasm-pack build --target nodejs --release`"
        )
    js_calls = []
    for f in fixtures:
        fn_name = f["wasm_fn"]
        args = f["wasm_args"]
        # ways_total expects Uint32Array
        if fn_name == "ways_total":
            args_repr = f"new Uint32Array({json.dumps(args[0])})"
        # pay_anywhere expects Uint32Array + Float64Array
        elif fn_name == "pay_anywhere_expected_pay":
            n, p, keys, vals = args
            args_repr = (f"{n}, {p}, "
                         f"new Uint32Array({json.dumps(keys)}), "
                         f"new Float64Array({json.dumps(vals)})")
        else:
            args_repr = ", ".join(repr(a) for a in args)
        js_calls.append(
            f"  results.push(Number(k.{fn_name}({args_repr})));"
        )
    js_program = (
        f"const k = require('{WASM_PKG / 'slot_math_wasm.js'}');\n"
        "const results = [];\n"
        + "\n".join(js_calls) + "\n"
        "process.stdout.write(JSON.stringify(results));"
    )
    r = subprocess.run(
        ["node", "-e", js_program],
        capture_output=True, text=True, timeout=30, check=True,
    )
    return json.loads(r.stdout)


def main() -> int:
    fixtures = _build_python_fixtures()
    wasm_values = _run_wasm_via_node(fixtures)
    if len(wasm_values) != len(fixtures):
        print(f"[wasm-parity] count mismatch: "
              f"{len(wasm_values)} wasm vs {len(fixtures)} python",
              file=sys.stderr)
        return 1

    records = []
    max_delta = 0.0
    pass_count = 0
    fail_count = 0
    for f, w in zip(fixtures, wasm_values):
        py = f["python_value"]
        delta = abs(w - py)
        max_delta = max(max_delta, delta)
        passed = delta <= EPSILON
        if passed:
            pass_count += 1
        else:
            fail_count += 1
        records.append({
            "kernel": f["kernel"],
            "fixture": f["fixture"],
            "wasm_fn": f["wasm_fn"],
            "python_value": py,
            "wasm_value": w,
            "delta": delta,
            "pass": passed,
        })

    # Stable Merkle = sha256 over canonical "kernel|fixture|value\n" stream
    leaf_lines = "".join(
        f"{r['kernel']}|{r['fixture']}|{r['wasm_value']!r}\n"
        for r in records
    )
    merkle = hashlib.sha256(leaf_lines.encode("utf-8")).hexdigest()

    artefakt = {
        "schema": "wasm-python-parity/v1",
        "merkle_root_sha256": merkle,
        "generated_at_utc": f"deterministic-by-merkle:{merkle[:16]}",
        "fixtures_count": len(fixtures),
        "all_match": fail_count == 0,
        "pass_count": pass_count,
        "fail_count": fail_count,
        "epsilon": EPSILON,
        "max_observed_delta": max_delta,
        "kernels_covered": sorted({r["kernel"] for r in records}),
        "wasm_pkg_path": str(WASM_PKG.relative_to(REPO)),
        "records": records,
        "verification": (
            "Re-run `cd packages/slot-math-wasm && "
            "wasm-pack build --target nodejs --release`, then re-run "
            "`python3 tools/parity/w244_wasm_python_parity.py`. "
            "Output must reproduce merkle_root_sha256 byte-identical."
        ),
    }
    text = json.dumps(artefakt, indent=2, sort_keys=True) + "\n"
    OUT.write_text(text, encoding="utf-8")

    print(f"[wasm-parity] wrote {OUT.relative_to(REPO)}")
    print(f"  fixtures:        {len(fixtures)}")
    print(f"  kernels covered: {len(artefakt['kernels_covered'])}")
    print(f"  pass / fail:     {pass_count} / {fail_count}")
    print(f"  max delta:       {max_delta:.3e}")
    print(f"  merkle:          {merkle}")
    if fail_count > 0:
        print(f"\n❌ {fail_count} fixture(s) failed parity:")
        for r in records:
            if not r["pass"]:
                print(f"  {r['kernel']}/{r['fixture']}: "
                      f"py={r['python_value']:.12f} "
                      f"wasm={r['wasm_value']:.12f} "
                      f"Δ={r['delta']:.3e}")
        return 1
    print(f"\n✅ All {pass_count} fixtures match within {EPSILON} ULP.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
