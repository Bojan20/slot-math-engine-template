"""Vendor profile scaffold generator.

Emit a fresh vendor-profile YAML skeleton for a new (real or generic)
slot vendor, ready to be calibrated against an actual PAR sheet.

Usage:
    python -m tools.vendor_profiles.scaffold <vendor_id> \\
        --display-name "Vendor F — Wheel Bonus (generic)" \\
        --topology rectangular --reels 5 --rows 3 --paylines 25 \\
        --feature bonus_wheel --feature free_spins \\
        --out tools/vendor_profiles/vendor_f.yaml

Or programmatic API:

    from tools.vendor_profiles.scaffold import scaffold_profile
    text = scaffold_profile(
        vendor_id="vendor_f",
        display_name="Vendor F — Wheel Bonus (generic)",
        topology="rectangular",
        reels=5, rows=3, paylines=25,
        features=["bonus_wheel", "free_spins"],
    )

The emitted YAML follows the schema documented in
`tools/parse_par/profile.py` and is immediately loadable via
`load_profile(<vendor_id>)` once written to the
`tools/vendor_profiles/` directory.
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path
from typing import Iterable


KNOWN_FEATURES = (
    "free_spins",
    "pick_bonus",
    "hold_and_win",
    "wild_expand",
    "pattern_win",
    "linear_progressive",
    "cascade",
    "mystery_reveal",
    "sticky_wild",
    "symbol_upgrade",
    "buy_feature",
    "bonus_wheel",
    "cash_eruption_pages",
    "ways_evaluation",
)


def _topology_block(topology: str, reels: int, rows, paylines) -> str:
    """Emit the `dimensions:` block based on topology kind."""
    if topology == "cluster":
        return (
            "dimensions:\n"
            f"  reels: {reels}\n"
            f"  rows: {rows}\n"
            "  paylines: cluster\n"
            "  left_to_right_only: false\n"
            "  min_cluster_size: 5\n"
        )
    if topology == "ways":
        return (
            "dimensions:\n"
            f"  reels: {reels}\n"
            f"  rows: {rows}\n"
            "  paylines: ways\n"
            "  left_to_right_only: true\n"
            "  ways_min_height: 2\n"
            "  ways_max_height: 7\n"
        )
    # default rectangular
    return (
        "dimensions:\n"
        f"  reels: {reels}\n"
        f"  rows: {rows}\n"
        f"  paylines: {paylines}\n"
        "  left_to_right_only: true\n"
    )


def _feature_block(feature: str) -> str:
    """Emit a placeholder feature config for one feature kind."""
    canon = feature.lower().strip()
    base = f"  - type: {canon}\n    config:\n"
    if canon == "free_spins":
        return base + (
            '      paytable_header_label: "Free Spins Bonus"\n'
            "      paytable_header_col: 2\n"
            "      combo_cols: [2, 7]\n"
            "      pays_col: 7\n"
            "      pph_col: 8\n"
            "      rtp_pct_col: 9\n"
            "      marker_col: 1\n"
            "      max_rows: 40\n"
            '      summary_header_substr: "Bonus Summary"\n'
            "      summary_data_offset: 3\n"
        )
    if canon == "pick_bonus":
        return base + (
            '      header_label: "Pick Bonus"\n'
            "      header_col: 1\n"
            "      trigger_symbol_col: 2\n"
            "      trigger_count_col: 3\n"
            "      avg_pay_col: 4\n"
        )
    if canon == "hold_and_win":
        return base + (
            '      header_label: "Hold and Win"\n'
            "      header_col: 1\n"
            "      trigger_prob_col: 2\n"
            "      avg_pay_col: 3\n"
            "      grand_value_col: 4\n"
        )
    if canon == "cascade":
        return base + (
            '      header_label: "Cascade Chain"\n'
            "      header_col: 1\n"
            "      chain_length_col: 2\n"
            "      multiplier_col: 3\n"
            "      max_chain_length: 12\n"
            "      cascade_in_fs: true\n"
        )
    if canon == "pattern_win":
        return base + (
            '      header_label: "Pattern Pays"\n'
            "      header_col: 1\n"
            "      anchor_symbol_col: 2\n"
            "      anchor_reel_col: 3\n"
            "      tail_reels_col: 4\n"
            "      pay_col: 5\n"
            "      max_rows: 30\n"
        )
    if canon == "sticky_wild":
        return base + (
            '      header_label: "Sticky Wild"\n'
            "      header_col: 1\n"
            "      landing_prob_col: 2\n"
            "      pay_rate_col: 3\n"
            "      active_in_fs: true\n"
            "      max_simultaneous_wilds: 12\n"
        )
    if canon == "wild_expand":
        return base + (
            '      header_label: "Wild Expand"\n'
            "      header_col: 1\n"
            "      on_reels_col: 2\n"
            "      expand_only_when_base_no_win: true\n"
            "      subset_search: true\n"
        )
    if canon == "mystery_reveal":
        return base + (
            '      header_label: "Mystery Reveal"\n'
            "      header_col: 1\n"
            "      reveal_prob_col: 2\n"
            "      reveal_symbol_dist_col: 3\n"
        )
    if canon == "symbol_upgrade":
        return base + (
            '      header_label: "Symbol Upgrade"\n'
            "      header_col: 1\n"
            "      upgrade_prob_col: 2\n"
            "      target_symbol_col: 3\n"
            "      multiplier_col: 4\n"
        )
    if canon == "buy_feature":
        return base + (
            '      header_label: "Buy Feature"\n'
            "      header_col: 1\n"
            "      cost_multiplier_col: 2\n"
            "      bonus_rtp_col: 3\n"
        )
    if canon == "bonus_wheel":
        return base + (
            '      header_label: "Bonus Wheel"\n'
            "      header_col: 1\n"
            "      slot_count_col: 2\n"
            "      slot_value_col: 3\n"
            "      respin_prob_col: 4\n"
        )
    if canon == "linear_progressive":
        return base + (
            '      summary_sheet: PAR_Summary\n'
            "      increment_col: 2\n"
            "      seed_col: 3\n"
        )
    if canon == "ways_evaluation":
        return base + (
            '      header_label: "Ways Pays"\n'
            "      header_col: 1\n"
            "      min_match: 3\n"
            "      ways_distribution_row_range: [80, 130]\n"
            "      ways_count_col: 2\n"
            "      probability_col: 3\n"
        )
    if canon == "cash_eruption_pages":
        return base + (
            "      page_pattern: 'BET MULTIPLIER\\s+(\\d+)'\n"
            '      fireballs_set_label: "Fireballs Set"\n'
            "      pool_labels: [low, med, high]\n"
        )
    # unknown feature → emit a TODO comment placeholder
    return base + f"      # TODO: populate {canon} config fields\n"


def scaffold_profile(
    *,
    vendor_id: str,
    display_name: str,
    topology: str = "rectangular",
    reels: int = 5,
    rows=3,
    paylines=20,
    features: Iterable[str] = ("free_spins",),
    profile_version: int = 1,
) -> str:
    """Return a fresh vendor-profile YAML as a string.

    Args:
      vendor_id: short id (lowercase, used in file name and registry).
      display_name: human-readable label.
      topology: "rectangular" | "cluster" | "ways".
      reels: number of reels (3-7 typical).
      rows: int for rectangular/cluster; list[int] for variable.
      paylines: int for rectangular; ignored for cluster/ways.
      features: iterable of feature kinds. Each maps to a placeholder
                config block via `_feature_block`.
      profile_version: starts at 1; increment on breaking layout
                       changes once calibrated.
    """
    if not vendor_id or not vendor_id.replace("_", "").isalnum():
        raise ValueError(
            f"vendor_id must be alnum + underscores, got {vendor_id!r}"
        )
    if topology not in ("rectangular", "cluster", "ways"):
        raise ValueError(
            f"topology must be rectangular|cluster|ways, got {topology!r}"
        )

    feat_list = list(features) or ["free_spins"]
    head = (
        f"# {display_name}\n"
        "#\n"
        "# Generated by tools/vendor_profiles/scaffold.py — placeholder\n"
        "# coordinates. Calibrate against a real PAR sheet before relying\n"
        "# on this profile for parse output.\n"
        "\n"
        f"vendor: {vendor_id}\n"
        f'display_name: "{display_name}"\n'
        f"profile_version: {profile_version}\n"
        "\n"
        "sheets:\n"
        "  main_par: PAR-001\n"
        "\n"
    )
    dims = _topology_block(topology, reels, rows, paylines)
    meta = (
        "\nmeta:\n"
        "  swid:     { row: 2, col: 4 }\n"
        "  hold:     { row: 0, col: 14 }\n"
        "  hit_freq: { row: 1, col: 14 }\n"
        "  win_freq: { row: 2, col: 14 }\n"
        "\n"
        "rtp_breakdown:\n"
        "  base_game:  { row: 60, col: 11 }\n"
        "  free_spins: { row: 62, col: 11 }\n"
        "  total:      { row: 64, col: 11 }\n"
        "\n"
        "bet_table:\n"
        "  row_range: [24, 45]\n"
        "  mult_col: 11\n"
        "  total_col: 12\n"
        "  max_liab_col: 13\n"
        "\n"
        "paytable:\n"
        "  row_range: [24, 55]\n"
        "  combo_cols: [2, 7]\n"
        "  pays_col: 7\n"
        "  pph_col: 8\n"
        "  rtp_pct_col: 9\n"
        "  marker_col: 1\n"
        "\n"
        "reel_sets:\n"
        "  base:\n"
        '    header_label: "Base Game Reel Set:"\n'
        "    header_col: 1\n"
        "    set_num_col: 3\n"
        "    data_offset: 4\n"
        f"    reel_count: {reels}\n"
        "    symbol_col_start: 2\n"
        "    stride: 2\n"
        "    index_col: 1\n"
        "    total_label: Total\n"
        "    max_stops: 200\n"
        "\nreel_set_weights:\n"
        "  base:\n"
        "    row_range: [68, 104]\n"
        "    set_col: 2\n"
        "    weight_col: 3\n"
        "    total_row: 104\n"
        "    total_col: 3\n"
    )

    feats = "\nfeatures:\n" + "".join(_feature_block(f) for f in feat_list)

    return head + dims + meta + feats


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-vendor-scaffold",
        description="Emit a fresh vendor-profile YAML skeleton.",
    )
    p.add_argument("vendor_id", help="short id (e.g. vendor_f)")
    p.add_argument("--display-name", required=True, help="human label")
    p.add_argument(
        "--topology",
        default="rectangular",
        choices=("rectangular", "cluster", "ways"),
    )
    p.add_argument("--reels", type=int, default=5)
    p.add_argument(
        "--rows",
        default="3",
        help="int (3) or comma-separated list (2,3,4,5,6,7) for variable",
    )
    p.add_argument("--paylines", type=int, default=20)
    p.add_argument(
        "--feature",
        action="append",
        default=None,
        help="repeatable; known features: " + ", ".join(KNOWN_FEATURES),
    )
    p.add_argument("--profile-version", type=int, default=1)
    p.add_argument("--out", type=Path, default=None,
                   help="output file (default: stdout)")
    args = p.parse_args(argv)

    # Parse rows
    if "," in args.rows:
        rows_val: int | list[int] = [int(x.strip()) for x in args.rows.split(",")]
    else:
        rows_val = int(args.rows)

    features = args.feature or ["free_spins"]
    yaml_text = scaffold_profile(
        vendor_id=args.vendor_id,
        display_name=args.display_name,
        topology=args.topology,
        reels=args.reels,
        rows=rows_val,
        paylines=args.paylines,
        features=features,
        profile_version=args.profile_version,
    )
    if args.out is None:
        sys.stdout.write(yaml_text)
    else:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(yaml_text)
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
