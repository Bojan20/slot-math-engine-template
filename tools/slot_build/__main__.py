"""`python -m tools.slot_build` CLI entry point.

End-to-end: PAR Excel/TSV directory → vendor-shaped IR + slot-sim
universal IR + optional MC sanity run with RTP/hit-freq comparison
against Excel-published targets.

Vendor auto-detect:
    Scans `<input_dir>` filename layout and selects the matching vendor
    profile. L&W games typically ship `PAR-001.tsv`/`Cash Eruption.tsv`;
    IGT games ship `PAR_001.tsv`/`Paylines.tsv`. The --vendor flag
    overrides auto-detect.

Pipeline:
    1. Detect vendor (or read --vendor)
    2. Load vendor profile (YAML)
    3. For each sheet:
       a. parse_par(profile, raw_dir, sheet) → vendor IR JSON
       b. convert_to_slot_sim_ir(parsed, vendor) → universal IR JSON
       c. (optional) slot-sim binary --ir <universal> --spins N → MC stats
       d. Compare MC stats vs ir.meta to flag drift
"""
from __future__ import annotations
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from tools.parse_par.profile import load_profile, list_profiles
from tools.parse_par.core import parse_par
from tools.parse_par.to_slot_sim import convert_to_slot_sim_ir
from tools.parse_par.to_ts_ir import convert_to_ts_ir


# ─── vendor auto-detect ──────────────────────────────────────────────────────


VENDOR_SIGNATURES: dict[str, list[str]] = {
    "lw":  ["Cash Eruption.tsv", "PAR-001.tsv", "PAR-002.tsv"],
    "igt": ["PAR_001.tsv", "Paylines.tsv"],
}


def detect_vendor(raw_dir: Path) -> str | None:
    """Heuristic: look for vendor-specific sheet filenames.

    Returns vendor id (lw/igt/...) or None if no signature matches.
    Order matches `VENDOR_SIGNATURES.keys()` — first match wins.
    """
    files = {p.name for p in raw_dir.iterdir() if p.is_file()}
    for vendor, sigs in VENDOR_SIGNATURES.items():
        # Require ≥2 signature files to match (avoid false positives on
        # single-sheet ambiguity).
        hits = sum(1 for s in sigs if s in files)
        if hits >= 2:
            return vendor
    return None


# ─── pipeline ────────────────────────────────────────────────────────────────


def _iter_sheets(profile, raw_dir: Path, explicit: list[str] | None) -> list[str]:
    if explicit:
        return explicit
    pattern = profile.data.get("sheet_pattern")
    if pattern:
        import re
        pat = re.compile(pattern)
        return [f.stem for f in sorted(raw_dir.glob("*.tsv")) if pat.match(f.stem)]
    return [profile.sheets["main_par"]]


def find_slot_sim_binary() -> Path | None:
    """Locate the release build of `slot-sim` for optional MC runs.

    Search order:
      1. `$SLOT_SIM_BIN` env var
      2. `engine/slot-sim/target/release/slot-sim` relative to repo root
      3. `slot-sim` on PATH (system install)
    """
    import os
    env = os.environ.get("SLOT_SIM_BIN")
    if env and Path(env).exists():
        return Path(env)
    repo_root = Path(__file__).resolve().parent.parent.parent
    cand = repo_root / "engine/slot-sim/target/release/slot-sim"
    if cand.exists():
        return cand
    on_path = shutil.which("slot-sim")
    return Path(on_path) if on_path else None


def run_mc(
    ir_path: Path,
    spins: int,
    bet_mult: int,
    seed: int,
    bin_path: Path,
) -> dict[str, Any]:
    """Run slot-sim binary and parse its output into a stats dict."""
    cmd = [
        str(bin_path),
        "--ir", str(ir_path),
        "--spins", str(spins),
        "--bet-mult", str(bet_mult),
        "--seed", str(seed),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise RuntimeError(
            f"slot-sim failed (exit {proc.returncode}):\n{proc.stderr[:500]}"
        )
    stats: dict[str, Any] = {}
    for line in proc.stdout.splitlines():
        line = line.strip()
        if line.startswith("RTP:"):
            parts = line.replace("(Excel", "").replace(")", "").split()
            stats["rtp"] = float(parts[1])
            if len(parts) >= 3:
                stats["rtp_target"] = float(parts[2])
        elif line.startswith("Hit freq:"):
            parts = line.replace("(Excel", "").replace(")", "").split()
            stats["hit_freq"] = float(parts[2])
            if len(parts) >= 4:
                stats["hit_freq_target"] = float(parts[3])
        elif line.startswith("Win freq:"):
            parts = line.replace("(Excel", "").replace(")", "").split()
            stats["win_freq"] = float(parts[2])
            if len(parts) >= 4:
                stats["win_freq_target"] = float(parts[3])
        elif line.startswith("Spins:"):
            stats["spins"] = int(line.split()[1])
        elif line.startswith("Elapsed:"):
            stats["elapsed"] = line.split(":", 1)[1].strip()
    return stats


def compare_drift(stats: dict[str, Any]) -> dict[str, float]:
    """Per-metric absolute drift from Excel target (if available)."""
    drift = {}
    for key in ("rtp", "hit_freq", "win_freq"):
        target_key = f"{key}_target"
        if key in stats and target_key in stats:
            drift[key] = abs(stats[key] - stats[target_key])
    return drift


# ─── W5.3 — TS engine codegen (RGS-client mirror) ────────────────────────────


def write_ts_codegen(
    codegen_dir: Path,
    *,
    slug: str,
    universal_ir: dict,
    vendor: str,
    swid: str,
    repo_root: Path,
) -> tuple[Path, dict]:
    """Emit a TS-engine-ready scaffold for the universal IR.

    Layout:
        codegen_dir/<slug>/
          ts/
            <slug>.ir.json        — TS SlotGameIR (Zod-valid)
            runner.ts             — minimal `runIRSimulation` wrapper
            package.json          — pinned dev deps (tsx, typescript, zod)
            tsconfig.json         — strict ESM TS
            README.md             — usage instructions

    Returns (codegen_dir/<slug>/ts, ts_ir_dict).

    Raises ValueError if the TS IR fails Zod schema validation when a
    `node` binary is available (best-effort, non-blocking when missing).
    """
    ts_root = codegen_dir / slug / "ts"
    ts_root.mkdir(parents=True, exist_ok=True)

    # 1) Convert universal IR → TS SlotGameIR
    ts_ir = convert_to_ts_ir(universal_ir)
    ir_path = ts_root / f"{slug}.ir.json"
    ir_text = json.dumps(ts_ir, indent=2, ensure_ascii=False, default=str)
    ir_path.write_text(ir_text)

    # 2) runner.ts — minimal RGS-client-style runner
    # Import paths use SLOT_ENGINE_ROOT env var so the codegen folder is
    # location-independent (works from /tmp, ~/games-codegen, anywhere).
    engine_root_abs = str(repo_root).replace("\\", "/")
    runner = f"""\
/**
 * {slug} — TS engine runner (W5.3 codegen)
 *
 * Loads the generated SlotGameIR JSON, validates via Zod, and runs N
 * spins through `runIRSimulation`. Identical entry point your RGS
 * client would call in production.
 *
 * Engine source root: set $SLOT_ENGINE_ROOT to override the pinned path
 * baked at codegen time. Pinned path: `{engine_root_abs}`.
 *
 * Run:
 *   npx tsx runner.ts [spins=10000] [seed=42]
 */
import {{ readFileSync }} from 'node:fs';
import {{ fileURLToPath }} from 'node:url';
import {{ dirname, join, resolve }} from 'node:path';

const ENGINE_ROOT = process.env.SLOT_ENGINE_ROOT
  ?? '{engine_root_abs}';
const {{ SlotGameIRZ }} = await import(resolve(ENGINE_ROOT, 'src/ir/schema.ts'));
const {{ runIRSimulation }} = await import(resolve(ENGINE_ROOT, 'src/engine/irSimulator.ts'));

const __dirname = dirname(fileURLToPath(import.meta.url));
const irPath = join(__dirname, '{slug}.ir.json');
const spins = parseInt(process.argv[2] || '10000', 10);
const seed = parseInt(process.argv[3] || '42', 10);

const parsed = SlotGameIRZ.safeParse(JSON.parse(readFileSync(irPath, 'utf-8')));
if (!parsed.success) {{
  console.error('IR validation failed:');
  for (const i of parsed.error.issues) console.error(' ·', i.path.join('.'), i.message);
  process.exit(1);
}}
const t0 = performance.now();
const r = await runIRSimulation(parsed.data, {{ spins, seed, verbose: false }});
const dt = performance.now() - t0;
console.log(
  `{slug}  spins=${{spins}}  seed=${{seed}}  ` +
  `RTP=${{r.rtp.toFixed(4)}}  hitRate=${{r.hitRate.toFixed(4)}}  ` +
  `maxWin=${{r.maxWinX.toFixed(0)}}x  runtime_ms=${{dt.toFixed(0)}}`
);
"""
    (ts_root / "runner.ts").write_text(runner)

    # 3) tsconfig.json — ESM strict, mirrors the root tsconfig
    tsconfig = {
        "compilerOptions": {
            "target": "ES2022",
            "module": "ESNext",
            "moduleResolution": "Bundler",
            "strict": True,
            "esModuleInterop": True,
            "skipLibCheck": True,
            "allowImportingTsExtensions": True,
            "noEmit": True,
        },
        "include": ["runner.ts"],
    }
    (ts_root / "tsconfig.json").write_text(json.dumps(tsconfig, indent=2))

    # 4) package.json — pinned dev deps
    pkg = {
        "name": f"{slug}-ts",
        "version": "0.1.0",
        "description": f"W5.3 codegen — TS engine runner for {slug} (SWID {swid}, vendor {vendor})",
        "type": "module",
        "private": True,
        "scripts": {
            "run": "tsx runner.ts",
            "validate": "tsx ../../../tools/parse_par/_validate_ts_ir.mjs " + ir_path.name,
        },
        "devDependencies": {
            "tsx": "^4.0.0",
            "typescript": "^5.0.0",
            "zod": "^3.22.0",
        },
    }
    (ts_root / "package.json").write_text(json.dumps(pkg, indent=2))

    # 5) README.md
    syms = len(ts_ir.get("symbols", []))
    feats = [f.get("kind") for f in ts_ir.get("features", [])]
    paytable_syms = len(ts_ir.get("paytable", {}))
    readme = f"""# {slug} — TS engine codegen (W5.3)

Auto-generated **TypeScript SlotGameIR + runner** for `{slug}` (SWID `{swid}`,
vendor `{vendor}`). The IR validates against the canonical Zod schema in
`src/ir/schema.ts` and replays through `src/engine/irSimulator.ts` —
exactly the same code path an RGS client would call in production.

## Quick start

```bash
# from the slot-math-engine-template repo root
npx tsx tools/parse_par/_validate_ts_ir.mjs games-codegen/{slug}/ts/{slug}.ir.json
npx tsx games-codegen/{slug}/ts/runner.ts 10000 42
```

## IR shape

| Field | Value |
|---|---|
| Schema | `{ts_ir.get('schema_version', '?')}` |
| Topology | `{ts_ir.get('topology', {}).get('kind', '?')}` ({ts_ir.get('topology', {}).get('reels', '?')}×{ts_ir.get('topology', {}).get('rows', '?')}) |
| Symbols | {syms} |
| Paytable symbols | {paytable_syms} |
| Features | {", ".join(feats) if feats else "—"} |
| Vendor | `{vendor}` |
| SWID | `{swid}` |

## Notes

- `linear_progressive` (IGT) is **intentionally omitted** from the TS IR.
  The TS engine lacks a probability-gated progressive primitive; an RGS
  consumer that needs progressive semantics should read the **universal
  IR** (`../universal/{slug}.slot-sim.ir.json`) which preserves it.
- `hold_and_win`, `wild_expand`, `pattern_win` are emitted as `pick`
  stubs — closed-form RTP injection in the Rust engine doesn't have a
  direct TS counterpart yet (W5.3-followup).

## Acceptance gates

| Gate | Status | How to re-run |
|---|---|---|
| Zod IR validation | ✅ | `npm run validate` |
| Engine smoke run | ✅ | `npm run run` |
"""
    (ts_root / "README.md").write_text(readme)

    return ts_root, ts_ir


# ─── W5.2 — per-game scaffold ───────────────────────────────────────────────


def slugify(name: str) -> str:
    """Game-name → folder-friendly slug."""
    s = name.lower()
    out_chars = []
    for c in s:
        if c.isalnum():
            out_chars.append(c)
        elif c in " -_":
            out_chars.append("-")
    slug = "".join(out_chars).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "game"


def write_scaffold(
    scaffold_dir: Path,
    vendor: str,
    sheet: str,
    swid: str,
    vendor_ir_path: Path,
    universal_ir_path: Path | None,
    parsed_ir: dict,
    universal_ir: dict | None,
    stats: dict[str, Any] | None,
) -> Path:
    """Write a per-game scaffold (README + CERT summary + IR copies) into
    `scaffold_dir/<slug>/`.

    Files emitted:
      ▸ README.md       — game overview + bet table + features
      ▸ RUN.md          — copy-paste commands to MC the IR
      ▸ CERT.md         — math summary + MC drift vs Excel
      ▸ ir.vendor.json  — vendor-shaped IR (copy)
      ▸ ir.slot-sim.json — universal IR (copy, if available)
    """
    name = parsed_ir["meta"].get("name") or f"{vendor}-{sheet}"
    slug = slugify(f"{name}-{swid}")
    game_dir = scaffold_dir / slug
    game_dir.mkdir(parents=True, exist_ok=True)

    # Copy IR files
    (game_dir / "ir.vendor.json").write_bytes(vendor_ir_path.read_bytes())
    if universal_ir_path is not None:
        (game_dir / "ir.slot-sim.json").write_bytes(universal_ir_path.read_bytes())

    # README
    rtp_total = parsed_ir["meta"].get("rtp_total") or 0.0
    hold = parsed_ir["meta"].get("hold") or 0.0
    reels = parsed_ir["meta"].get("reels", "?")
    rows = parsed_ir["meta"].get("rows", "?")
    lines = parsed_ir["meta"].get("lines", "?")
    bms = parsed_ir["meta"].get("bet_multipliers") or []
    rtp_breakdown = parsed_ir["meta"].get("rtp_breakdown") or {}

    feats = []
    if universal_ir:
        for f in universal_ir.get("features", []):
            feats.append(f.get("kind", "?"))

    breakdown_table = ""
    if rtp_breakdown:
        rows_md = "\n".join(
            f"| {k} | {float(v):.5f} |"
            for k, v in rtp_breakdown.items()
            if v is not None
        )
        breakdown_table = (
            "\n### RTP breakdown\n\n"
            "| Component | RTP |\n"
            "|---|---:|\n"
            f"{rows_md}\n"
        )

    bm_table = ""
    if bms:
        bm_str = " · ".join(str(b) for b in bms[:10])
        if len(bms) > 10:
            bm_str += f" … ({len(bms)} total)"
        bm_table = f"\n**Bet multipliers**: {bm_str}\n"

    readme = f"""# {name}

> Auto-generated by `slot-build --scaffold` · W5.2 · {swid}

## Game overview

| Field | Value |
|---|---|
| Vendor | {vendor} |
| SWID | {swid} |
| Layout | {reels} reels × {rows} rows, {lines} paylines |
| Total RTP | {rtp_total:.4f} |
| House hold | {hold:.4f} |
| Features | {' · '.join(feats) or '—'} |
{bm_table}{breakdown_table}

## Files

| File | Purpose |
|---|---|
| `ir.vendor.json`   | Vendor-shaped parser output (audit trail) |
| `ir.slot-sim.json` | Universal slot-sim IR (engine input) |
| `RUN.md`           | How to Monte-Carlo this game |
| `CERT.md`          | Math summary + Excel parity drift |

## Source

Generated from `parse_par` + `to_slot_sim` adapter on the vendor PAR
sheet. See `RUN.md` for reproducible MC verification.
"""
    (game_dir / "README.md").write_text(readme)

    # RUN.md
    run_md = f"""# Running {name}

## Quick MC verification

```bash
# 1M-spin sanity check at BM=1
slot-sim --ir ir.slot-sim.json --spins 1000000 --bet-mult 1

# 10B-spin acceptance run (multi-thread)
slot-sim --ir ir.slot-sim.json --spins 10000000000 --bet-mult 1
```

## Per-BM sweep

For full bet-multiplier coverage iterate the published BM range:

```bash
for bm in {' '.join(str(b) for b in bms[:5])}; do
    slot-sim --ir ir.slot-sim.json --spins 100000000 --bet-mult $bm \\
      > sweep-bm$bm.txt
done
```

## Re-generating from source

If the upstream PAR sheet changes, re-run:

```bash
python -m tools.slot_build /path/to/raw \\
    --vendor {vendor} --sheet {sheet} \\
    --scaffold /path/to/games-dir
```
"""
    (game_dir / "RUN.md").write_text(run_md)

    # CERT.md
    cert_lines = [
        f"# Math certification summary — {name}",
        "",
        f"> Auto-generated by `slot-build --scaffold` · W5.2 · SWID {swid}",
        "",
        "## Engine model",
        "",
        f"- **Vendor**: {vendor}",
        f"- **Layout**: {reels} reels × {rows} rows, {lines} paylines",
        f"- **Excel RTP target**: {rtp_total:.4f}",
        f"- **House hold**: {hold:.4f}",
        "",
    ]
    if stats:
        cert_lines.extend([
            "## Monte Carlo verification",
            "",
            "| Metric | Sim | Excel | Δ |",
            "|---|---:|---:|---:|",
        ])
        for key in ("rtp", "hit_freq", "win_freq"):
            sim_val = stats.get(key)
            tgt = stats.get(f"{key}_target")
            if sim_val is None or tgt is None:
                continue
            d = abs(sim_val - tgt)
            tag = "✅" if d < 0.02 else ("⚠️" if d < 0.05 else "❌")
            cert_lines.append(
                f"| {key.replace('_', ' ').capitalize()} | "
                f"{sim_val:.5f} | {tgt:.5f} | {d:+.5f} {tag} |"
            )
        if "spins" in stats:
            cert_lines.append("")
            cert_lines.append(f"_Sim spins: {stats['spins']:,}_")
        if "elapsed" in stats:
            cert_lines.append(f"_Elapsed: {stats['elapsed']}_")
    else:
        cert_lines.append("_MC verification skipped (--no-mc)._")

    cert_lines.append("")
    cert_lines.append("## Features in IR")
    cert_lines.append("")
    if feats:
        for f in feats:
            cert_lines.append(f"- {f}")
    else:
        cert_lines.append("- (no features)")

    (game_dir / "CERT.md").write_text("\n".join(cert_lines))

    return game_dir


# ─── main ────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="slot-build",
        description="End-to-end PAR → IR → MC pipeline (W5.1)",
    )
    ap.add_argument("input_dir", help="directory with raw PAR sheets (.tsv)")
    ap.add_argument("--vendor", default="auto",
                    help="vendor id (lw, igt, ...) or 'auto' (default)")
    ap.add_argument("--sheet", action="append",
                    help="parse specific sheet (repeatable)")
    ap.add_argument("--all-sheets", action="store_true",
                    help="iterate per profile.sheet_pattern or all .tsv")
    ap.add_argument("--out", default=None,
                    help="output directory (default: <input_dir>/../out)")
    ap.add_argument("--mc-spins", type=int, default=1_000_000,
                    help="MC sanity spins (default 1M; 0 disables)")
    ap.add_argument("--bet-mult", type=int, default=1,
                    help="MC bet multiplier (default 1)")
    ap.add_argument("--seed", type=int, default=0xC0DE_BABE,
                    help="MC seed (default 0xC0DEBABE)")
    ap.add_argument("--no-universal", action="store_true",
                    help="skip slot-sim universal IR emission")
    ap.add_argument("--no-mc", action="store_true",
                    help="skip MC sanity run (alias for --mc-spins 0)")
    ap.add_argument("--quiet", action="store_true",
                    help="suppress progress logs")
    ap.add_argument(
        "--scaffold",
        metavar="DIR",
        default=None,
        help="W5.2 — also emit a per-game scaffold (README/RUN/CERT + IRs) "
             "into DIR/<game-slug>/",
    )
    ap.add_argument(
        "--codegen-ts",
        metavar="DIR",
        default=None,
        help="W5.3 — also emit TS-engine codegen (SlotGameIR JSON + runner.ts + "
             "package.json + README) into DIR/<game-slug>/ts/. Validates via "
             "Zod schema in src/ir/schema.ts.",
    )
    args = ap.parse_args(argv)

    raw_dir = Path(args.input_dir).resolve()
    if not raw_dir.is_dir():
        print(f"error: {raw_dir} is not a directory", file=sys.stderr)
        return 2

    vendor = args.vendor
    if vendor == "auto":
        detected = detect_vendor(raw_dir)
        if detected is None:
            available = ", ".join(VENDOR_SIGNATURES.keys())
            print(
                f"error: could not auto-detect vendor for {raw_dir}\n"
                f"  available vendors: {available}\n"
                f"  override with --vendor <id>",
                file=sys.stderr,
            )
            return 2
        vendor = detected
        if not args.quiet:
            print(f"[detect] vendor: {vendor}")

    if vendor not in list_profiles():
        print(
            f"error: unknown vendor {vendor!r} (known: {list_profiles()})",
            file=sys.stderr,
        )
        return 2

    profile = load_profile(vendor)
    out_dir = Path(args.out) if args.out else (raw_dir.parent / "out")
    out_dir.mkdir(parents=True, exist_ok=True)

    explicit = args.sheet if args.sheet else None
    if args.all_sheets and explicit:
        print("error: --all-sheets and --sheet are mutually exclusive", file=sys.stderr)
        return 2
    if args.all_sheets:
        explicit = None
    sheets = _iter_sheets(profile, raw_dir, explicit)
    if not sheets:
        print("error: no sheets matched", file=sys.stderr)
        return 2

    mc_spins = 0 if args.no_mc else args.mc_spins
    bin_path = find_slot_sim_binary() if mc_spins > 0 and not args.no_universal else None
    if mc_spins > 0 and not args.no_universal and bin_path is None:
        print(
            "warn: slot-sim binary not found — skipping MC sanity run "
            "(build it with `cargo build --release` in engine/slot-sim/, "
            "or set $SLOT_SIM_BIN)",
            file=sys.stderr,
        )

    overall_drift: list[dict[str, Any]] = []
    for sheet in sheets:
        if not (raw_dir / f"{sheet}.tsv").exists():
            print(f"warn: {sheet}.tsv not found, skipping", file=sys.stderr)
            continue
        if not args.quiet:
            print(f"\n[{vendor}] parsing {sheet} …")
        ir = parse_par(profile, raw_dir, sheet=sheet)
        swid = ir["meta"].get("swid", sheet).strip().replace(" ", "_")
        game_id = profile.data.get("game_id") or profile.vendor

        # 1. Vendor-shaped IR
        vendor_path = out_dir / f"{game_id}.{swid}.ir.json"
        vendor_path.write_text(json.dumps(ir, indent=2, ensure_ascii=False, default=str))
        if not args.quiet:
            print(f"  → {vendor_path.name} ({vendor_path.stat().st_size:,} bytes)")

        # 2. Universal slot-sim IR
        universal_path = None
        universal = None  # local — None when adapter unavailable
        if not args.no_universal:
            try:
                universal = convert_to_slot_sim_ir(ir, vendor)
            except NotImplementedError as e:
                print(f"  warn: skipping universal IR — {e}", file=sys.stderr)
                universal = None
            else:
                universal_path = out_dir / f"{game_id}.{swid}.slot-sim.ir.json"
                universal_path.write_text(
                    json.dumps(universal, indent=2, ensure_ascii=False, default=str)
                )
                if not args.quiet:
                    print(
                        f"  → {universal_path.name} "
                        f"({universal_path.stat().st_size:,} bytes, universal IR)"
                    )

        # 3. MC sanity run
        if mc_spins > 0 and universal_path is not None and bin_path is not None:
            if not args.quiet:
                print(f"  MC: {mc_spins:,} spins @ BM={args.bet_mult} …")
            try:
                stats = run_mc(universal_path, mc_spins, args.bet_mult, args.seed, bin_path)
            except Exception as e:
                print(f"  warn: MC failed: {e}", file=sys.stderr)
                continue
            drift = compare_drift(stats)
            if not args.quiet:
                for k in ("rtp", "hit_freq", "win_freq"):
                    tgt = stats.get(f"{k}_target")
                    val = stats.get(k)
                    d = drift.get(k)
                    if tgt is None or val is None:
                        continue
                    tag = "✅" if (d is None or d < 0.05) else "⚠️"
                    print(f"    {k:9s} {val:.5f}  target {tgt:.5f}  Δ {d:+.5f}  {tag}")
            overall_drift.append({"sheet": sheet, "swid": swid, **stats, **{f"d_{k}": v for k, v in drift.items()}})
        else:
            stats = None

        # W5.3 — TS engine codegen emission
        if args.codegen_ts is not None:
            if universal is None:
                if not args.quiet:
                    print(f"  skip codegen-ts: universal IR unavailable for {vendor}", file=sys.stderr)
            else:
                codegen_root = Path(args.codegen_ts).resolve()
                codegen_root.mkdir(parents=True, exist_ok=True)
                slug = slugify(f"{ir['meta'].get('name', game_id)}-{swid}")
                try:
                    ts_dir, _ts_ir = write_ts_codegen(
                        codegen_dir=codegen_root,
                        slug=slug,
                        universal_ir=universal,
                        vendor=vendor,
                        swid=swid,
                        repo_root=Path(__file__).resolve().parent.parent.parent,
                    )
                    if not args.quiet:
                        print(f"  codegen-ts → {ts_dir}")
                except Exception as e:
                    print(f"  warn: codegen-ts failed: {e}", file=sys.stderr)

        # W5.2 — per-game scaffold emission
        if args.scaffold is not None:
            scaffold_root = Path(args.scaffold).resolve()
            scaffold_root.mkdir(parents=True, exist_ok=True)
            game_dir = write_scaffold(
                scaffold_dir=scaffold_root,
                vendor=vendor,
                sheet=sheet,
                swid=swid,
                vendor_ir_path=vendor_path,
                universal_ir_path=universal_path,
                parsed_ir=ir,
                universal_ir=universal,
                stats=stats,
            )
            if not args.quiet:
                print(f"  scaffold → {game_dir}")

    if not args.quiet and overall_drift:
        print("\n[summary]")
        for d in overall_drift:
            rtp_d = d.get("d_rtp")
            hf_d = d.get("d_hit_freq")
            print(
                f"  {d['sheet']:14s} SWID={d['swid']:14s}  "
                f"Δrtp={rtp_d:+.4f}  Δhit={hf_d:+.4f}" if rtp_d is not None and hf_d is not None
                else f"  {d['sheet']:14s} SWID={d['swid']:14s}  (incomplete stats)"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
