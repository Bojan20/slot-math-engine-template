"""W55 — Plugin Marketplace Listing UI.

Zero-build static HTML/JS dashboard for a `FilesystemMarketplace`
registry. Renders one HTML page that:

  • Lists every published plugin handle from the registry.
  • Shows per-plugin manifest preview + body SHA-256.
  • Exposes a "verify now" button that runs a fetch() against a
    sidecar JSON written by the same tool — the UI itself doesn't
    spawn Python; the JSON precomputes the round-trip outcome so
    the dashboard can be opened offline.

Layout:

    dashboard/
      index.html        — single-file static page (no bundler)
      manifest.json     — registry snapshot used by the page
      verify.json       — precomputed round-trip results

The HTML uses only:
  • zero external CDNs (works offline)
  • no build step (no React / no bundler)
  • inline CSS + vanilla JS
"""
from tools.marketplace_ui.generator import (
    DashboardArtifacts,
    build_dashboard,
    render_index_html,
)

__all__ = [
    "DashboardArtifacts",
    "build_dashboard",
    "render_index_html",
]
