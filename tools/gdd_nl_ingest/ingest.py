"""W6.x — GDD NL ingestion: prompt → GDD → archetype pipeline cert.

Pipeline stages:
  1. Read NL prompt (txt/md file or string).
  2. Detect archetype + structural fields via deterministic regex
     (extends `tools.math_dsl.prompt.parse_prompt` with explicit
     archetype detection and per-archetype default per-reel symbol
     distributions / paytables).
  3. Emit a W5.8-compatible archetype GDD YAML.
  4. Drive the W5.8 archetype pipeline → emits IR + MC verdict + cert
     ZIP.
  5. Return an `IngestResult` summarizing what was detected, what
     defaults were filled in, and the archetype pipeline acceptance.

Ambiguity handling
==================
If the prompt cannot be parsed into a unique archetype, the ingester
returns `IngestResult.verdict == "AMBIGUOUS"` with a list of clarifying
questions in `ambiguous_questions`. No GDD is emitted in that case.

Examples
========
Prompt:
    "5x3 lines slot, 20 paylines, RTP 95, medium volatility, free spins"
Result: archetype=lines, RTP=0.95, 20 paylines, free_spins feature.

Prompt:
    "megaways, RTP 96, high volatility, free spins, name 'Storm'"
Result: archetype=megaways, RTP=0.96, FS feature, name=Storm.

No external LLM is called. The parser is pure regex / keyword extraction.
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from tools.greenfield_demo.archetype_pipeline import (
    DEFAULT_OUT_DIR, DEMO_SPINS, ENGINE_BIN, run_pipeline,
)


REPO = Path(__file__).resolve().parents[2]


# ─── Archetype detection ─────────────────────────────────────────────────


_ARCHETYPE_PATTERNS: list[tuple[str, list[str]]] = [
    # Order matters — first match wins.  Megaways/cascade/H&W take
    # priority over generic "ways" to avoid ambiguity.
    ("megaways", [r"\bmegaways\b", r"\bvariable[\s-]rows\b"]),
    ("cascade",  [r"\bcascade\b", r"\btumble\b", r"\bavalanche\b"]),
    ("hold_and_win", [r"\bhold[\s-]and[\s-]win\b", r"\bhold\s*&\s*win\b"]),
    ("ways",     [r"\b\d{2,4}\s*ways\b", r"\bways\b"]),
    ("lines",    [r"\blines?\b", r"\bpaylines?\b"]),
]


_RTP_RE = re.compile(
    r"\bRTP[: ]+\s*(\d{2,3}(?:\.\d+)?|0?\.\d+)\s*%?",
    re.I,
)
_TOPO_RECT_RE = re.compile(r"\b(\d+)\s*[x×]\s*(\d+)\b", re.I)
_PAYLINES_RE = re.compile(
    r"\b(\d+)\s+(?:paylines?|lines?)\b",
    re.I,
)
_NAME_RE = re.compile(
    r"\b(?:game\s+)?name[: ]+['\"]([^'\"]+)['\"]",
    re.I,
)
_VENDOR_RE = re.compile(
    r"\bvendor[: ]+([A-Za-z][A-Za-z0-9_-]+)",
    re.I,
)
_VOL_RE = re.compile(
    r"\b(low|medium|high|ultra)\s+volatility|"
    r"\bvolatility\s+(low|medium|high|ultra)\b",
    re.I,
)
_HIT_FREQ_RE = re.compile(
    r"\bhit[-_ ]?freq(?:uency)?\s*[:= ]?\s*(\d+(?:\.\d+)?)\s*%?",
    re.I,
)
_MAX_WIN_RE = re.compile(
    r"\bmax[\s-]?win\s*[:= ]?\s*([\d_,]+(?:\.\d+)?)\s*x?",
    re.I,
)


def _percentify(s: str) -> float:
    s = s.strip().rstrip("%")
    v = float(s)
    return v / 100.0 if v > 1.5 else v


def detect_archetype(prompt: str) -> tuple[str | None, list[str]]:
    """Return (archetype, all_matches).  None when no match."""
    matches: list[str] = []
    for arch, pats in _ARCHETYPE_PATTERNS:
        for p in pats:
            if re.search(p, prompt, re.I):
                matches.append(arch)
                break
    # Hold&Win can co-exist with lines (it sits on top of lines).
    # If both lines + hold_and_win match, prefer hold_and_win (carries
    # extra feature).
    if "hold_and_win" in matches and "lines" in matches:
        # H&W needs lines base — keep H&W as the primary archetype.
        return "hold_and_win", matches
    # Cascade needs ways base — keep cascade as primary.
    if "cascade" in matches and "ways" in matches:
        return "cascade", matches
    if matches:
        return matches[0], matches
    return None, matches


# ─── Default symbol / reels / paytable packs per archetype ──────────────


def _default_symbols(archetype: str) -> list[dict[str, Any]]:
    """Default 8-10 symbol pack for the given archetype."""
    if archetype == "hold_and_win":
        return [
            {"id": "wild", "kind": "wild", "substitutes": "*"},
            {"id": "scatter", "kind": "scatter"},
            {"id": "coin", "kind": "hp"},
            {"id": "hp_safe", "kind": "hp"},
            {"id": "hp_gem", "kind": "hp"},
            {"id": "lp_a", "kind": "lp"},
            {"id": "lp_k", "kind": "lp"},
            {"id": "lp_q", "kind": "lp"},
        ]
    if archetype in ("ways", "cascade"):
        return [
            {"id": "wild", "kind": "wild", "substitutes": "*"},
            {"id": "scatter", "kind": "scatter"},
            {"id": "hp_a", "kind": "hp"},
            {"id": "hp_b", "kind": "hp"},
            {"id": "hp_c", "kind": "hp"},
            {"id": "lp_a", "kind": "lp"},
            {"id": "lp_k", "kind": "lp"},
            {"id": "lp_q", "kind": "lp"},
        ]
    if archetype == "megaways":
        return [
            {"id": "wild", "kind": "wild", "substitutes": "*"},
            {"id": "scatter", "kind": "scatter"},
            {"id": "hp_a", "kind": "hp"},
            {"id": "hp_b", "kind": "hp"},
            {"id": "hp_c", "kind": "hp"},
            {"id": "hp_d", "kind": "hp"},
            {"id": "lp_a", "kind": "lp"},
            {"id": "lp_k", "kind": "lp"},
            {"id": "lp_q", "kind": "lp"},
            {"id": "lp_j", "kind": "lp"},
        ]
    # lines default
    return [
        {"id": "wild", "kind": "wild", "substitutes": "*"},
        {"id": "scatter", "kind": "scatter"},
        {"id": "hp_a", "kind": "hp"},
        {"id": "hp_b", "kind": "hp"},
        {"id": "hp_c", "kind": "hp"},
        {"id": "hp_d", "kind": "hp"},
        {"id": "lp_a", "kind": "lp"},
        {"id": "lp_k", "kind": "lp"},
        {"id": "lp_q", "kind": "lp"},
        {"id": "lp_j", "kind": "lp"},
    ]


def _default_reel_distribution(archetype: str, syms: list[dict]) -> list[dict]:
    """Build a 5-reel per-symbol distribution (sums to 1 per reel).

    Same distribution per reel by default; designer can edit later.
    """
    n_syms = len(syms)
    # wild / scatter scarcer; HPs medium; LPs dense.
    base: dict[str, float] = {}
    n_hp = sum(1 for s in syms if s["kind"] == "hp")
    n_lp = sum(1 for s in syms if s["kind"] == "lp")
    for s in syms:
        if s["kind"] == "wild":
            base[s["id"]] = 0.03
        elif s["kind"] == "scatter":
            base[s["id"]] = 0.025
        elif s["kind"] == "hp":
            base[s["id"]] = (0.30 / n_hp) if n_hp else 0.08
        elif s["kind"] == "lp":
            base[s["id"]] = (0.645 / n_lp) if n_lp else 0.17
        else:
            base[s["id"]] = 0.05
    # Normalize (drift from rounding).
    tot = sum(base.values())
    base = {k: v / tot for k, v in base.items()}
    # Same distribution across all reels keeps the GDD compact.
    return [dict(base) for _ in range(5)]


def _default_paytable(syms: list[dict]) -> dict[str, dict[int, float]]:
    """Pay ladders for HP/LP symbols.  Designer can override."""
    out: dict[str, dict[int, float]] = {}
    hp_pays = {3: 0.20, 4: 0.80, 5: 3.0}
    lp_pays = {3: 0.05, 4: 0.20, 5: 0.60}
    for s in syms:
        if s["kind"] == "hp":
            out[s["id"]] = dict(hp_pays)
        elif s["kind"] == "lp":
            out[s["id"]] = dict(lp_pays)
    return out


# ─── Prompt → archetype GDD spec ────────────────────────────────────────


@dataclass
class IngestError(Exception):
    message: str
    questions: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        return self.message


@dataclass
class IngestResult:
    """Outcome of one prompt → GDD → pipeline run."""
    prompt: str
    archetype: str | None
    detected_fields: dict[str, Any]
    gdd_yaml: str | None
    gdd_path: Path | None
    cert_zip: Path | None
    mc_rtp: float | None
    mc_hit_freq: float | None
    target_rtp: float | None
    pipeline_acceptance: dict | None
    verdict: str  # "PASS" | "FAIL" | "AMBIGUOUS" | "ERROR"
    ambiguous_questions: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def _yaml_dump(d: Any, indent: int = 0) -> str:
    """Minimal YAML serializer compatible with the archetype-pipeline
    parser.  Handles dicts / lists / scalars; flow-style for inner
    leaf dicts to keep distribution lines compact.
    """
    pad = "  " * indent
    if isinstance(d, dict):
        # Heuristic: a dict whose values are all numbers → flow style.
        if d and all(isinstance(v, (int, float)) for v in d.values()):
            inner = ", ".join(f"{k}: {v}" for k, v in d.items())
            return "{" + inner + "}"
        lines = []
        for k, v in d.items():
            if isinstance(v, (dict, list)) and v:
                if isinstance(v, dict) and all(
                    isinstance(vv, (int, float)) for vv in v.values()
                ):
                    lines.append(f"{pad}{k}: " + _yaml_dump(v, indent + 1))
                elif isinstance(v, list) and v and all(
                    isinstance(it, dict) and all(
                        isinstance(vv, (int, float)) for vv in it.values()
                    ) for it in v
                ):
                    # list of flat-number dicts
                    lines.append(f"{pad}{k}:")
                    for it in v:
                        lines.append(f"{pad}  - " + _yaml_dump(it, indent + 2))
                else:
                    lines.append(f"{pad}{k}:")
                    lines.append(_yaml_dump(v, indent + 1))
            else:
                lines.append(f"{pad}{k}: {_format_scalar(v)}")
        return "\n".join(lines)
    if isinstance(d, list):
        lines = []
        for it in d:
            if isinstance(it, dict):
                first = True
                for k, v in it.items():
                    prefix = f"{pad}- " if first else f"{pad}  "
                    first = False
                    if isinstance(v, (dict, list)) and v and not all(
                        isinstance(vv, (int, float))
                        for vv in (v.values() if isinstance(v, dict) else [])
                    ):
                        lines.append(f"{prefix}{k}:")
                        lines.append(_yaml_dump(v, indent + 2))
                    else:
                        lines.append(f"{prefix}{k}: {_format_scalar(v)}")
            else:
                lines.append(f"{pad}- {_format_scalar(it)}")
        return "\n".join(lines)
    return _format_scalar(d)


def _format_scalar(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, str):
        if " " in v or ":" in v or v.lower() in ("null", "true", "false"):
            return f'"{v}"'
        return v
    return str(v)


def prompt_to_gdd(prompt: str) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    """Convert a NL prompt → archetype GDD spec dict.

    Returns (gdd_dict, detected_fields_log, ambiguity_questions).
    `gdd_dict` is None if the prompt is too ambiguous to construct.
    """
    text = prompt.strip()
    archetype, _matches = detect_archetype(text)
    detected: dict[str, Any] = {"archetype": archetype}
    questions: list[str] = []

    if archetype is None:
        questions.append(
            "Which mechanic? Choose one: lines, ways (243), megaways, "
            "hold_and_win, cascade."
        )
        return {}, detected, questions

    # Topology
    reels, rows = 5, 3
    m = _TOPO_RECT_RE.search(text)
    if m and archetype != "megaways":
        reels, rows = int(m.group(1)), int(m.group(2))
    detected["topology"] = f"{reels}x{rows}"

    # Paylines (lines + hold_and_win archetypes)
    paylines = 20
    pl_m = _PAYLINES_RE.search(text)
    if pl_m:
        paylines = int(pl_m.group(1))
        detected["paylines"] = paylines

    # RTP
    target_rtp = 0.95
    rtp_m = _RTP_RE.search(text)
    if rtp_m:
        target_rtp = _percentify(rtp_m.group(1))
        detected["target_rtp"] = round(target_rtp, 4)

    # Volatility
    volatility = "medium"
    vol_m = _VOL_RE.search(text)
    if vol_m:
        volatility = (vol_m.group(1) or vol_m.group(2)).lower()
        detected["volatility_class"] = volatility

    # Hit-freq target (designer override)
    hit_freq_target = {
        "lines": 0.25, "ways": 0.40, "megaways": 0.30,
        "hold_and_win": 0.25, "cascade": 0.45,
    }[archetype]
    hf_m = _HIT_FREQ_RE.search(text)
    if hf_m:
        hit_freq_target = _percentify(hf_m.group(1))
        detected["hit_freq_target"] = round(hit_freq_target, 3)

    # Max win
    max_win_x = 5000
    mw_m = _MAX_WIN_RE.search(text)
    if mw_m:
        max_win_x = float(mw_m.group(1).replace(",", "").replace("_", ""))
        detected["max_win_x"] = max_win_x

    # Name + vendor
    name_m = _NAME_RE.search(text)
    name = name_m.group(1) if name_m else f"NL Demo {archetype.title()}"
    vendor_m = _VENDOR_RE.search(text)
    vendor = vendor_m.group(1) if vendor_m else "studio-internal"
    detected["name"] = name
    detected["vendor"] = vendor

    # SWID generation — synthetic 9999-XXX block.  Use a hash of the
    # prompt for deterministic SWID across runs.
    swid_suffix = abs(hash(prompt.lower())) % 1000
    swid = f"200-9999-{swid_suffix:03d}"
    detected["swid"] = swid

    # Build the GDD dict.
    syms = _default_symbols(archetype)
    per_reel = _default_reel_distribution(archetype, syms)
    paytable = _default_paytable(syms)

    gdd: dict[str, Any] = {
        "schema_version": "1.0.0",
        "archetype": archetype,
        "meta": {
            "name": name, "vendor": vendor, "swid": swid,
            "author": "gdd-nl-ingest@studio",
            "description": (
                f"Generated by W6.x GDD NL ingestion from prompt: "
                f"{prompt[:80]!r}"
            ),
        },
        "topology": (
            {"kind": "rectangular", "reels": reels, "rows": rows}
            if archetype != "megaways"
            else {
                "kind": "megaways", "reels": 5,
                "rows_min": 2, "rows_max": 6,
                "rows_weights": [[10, 18, 32, 25, 15]] * 5,
            }
        ),
        "symbols": syms,
        "features": [
            {"kind": "free_spins", "trigger_count_min": 3,
             "initial_spins": 10 if archetype != "lines" else 8}
        ],
        "paylines": paylines if archetype in ("lines", "hold_and_win") else None,
        "reels": {
            "reel_length": 50 if archetype == "megaways" else 30,
            "per_reel_distribution": per_reel,
        },
        "paytable": paytable,
        "constraints": {
            "target_rtp": target_rtp,
            "rtp_tolerance": 0.01,
            "volatility_class": volatility,
            "hit_freq_target": hit_freq_target,
            "max_win_x": int(max_win_x),
            "jurisdictions": ["UKGC", "MGA", "ADM"],
        },
    }

    # Add H&W bonus feature when archetype = hold_and_win.
    if archetype == "hold_and_win":
        gdd["features"].append({
            "kind": "hold_and_win",
            "trigger_prob": 0.008,
            "avg_pay_per_trigger": 12.5,
        })

    # Drop None values from gdd top-level.
    gdd = {k: v for k, v in gdd.items() if v is not None}
    return gdd, detected, questions


def _gdd_to_yaml(gdd: dict[str, Any]) -> str:
    """Serialize the GDD dict to a YAML string the archetype pipeline
    can parse.  Hand-rolled to maintain compatibility with the
    archetype pipeline's lightweight YAML subset parser.
    """
    out: list[str] = []
    out.append(f"# GDD generated by W6.x GDD NL ingestion.")
    out.append(f"# Source prompt deterministically transformed via")
    out.append(f"# tools.gdd_nl_ingest.ingest.prompt_to_gdd().")
    out.append("")
    out.append(f'schema_version: "{gdd["schema_version"]}"')
    out.append(f'archetype: {gdd["archetype"]}')
    out.append("")
    out.append("meta:")
    for k, v in gdd["meta"].items():
        out.append(f"  {k}: {_format_scalar(v)}")
    out.append("")
    topo = gdd["topology"]
    out.append("topology:")
    for k, v in topo.items():
        if isinstance(v, list):
            out.append(f"  {k}:")
            for it in v:
                out.append(f"    - [" + ", ".join(str(x) for x in it) + "]")
        else:
            out.append(f"  {k}: {_format_scalar(v)}")
    out.append("")
    out.append("symbols:")
    for s in gdd["symbols"]:
        # First key starts with "- ", subsequent with "  ".
        keys = list(s.items())
        out.append(f"  - {keys[0][0]}: {_format_scalar(keys[0][1])}")
        for k, v in keys[1:]:
            out.append(f"    {k}: {_format_scalar(v)}")
    out.append("")
    out.append("features:")
    for f in gdd["features"]:
        keys = list(f.items())
        out.append(f"  - {keys[0][0]}: {_format_scalar(keys[0][1])}")
        for k, v in keys[1:]:
            out.append(f"    {k}: {_format_scalar(v)}")
    out.append("")
    if "paylines" in gdd:
        out.append(f"paylines: {gdd['paylines']}")
        out.append("")
    out.append("reels:")
    out.append(f"  reel_length: {gdd['reels']['reel_length']}")
    out.append("  per_reel_distribution:")
    for reel in gdd["reels"]["per_reel_distribution"]:
        inner = ", ".join(f"{k}: {round(v, 6)}" for k, v in reel.items())
        out.append("    - {" + inner + "}")
    out.append("")
    out.append("paytable:")
    for sym, ladder in gdd["paytable"].items():
        inner = ", ".join(f"{k}: {v}" for k, v in sorted(ladder.items()))
        out.append(f"  {sym}: {{{inner}}}")
    out.append("")
    out.append("constraints:")
    for k, v in gdd["constraints"].items():
        if isinstance(v, list):
            out.append(f"  {k}: [" + ", ".join(_format_scalar(it) for it in v) + "]")
        else:
            out.append(f"  {k}: {_format_scalar(v)}")
    return "\n".join(out) + "\n"


def ingest_prompt(
    prompt: str,
    *,
    out_dir: Path = DEFAULT_OUT_DIR,
    spins: int = DEMO_SPINS,
    engine_bin: Path = ENGINE_BIN,
    write_gdd: bool = True,
) -> IngestResult:
    """End-to-end W6.x ingestion: NL prompt → GDD → archetype pipeline.

    Returns an `IngestResult` carrying every artefact path + verdict.
    """
    out_dir = Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    gdd_dict, detected, questions = prompt_to_gdd(prompt)
    if not gdd_dict:
        return IngestResult(
            prompt=prompt,
            archetype=None,
            detected_fields=detected,
            gdd_yaml=None,
            gdd_path=None,
            cert_zip=None,
            mc_rtp=None,
            mc_hit_freq=None,
            target_rtp=None,
            pipeline_acceptance=None,
            verdict="AMBIGUOUS",
            ambiguous_questions=questions,
            notes=[f"Detected fields: {detected}"],
        )

    yaml_str = _gdd_to_yaml(gdd_dict)
    swid = gdd_dict["meta"]["swid"]
    arch = gdd_dict["archetype"]

    gdd_path: Path | None = None
    if write_gdd:
        gdd_path = out_dir / f"nl-ingest-{arch}-{swid}.gdd"
        gdd_path.write_text(yaml_str, encoding="utf-8")

    if gdd_path is None:
        raise IngestError("write_gdd=False not supported (pipeline needs file)")

    try:
        art = run_pipeline(
            gdd_path,
            out_dir=out_dir,
            spins=spins,
            engine_bin=engine_bin,
        )
    except Exception as exc:  # noqa: BLE001
        return IngestResult(
            prompt=prompt,
            archetype=arch,
            detected_fields=detected,
            gdd_yaml=yaml_str,
            gdd_path=gdd_path,
            cert_zip=None,
            mc_rtp=None,
            mc_hit_freq=None,
            target_rtp=gdd_dict["constraints"]["target_rtp"],
            pipeline_acceptance=None,
            verdict="ERROR",
            notes=[f"pipeline failed: {exc}"],
        )

    return IngestResult(
        prompt=prompt,
        archetype=arch,
        detected_fields=detected,
        gdd_yaml=yaml_str,
        gdd_path=gdd_path,
        cert_zip=art.cert_zip_path,
        mc_rtp=art.mc_verdict["mc_rtp"],
        mc_hit_freq=art.mc_verdict["mc_hit_freq"],
        target_rtp=art.mc_verdict["target_rtp"],
        pipeline_acceptance=art.acceptance,
        verdict=art.acceptance["verdict"],
        notes=[f"Detected: {detected}"],
    )
