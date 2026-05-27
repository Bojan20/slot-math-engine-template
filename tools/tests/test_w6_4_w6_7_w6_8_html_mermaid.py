"""W6.4 Studio HTML + W6.7 Mermaid visualize + W6.8 Catalog HTML tests."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl import (
    parse_spec, render_mermaid, render_mermaid_fenced,
    render_studio_html, build_catalog, render_catalog_html,
)


SPEC_CLASSIC = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_classic_5x3.yaml"
).read_text(encoding="utf-8")

SPEC_MEGAWAYS = (
    ROOT / "tools" / "math_dsl" / "specs" / "example_megaways.yaml"
).read_text(encoding="utf-8")


# ─── W6.7 — Mermaid visualizer ─────────────────────────────────────────


class TestMermaid(unittest.TestCase):
    def test_renders_topology_node(self):
        spec = parse_spec(SPEC_CLASSIC)
        m = render_mermaid(spec)
        self.assertIn("flowchart TD", m)
        self.assertIn("5x3 lines", m)

    def test_renders_megaways_variable_rows(self):
        spec = parse_spec(SPEC_MEGAWAYS)
        m = render_mermaid(spec)
        self.assertIn("variable", m)
        self.assertIn("ways", m)

    def test_includes_features(self):
        spec = parse_spec(SPEC_CLASSIC)
        m = render_mermaid(spec)
        self.assertIn("free_spins", m)

    def test_includes_constraints_node(self):
        spec = parse_spec(SPEC_CLASSIC)
        m = render_mermaid(spec)
        self.assertIn("target_rtp", m)
        self.assertIn("volatility", m)

    def test_includes_jurisdictions(self):
        spec = parse_spec(SPEC_CLASSIC)
        m = render_mermaid(spec)
        self.assertIn("UKGC", m)
        self.assertIn("MGA", m)

    def test_includes_progressive_feature_label(self):
        spec = parse_spec(SPEC_MEGAWAYS)
        m = render_mermaid(spec)
        self.assertIn("wap-megaways-grand", m)

    def test_class_styling_present(self):
        spec = parse_spec(SPEC_CLASSIC)
        m = render_mermaid(spec)
        self.assertIn("classDef", m)

    def test_fenced_wrapper(self):
        spec = parse_spec(SPEC_CLASSIC)
        f = render_mermaid_fenced(spec)
        self.assertTrue(f.startswith("```mermaid"))
        self.assertTrue(f.endswith("```\n"))


# ─── W6.4 — Studio HTML ───────────────────────────────────────────────


class TestStudioHtml(unittest.TestCase):
    def test_studio_html_includes_editor(self):
        spec = parse_spec(SPEC_CLASSIC)
        h = render_studio_html(spec)
        self.assertIn("<textarea", h)
        self.assertIn("yaml-editor", h)

    def test_studio_html_includes_mermaid_cdn(self):
        spec = parse_spec(SPEC_CLASSIC)
        h = render_studio_html(spec)
        self.assertIn("mermaid", h.lower())

    def test_studio_html_includes_initial_yaml(self):
        spec = parse_spec(SPEC_CLASSIC)
        h = render_studio_html(spec)
        # The textarea body should mention the game name
        self.assertIn("Crimson Tiger", h)

    def test_studio_html_includes_initial_mermaid(self):
        spec = parse_spec(SPEC_CLASSIC)
        h = render_studio_html(spec)
        self.assertIn("flowchart", h)

    def test_studio_html_without_spec(self):
        h = render_studio_html(None)
        self.assertIn("Paste", h)

    def test_studio_html_escapes_yaml_safely(self):
        """A YAML containing backticks must not break the embedded JS."""
        spec = parse_spec(SPEC_CLASSIC)
        spec.meta["description"] = "Contains ` backtick and ${ injection"
        h = render_studio_html(spec)
        # The literal sequence "${" should NOT survive into the JS context
        self.assertNotIn("`Contains `", h)  # escaped


# ─── W6.8 — Catalog HTML ──────────────────────────────────────────────


class TestCatalogHtml(unittest.TestCase):
    def test_catalog_html_includes_all_specs(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        h = render_catalog_html(cat)
        self.assertIn("Crimson Tiger", h)
        self.assertIn("Lion Megaways", h)
        self.assertIn("Coral Cluster", h)
        self.assertIn("Cascade Quest", h)

    def test_catalog_html_includes_filter_dropdowns(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        h = render_catalog_html(cat)
        self.assertIn('id="f-topology"', h)
        self.assertIn('id="f-volatility"', h)
        self.assertIn('id="f-jurisdiction"', h)
        self.assertIn('id="f-feature"', h)

    def test_catalog_html_topology_options(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        h = render_catalog_html(cat)
        self.assertIn("rectangular", h)
        self.assertIn("variable_rows", h)
        self.assertIn("cluster_grid", h)

    def test_catalog_html_includes_data_json(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        h = render_catalog_html(cat)
        # DATA = […] should contain JSON of specs
        self.assertIn("const DATA = ", h)
        self.assertIn('"target_rtp"', h)

    def test_catalog_html_has_render_js(self):
        cat = build_catalog(ROOT / "tools" / "math_dsl" / "specs")
        h = render_catalog_html(cat)
        self.assertIn("function render()", h)
        self.assertIn("addEventListener", h)


if __name__ == "__main__":
    unittest.main()
