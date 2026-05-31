"""SLOT-MATH unified CLI test gate."""
from __future__ import annotations

import pytest

from tools.slot_math_cli import build_parser, main


def test_build_parser_has_all_subcommands():
    parser = build_parser()
    actions = {a.dest for a in parser._actions if hasattr(a, "dest")}
    assert "cmd" in actions


def test_par_subcommand_parses_add_variant():
    parser = build_parser()
    args = parser.parse_args(
        ["par", "add", "crimson-tiger", "--variant", "a=path/a.xlsx", "--variant", "b=path/b.xlsx"]
    )
    assert args.cmd == "par"
    assert args.par_action == "add"
    assert args.game == "crimson-tiger"
    assert args.variant == ["a=path/a.xlsx", "b=path/b.xlsx"]


def test_par_subcommand_parses_list():
    parser = build_parser()
    args = parser.parse_args(["par", "list"])
    assert args.par_action == "list"


def test_ir_build_parses():
    parser = build_parser()
    args = parser.parse_args(["ir", "build", "g", "v"])
    assert args.cmd == "ir"
    assert args.ir_action == "build"
    assert args.game == "g"
    assert args.variant == "v"


def test_mc_run_default_tier():
    parser = build_parser()
    args = parser.parse_args(["mc", "run", "g", "v"])
    assert args.tier == "T1"


def test_mc_run_custom_tier():
    parser = build_parser()
    args = parser.parse_args(["mc", "run", "g", "v", "--tier", "T3"])
    assert args.tier == "T3"


def test_deploy_parses_optional_skin():
    parser = build_parser()
    args = parser.parse_args(["deploy", "g", "v", "--skin", "/path/to/skin"])
    assert args.cmd == "deploy"
    assert args.skin == "/path/to/skin"


def test_critique_parses_par_path():
    parser = build_parser()
    args = parser.parse_args(["critique", "/some/par.yaml"])
    assert args.cmd == "critique"
    assert args.par_path == "/some/par.yaml"


def test_main_with_no_args_returns_2(capsys):
    with pytest.raises(SystemExit) as exc_info:
        main([])
    assert exc_info.value.code == 2


def test_critique_with_missing_file_returns_2(capsys):
    code = main(["critique", "/nonexistent/par.yaml"])
    assert code == 2
