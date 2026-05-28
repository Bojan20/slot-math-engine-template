"""Tests for `tools.par_extract_ultimate` — synthetic XLSX only, no vendor data.

Covers all 17 attribute kinds the extractor pulls out, on a workbook built
from scratch in-test. If any of these regress, the extraction guarantees on
real vendor PAR sheets are broken too.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pytest
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import (
    Alignment,
    Border,
    Color,
    Font,
    PatternFill,
    Side,
)
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.workbook.defined_name import DefinedName

from tools.par_extract_ultimate import extract_workbook


# ─── Synthetic XLSX builder ───────────────────────────────────────────────


def _build_synthetic_xlsx(target: Path) -> None:
    """Build a workbook touching every feature the extractor inspects."""
    wb = Workbook()

    # ── Sheet 1: simple data + formula + style + comment + hyperlink ──
    s1 = wb.active
    s1.title = "Paytable"

    s1["A1"] = "Symbol"
    s1["B1"] = "x5"
    s1["C1"] = "x4"

    s1["A2"] = "Wild"
    s1["B2"] = 100
    s1["C2"] = 50

    s1["A3"] = "H1"
    s1["B3"] = 25
    s1["C3"] = 10

    # Formula cell.
    s1["D1"] = "Total"
    s1["D2"] = "=B2+C2"  # 150
    s1["D3"] = "=B3+C3"  # 35

    # Number format.
    s1["B2"].number_format = "#,##0.00"

    # Font styling.
    s1["A1"].font = Font(name="Calibri", size=12, bold=True, italic=False, color="FF0000FF")

    # Fill.
    s1["B2"].fill = PatternFill(patternType="solid", fgColor="FFFFFF00")

    # Border.
    s1["C3"].border = Border(
        left=Side(style="thin", color=Color(rgb="FF000000")),
        right=Side(style="medium"),
    )

    # Alignment.
    s1["A2"].alignment = Alignment(horizontal="center", vertical="top", wrap_text=True, text_rotation=45)

    # Comment.
    s1["B3"].comment = Comment("Per-line bet multiplier", "math-team")

    # Hyperlink.
    s1["D1"].hyperlink = "https://example.invalid/doc"

    # Merged range.
    s1.merge_cells("E1:F2")

    # Freeze pane.
    s1.freeze_panes = "B2"

    # Column width / row height.
    s1.column_dimensions["A"].width = 20.5
    s1.row_dimensions[1].height = 30.0

    # Hidden column.
    s1.column_dimensions["F"].hidden = True

    # Excel table.
    tbl = Table(displayName="PayTbl", ref="A1:D3")
    tbl.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
    s1.add_table(tbl)

    # Autofilter.
    s1.auto_filter.ref = "A1:D3"

    # Data validation — dropdown on column E.
    dv = DataValidation(type="list", formula1='"Wild,Scatter,H1,H2"', allow_blank=True)
    dv.add("E3:E5")
    s1.add_data_validation(dv)

    # Conditional formatting.
    s1.conditional_formatting.add(
        "B2:C3",
        CellIsRule(operator="greaterThan", formula=["50"], stopIfTrue=False),
    )

    # ── Sheet 2: reel strip (numeric stress + datetime cell) ──
    s2 = wb.create_sheet("ReelStrip")
    s2["A1"] = "Reel 1"
    s2["A2"] = "H1"
    s2["A3"] = "H2"
    s2["A4"] = "Wild"
    s2["A5"] = 42.5
    s2["A6"] = datetime(2025, 1, 15, 12, 30, 0)

    # Sheet print area + titles.
    s2.print_area = "A1:A10"

    # ── Sheet 3: completely hidden helper sheet ──
    s3 = wb.create_sheet("_Hidden")
    s3.sheet_state = "hidden"
    s3["A1"] = "internal"

    # ── Workbook-level: defined name ──
    dn = DefinedName("PayoutCol", attr_text="Paytable!$B$1:$B$3")
    wb.defined_names["PayoutCol"] = dn

    # Custom doc props — openpyxl wraps these differently; safest path is
    # standard properties.
    wb.properties.creator = "synthetic-test"
    wb.properties.title = "Test Workbook"
    wb.properties.keywords = "par,test,synthetic"

    wb.save(target)


# ─── Tests ────────────────────────────────────────────────────────────────


@pytest.fixture
def synth_workbook(tmp_path: Path) -> Path:
    target = tmp_path / "synth.xlsx"
    _build_synthetic_xlsx(target)
    return target


def test_extract_emits_all_top_level_files(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    stats = extract_workbook(synth_workbook, out)

    assert (out / "workbook.json").exists()
    assert (out / "extraction_summary.json").exists()
    # Per-sheet dirs.
    for name in ("Paytable", "ReelStrip", "_Hidden"):
        d = out / "sheets" / name
        assert d.is_dir(), f"missing sheet dir: {d}"
        for fn in ("cells.json", "layout.json", "styles.json", "tables.json", "charts.json", "validation.json", "conditional_formats.json"):
            assert (d / fn).exists(), f"missing {fn} for {name}"

    assert stats.sheet_count == 3
    assert stats.total_cells > 0


def test_cells_capture_value_and_formula(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)

    with open(out / "sheets" / "Paytable" / "cells.json") as f:
        cells = json.load(f)["cells"]

    # D2 has formula =B2+C2. openpyxl-built workbooks lack cached values
    # (Excel never evaluated them), so for synthetic test we only check the
    # formula is captured. On real vendor PAR sheets, `computed` will be set
    # because Excel writes both formula and cached value.
    assert "D2" in cells
    d2 = cells["D2"]
    assert d2["formula"] == "=B2+C2"

    # A1 is text header — pure value cell.
    assert cells["A1"]["value"] == "Symbol"


def test_cells_capture_comment_and_hyperlink(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)

    cells = json.load(open(out / "sheets" / "Paytable" / "cells.json"))["cells"]
    assert cells["B3"]["comment"]["text"] == "Per-line bet multiplier"
    assert cells["B3"]["comment"]["author"] == "math-team"
    assert cells["D1"]["hyperlink"]["target"] == "https://example.invalid/doc"


def test_cells_capture_number_format(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)
    cells = json.load(open(out / "sheets" / "Paytable" / "cells.json"))["cells"]
    assert cells["B2"]["number_format"] == "#,##0.00"


def test_styles_dedup_and_back_reference(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)
    styles_doc = json.load(open(out / "sheets" / "Paytable" / "styles.json"))

    # A1 should have the red bold font captured in its style entry.
    a1_style_id = styles_doc["cell_to_style"]["A1"]
    style = styles_doc["styles"][str(a1_style_id)]
    assert style["f"]["bold"] is True
    assert style["f"]["color"] == "FF0000FF"
    # B2 should have a yellow fill.
    b2_style_id = styles_doc["cell_to_style"]["B2"]
    b2_style = styles_doc["styles"][str(b2_style_id)]
    assert b2_style["fl"]["fgColor"] == "FFFFFF00"


def test_layout_captures_merged_frozen_hidden_widths(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)
    layout = json.load(open(out / "sheets" / "Paytable" / "layout.json"))

    assert "E1:F2" in layout["merged_ranges"]
    assert layout["frozen_panes"] == "B2"
    assert "F" in layout["hidden_cols"]
    assert layout["col_widths"]["A"] == 20.5
    assert layout["row_heights"]["1"] == 30.0 or layout["row_heights"][1] == 30.0


def test_tables_and_autofilter(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)
    doc = json.load(open(out / "sheets" / "Paytable" / "tables.json"))
    assert any(t["name"] == "PayTbl" for t in doc["tables"])
    assert doc["autofilter"]["ref"] == "A1:D3"


def test_validation_captures_dropdown(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)
    doc = json.load(open(out / "sheets" / "Paytable" / "validation.json"))
    assert len(doc["validations"]) == 1
    v = doc["validations"][0]
    assert v["type"] == "list"
    assert "Wild" in v["formula1"]


def test_conditional_formats_captured(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)
    doc = json.load(open(out / "sheets" / "Paytable" / "conditional_formats.json"))
    assert len(doc["rules"]) >= 1
    rule = doc["rules"][0]
    assert "B2:C3" in rule["range"]
    assert rule["operator"] == "greaterThan"


def test_hidden_sheet_state_captured(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)
    layout = json.load(open(out / "sheets" / "_Hidden" / "layout.json"))
    assert layout["sheet_state"] == "hidden"


def test_workbook_defined_names_and_props(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)
    meta = json.load(open(out / "workbook.json"))
    assert meta["sheet_names"] == ["Paytable", "ReelStrip", "_Hidden"]
    assert meta["properties"]["creator"] == "synthetic-test"
    assert meta["properties"]["title"] == "Test Workbook"

    names = [d["name"] for d in meta["defined_names"]]
    assert "PayoutCol" in names


def test_datetime_serialised_safely(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)
    cells = json.load(open(out / "sheets" / "ReelStrip" / "cells.json"))["cells"]
    a6 = cells["A6"]
    # Could be tagged __date__ wrapper or a plain ISO string fallback.
    if isinstance(a6["value"], dict):
        assert "__date__" in a6["value"]
    else:
        # openpyxl may pass through datetime as-is — confirm string form parses.
        assert "2025" in str(a6["value"])


def test_extraction_summary_counts_match(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    stats = extract_workbook(synth_workbook, out)
    summary = json.load(open(out / "extraction_summary.json"))
    assert summary["workbook"] == "synth.xlsx"
    assert summary["sheet_count"] == 3
    assert summary["total_cells"] == stats.total_cells
    assert summary["total_formulas"] == stats.total_formulas
    assert summary["total_formulas"] >= 2  # D2 + D3
    assert summary["total_comments"] >= 1
    assert summary["total_hyperlinks"] >= 1


def test_idempotent_overwrite_with_force(synth_workbook: Path, tmp_path: Path):
    out = tmp_path / "out"
    extract_workbook(synth_workbook, out)
    s1 = json.load(open(out / "extraction_summary.json"))
    extract_workbook(synth_workbook, out)
    s2 = json.load(open(out / "extraction_summary.json"))
    assert s1 == s2


def test_cli_smoke(synth_workbook: Path, tmp_path: Path):
    """End-to-end via `python -m tools.par_extract_ultimate`."""
    from tools.par_extract_ultimate.__main__ import main

    corpus = tmp_path / "corpus"
    rc = main([str(synth_workbook), "--game", "synth-game", "--corpus", str(corpus)])
    assert rc == 0
    expected = corpus / "synth-game" / "ultimate_extract" / "extraction_summary.json"
    assert expected.exists()
    pointer = corpus / "synth-game" / "ultimate_extract.pointer.json"
    assert pointer.exists()
    pd = json.load(open(pointer))
    assert pd["game_key"] == "synth-game"
    assert pd["source_basename"] == "synth.xlsx"
    assert len(pd["source_sha256_first_64k"]) == 64


def test_cli_rejects_existing_without_force(synth_workbook: Path, tmp_path: Path):
    from tools.par_extract_ultimate.__main__ import main

    corpus = tmp_path / "corpus"
    rc1 = main([str(synth_workbook), "--game", "g1", "--corpus", str(corpus)])
    assert rc1 == 0
    rc2 = main([str(synth_workbook), "--game", "g1", "--corpus", str(corpus)])
    assert rc2 == 3  # refuse to overwrite
    rc3 = main([str(synth_workbook), "--game", "g1", "--corpus", str(corpus), "--force"])
    assert rc3 == 0
