"""W6.2 — Multi-SWID PAR verification dashboard.

Renders a single self-contained HTML page that lets operators/regulators
filter, diff, and verify the cert bundles produced for every shipping
SWID. Input is the collection of ``operator-package.zip`` files emitted
by ``tools/cert_bundle_swid`` (the same artifacts the operator pipeline
already publishes).

The dashboard is offline-first (no CDN, no fetch) — the entire dataset
is embedded as inline JSON and the JS uses only the standard DOM API.
"""

from .build import (
    SwidEntry,
    build_dataset,
    render_dashboard,
    write_dashboard,
)

__all__ = [
    "SwidEntry",
    "build_dataset",
    "render_dashboard",
    "write_dashboard",
]
