"""Localization implementation.

Catalog format (JSON):
    {
        "locale": "sr",
        "translations": {
            "Cash Eruption": "Erupcija Novca",
            "Free Spins": "Besplatni Spinovi"
        }
    }

Walks the following IR fields for localizable strings:
    meta.name
    meta.description
    meta.notes (per-element)
    features[*].kind          (controlled vocab — usually NOT translated)
    features[*].label         (optional, designer-set)
    paytable[*].label         (optional designer-set)
    symbols[*].name           (display label)
"""
from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class TranslationCatalog:
    locale: str
    translations: dict[str, str] = field(default_factory=dict)
    missing: list[str] = field(default_factory=list)

    def lookup(self, english: str) -> str:
        """Return the translation, falling back to original + recording
        the miss for operator visibility."""
        if english in self.translations:
            return self.translations[english]
        if english not in self.missing:
            self.missing.append(english)
        return english


def load_catalog(path: Path) -> TranslationCatalog:
    """Load a JSON catalog. Missing file → empty catalog at `locale`."""
    p = Path(path)
    if not p.is_file():
        return TranslationCatalog(locale=p.stem)
    data = json.loads(p.read_text())
    return TranslationCatalog(
        locale=data.get("locale", p.stem),
        translations=data.get("translations") or {},
    )


def save_catalog(catalog: TranslationCatalog, path: Path) -> Path:
    """Persist a catalog (with current `missing` list as comments)."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "locale": catalog.locale,
        "translations": catalog.translations,
        # `missing` is included for operator-tool round-trip ergonomics;
        # ignored on load.
        "missing": catalog.missing,
    }
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return p


def list_localizable_strings(ir: dict[str, Any]) -> list[str]:
    """Walk known string fields and return distinct English strings."""
    out: set[str] = set()
    meta = ir.get("meta") or {}
    for key in ("name", "description"):
        v = meta.get(key)
        if isinstance(v, str) and v.strip():
            out.add(v)
    for note in meta.get("notes") or []:
        if isinstance(note, str) and note.strip():
            out.add(note)
    for feat in ir.get("features") or []:
        if isinstance(feat, dict):
            label = feat.get("label")
            if isinstance(label, str) and label.strip():
                out.add(label)
    for sym in ir.get("symbols") or []:
        if isinstance(sym, dict):
            name = sym.get("name")
            if isinstance(name, str) and name.strip():
                out.add(name)
    for entry in ir.get("paytable") or []:
        if isinstance(entry, dict):
            label = entry.get("label")
            if isinstance(label, str) and label.strip():
                out.add(label)
    return sorted(out)


def localize_ir(ir: dict[str, Any],
                catalog: TranslationCatalog) -> dict[str, Any]:
    """Return a copy of `ir` with localizable strings translated."""
    out = copy.deepcopy(ir)
    meta = out.setdefault("meta", {})
    for key in ("name", "description"):
        v = meta.get(key)
        if isinstance(v, str) and v.strip():
            meta[key] = catalog.lookup(v)
    notes = meta.get("notes")
    if isinstance(notes, list):
        meta["notes"] = [
            catalog.lookup(n) if isinstance(n, str) and n.strip() else n
            for n in notes
        ]
    for feat in out.get("features") or []:
        if isinstance(feat, dict):
            label = feat.get("label")
            if isinstance(label, str) and label.strip():
                feat["label"] = catalog.lookup(label)
    for sym in out.get("symbols") or []:
        if isinstance(sym, dict):
            name = sym.get("name")
            if isinstance(name, str) and name.strip():
                sym["name"] = catalog.lookup(name)
    for entry in out.get("paytable") or []:
        if isinstance(entry, dict):
            label = entry.get("label")
            if isinstance(label, str) and label.strip():
                entry["label"] = catalog.lookup(label)
    meta.setdefault("locale", catalog.locale)
    return out


def main(argv: list[str] | None = None) -> int:
    import argparse
    import sys

    ap = argparse.ArgumentParser(
        prog="slot-localize",
        description="W23 — localize an IR JSON using a translation catalog.",
    )
    ap.add_argument("ir", help="path to IR JSON")
    ap.add_argument("--catalog", required=False,
                    help="JSON catalog ({locale, translations})")
    ap.add_argument("--locale", default="en",
                    help="locale tag (used when --catalog missing)")
    ap.add_argument("--out", help="output IR path (default: <ir>.<locale>.json)")
    ap.add_argument("--list", action="store_true",
                    help="just print every localizable string + exit")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    ir_path = Path(args.ir)
    if not ir_path.is_file():
        print(f"error: {ir_path} not found", file=sys.stderr)
        return 2
    ir = json.loads(ir_path.read_text())

    if args.list:
        for s in list_localizable_strings(ir):
            print(s)
        return 0

    if args.catalog:
        catalog = load_catalog(Path(args.catalog))
    else:
        catalog = TranslationCatalog(locale=args.locale)

    localized = localize_ir(ir, catalog)
    out_path = (Path(args.out)
                 if args.out
                 else ir_path.with_suffix(f".{catalog.locale}.json"))
    out_path.write_text(json.dumps(localized, indent=2, ensure_ascii=False))
    if not args.quiet:
        print(f"wrote {out_path}")
        if catalog.missing:
            print(f"missing translations ({len(catalog.missing)}):")
            for m in catalog.missing:
                print(f"  - {m}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
