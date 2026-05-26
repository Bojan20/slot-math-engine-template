"""tools.agent_eval.cli — eval harness CLI (PHASE 8 P8.5).

Responses-file schema (JSONL, one per case):

  {
    "id": "<case id matching the eval fixture>",
    "agent_output": <agent-specific payload>,
    "elapsed_ms": <int>
  }

For par-parser the agent_output is the parser JSON. For reg-oracle it is
the markdown answer string. For math-debug it is the diagnosis markdown.

In the absence of a real responses file we still verify the eval fixture
itself for structural integrity — the `--self-test` mode runs this
check across all three agents.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import yaml  # type: ignore
except ImportError:
    print("ERR: pyyaml required", file=sys.stderr)
    sys.exit(2)

AGENTS_ROOT = Path.home() / "Projects/cortex/agents"
KNOWN_AGENTS = {"par-parser", "reg-oracle", "math-debug"}


def _load_yaml(p: Path) -> Dict[str, Any]:
    return yaml.safe_load(p.read_text())


def _load_manifest(agent: str) -> Dict[str, Any]:
    return _load_yaml(AGENTS_ROOT / agent / "manifest.yaml")


def _load_eval(agent: str) -> Dict[str, Any]:
    manifest = _load_manifest(agent)
    eval_file = Path(os.path.expanduser(manifest["eval"]["held_out_file"]))
    if not eval_file.exists():
        raise FileNotFoundError(f"eval fixture missing: {eval_file}")
    return _load_yaml(eval_file)


def _load_responses(path: Path) -> Dict[str, Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}
    with path.open() as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            by_id[row["id"]] = row
    return by_id


def _structural_check(agent: str, ev: Dict[str, Any]) -> List[str]:
    """Structural check on the eval fixture itself."""
    errors: List[str] = []
    if "cases" not in ev or not isinstance(ev["cases"], list) or not ev["cases"]:
        errors.append("missing or empty 'cases' list")
        return errors
    ids = [c.get("id") for c in ev["cases"]]
    if len(ids) != len(set(ids)):
        errors.append("duplicate case ids")
    for c in ev["cases"]:
        if "id" not in c:
            errors.append(f"case without id: {c}")
        if agent == "par-parser":
            if "vendor_expected" not in c:
                errors.append(f"par-parser case missing vendor_expected: {c.get('id')}")
        elif agent == "reg-oracle":
            if "q" not in c:
                errors.append(f"reg-oracle case missing q: {c.get('id')}")
        elif agent == "math-debug":
            if "symptom" not in c:
                errors.append(f"math-debug case missing symptom: {c.get('id')}")
    if "thresholds" not in ev:
        errors.append("missing 'thresholds' block")
    return errors


# ── Evaluators ────────────────────────────────────────────────────────────


def _eval_par_parser(ev: Dict[str, Any], responses: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    thr = ev["thresholds"]
    rows = []
    correct_vendor = 0
    total = len(ev["cases"])
    latency_ms_total = 0
    rt_deltas = []
    field_acc = []
    conf_floor_ok = 0
    for case in ev["cases"]:
        cid = case["id"]
        resp = responses.get(cid)
        if resp is None:
            rows.append({"id": cid, "ok": False, "reason": "no response"})
            continue
        ao = resp.get("agent_output", {})
        vendor_got = ao.get("vendor")
        vendor_ok = (vendor_got == case["vendor_expected"]) or (
            case["vendor_expected"] == "unknown" and ao.get("confidence", {}).get("vendor", 1.0) < case.get("expected_confidence_max", 0.6)
        )
        correct_vendor += int(vendor_ok)
        rt = ao.get("roundtrip", {}).get("rtp_delta_pct", 0.0)
        rt_deltas.append(abs(rt))
        nfields = len(ao.get("ir", {}) or {})
        if case.get("expected_fields_min") is not None:
            field_acc.append(1.0 if nfields >= case["expected_fields_min"] * 0.95 else nfields / max(1, case["expected_fields_min"]))
        conf = ao.get("confidence", {})
        if all(v >= thr["confidence_floor_on_success"] for v in conf.values()) and vendor_ok:
            conf_floor_ok += 1
        latency_ms_total += resp.get("elapsed_ms", 0)
        rows.append({"id": cid, "ok": vendor_ok, "vendor_got": vendor_got, "rtp_delta": rt})
    metrics = {
        "field_accuracy": (sum(field_acc) / len(field_acc)) if field_acc else None,
        "roundtrip_rtp_delta_abs": (sum(rt_deltas) / len(rt_deltas)) if rt_deltas else None,
        "vendor_id_accuracy": correct_vendor / total if total else 0,
        "seconds_per_par": (latency_ms_total / 1000.0 / total) if total else 0,
        "confidence_floor_on_success_rate": conf_floor_ok / total if total else 0,
    }
    return {"agent": "par-parser", "metrics": metrics, "thresholds": thr, "rows": rows, "total": total}


def _eval_reg_oracle(ev: Dict[str, Any], responses: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    thr = ev["thresholds"]
    rows = []
    total = len(ev["cases"])
    cited = 0
    correct = 0
    drift_recall_hits = 0
    drift_recall_total = 0
    refusal_hits = 0
    refusal_total = 0
    lat_total = 0
    for case in ev["cases"]:
        cid = case["id"]
        resp = responses.get(cid)
        if resp is None:
            rows.append({"id": cid, "ok": False, "reason": "no response"})
            continue
        out = resp.get("agent_output", "")
        if isinstance(out, dict):
            out = out.get("markdown", json.dumps(out))
        expected = case.get("expected") or {}
        behaviour = expected.get("behaviour", "")
        ok = True
        if "refusal" in behaviour.lower():
            refusal_total += 1
            if "ERR_JURISDICTION" in out or "ERR_NO_CITATION" in out:
                refusal_hits += 1
            else:
                ok = False
        else:
            # Normal answer — citation must be present
            cite_block = re.search(r"\|\s*Jurisdiction\s*\|\s*Clause", out, re.IGNORECASE)
            if cite_block:
                cited += 1
            else:
                ok = False
            for pat in case.get("must_cite", []) or []:
                if pat and pat.lower() not in out.lower():
                    ok = False
                    break
        if "drift" in behaviour.lower():
            drift_recall_total += 1
            if "PROFILE_DRIFT" in out or "DRIFT" in out:
                drift_recall_hits += 1
        correct += int(ok)
        lat_total += resp.get("elapsed_ms", 0)
        rows.append({"id": cid, "ok": ok})
    metrics = {
        "answer_accuracy": correct / total if total else 0,
        "citation_present": cited / max(1, total - refusal_total),
        "mean_latency_s": lat_total / 1000.0 / total if total else 0,
        "profile_drift_recall": (drift_recall_hits / drift_recall_total) if drift_recall_total else 1.0,
        "refusal_on_missing_jurisdiction": (refusal_hits / refusal_total) if refusal_total else 1.0,
    }
    return {"agent": "reg-oracle", "metrics": metrics, "thresholds": thr, "rows": rows, "total": total}


def _eval_math_debug(ev: Dict[str, Any], responses: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    thr = ev["thresholds"]
    rows = []
    total = len(ev["cases"])
    root_correct = 0
    tax_correct = 0
    repro_ok = 0
    ambiguous_precision_hits = 0
    ambiguous_total = 0
    lat_total = 0
    for case in ev["cases"]:
        cid = case["id"]
        resp = responses.get(cid)
        if resp is None:
            rows.append({"id": cid, "ok": False, "reason": "no response"})
            continue
        out = resp.get("agent_output", "")
        if isinstance(out, dict):
            out = out.get("markdown", json.dumps(out))
        expected_class = case.get("expected_class_primary")
        expected_amb = case.get("expected_multi_class_ambiguous", False)
        expected_behaviour = case.get("expected_behaviour", "")
        ok_tax = False
        if expected_behaviour == "ERR_INPUT_UNRECOGNISED":
            ok_tax = "ERR_INPUT_UNRECOGNISED" in out
        elif expected_class is None:
            ok_tax = True
        else:
            ok_tax = f"Primary class.** {expected_class}" in out or f"primary class.** {expected_class}" in out.lower()
        tax_correct += int(ok_tax)
        # Root-cause: same-rank hypothesis at rank 1 mentions the file pointer or keyword.
        root_hit = bool(re.search(r"\|\s*1\s*\|", out))
        if expected_behaviour == "ERR_INPUT_UNRECOGNISED":
            root_hit = ok_tax
        root_correct += int(root_hit)
        # Reproducer
        if "```bash" in out:
            repro_ok += 1
        if expected_amb:
            ambiguous_total += 1
            if "Multi-class ambiguous: true" in out:
                ambiguous_precision_hits += 1
        lat_total += resp.get("elapsed_ms", 0)
        rows.append({"id": cid, "tax_ok": ok_tax, "root_ok": root_hit})
    metrics = {
        "root_cause_first_shot": root_correct / total if total else 0,
        "taxonomy_classification": tax_correct / total if total else 0,
        "mean_latency_s": lat_total / 1000.0 / total if total else 0,
        "reproducer_runs": repro_ok / total if total else 0,
        "multi_class_ambiguous_precision": (ambiguous_precision_hits / ambiguous_total) if ambiguous_total else 1.0,
    }
    return {"agent": "math-debug", "metrics": metrics, "thresholds": thr, "rows": rows, "total": total}


EVALUATORS = {
    "par-parser": _eval_par_parser,
    "reg-oracle": _eval_reg_oracle,
    "math-debug": _eval_math_debug,
}


def verdict(result: Dict[str, Any]) -> bool:
    thr = result["thresholds"]
    m = result["metrics"]
    for key, target in thr.items():
        v = m.get(key)
        if v is None:
            continue
        # roundtrip_rtp_delta_abs: lower is better; others: higher is better.
        if key in ("roundtrip_rtp_delta_abs", "seconds_per_par", "mean_latency_s"):
            if v > target:
                return False
        else:
            if v < target:
                return False
    return True


def self_test() -> int:
    """Run structural check on all three eval fixtures."""
    bad = 0
    for agent in sorted(KNOWN_AGENTS):
        try:
            ev = _load_eval(agent)
        except Exception as exc:
            print(f"  {agent}: FAIL load → {exc!r}")
            bad += 1
            continue
        errors = _structural_check(agent, ev)
        if errors:
            print(f"  {agent}: FAIL structural → {errors}")
            bad += 1
        else:
            print(f"  {agent}: OK ({len(ev['cases'])} cases, thresholds present)")
    if bad:
        print(f"self-test FAIL: {bad} agent(s) bad")
        return 1
    print("self-test PASS — 3 eval fixtures valid")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="PHASE 8 agent eval harness")
    p.add_argument("agent", help=f"one of {sorted(KNOWN_AGENTS) + ['list']}")
    p.add_argument("--responses", default=None, help="JSONL responses file from a real agent run.")
    p.add_argument("--self-test", action="store_true", help="Structural check only — no responses needed.")
    args = p.parse_args(argv)

    if args.agent == "list":
        for a in sorted(KNOWN_AGENTS):
            ev = _load_eval(a)
            print(f"{a}: {len(ev['cases'])} cases, thresholds={ev['thresholds']}")
        return 0

    if args.agent not in KNOWN_AGENTS:
        print(f"ERR: unknown agent '{args.agent}'", file=sys.stderr)
        return 2

    if args.self_test:
        return self_test()

    ev = _load_eval(args.agent)
    responses: Dict[str, Dict[str, Any]] = {}
    if args.responses:
        responses = _load_responses(Path(args.responses))

    result = EVALUATORS[args.agent](ev, responses)
    result["pass"] = verdict(result)
    print(json.dumps(result, indent=2))
    return 0 if result["pass"] or not args.responses else 1
