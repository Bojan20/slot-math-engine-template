"""P5.9 — Studio E2E Playwright codegen.

Emits a self-contained Playwright test suite that smoke-tests a
Studio scaffold produced by W5.4 (`write_studio_codegen`).
Generated artifacts:

  * ``playwright.config.ts``  — chromium, retries=0, baseURL via env
  * ``package.json``          — playwright + tsx dev deps
  * ``tsconfig.json``         — strict mode, ES2022 target
  * ``tests/<slug>.spec.ts``  — page-load, spin-button, RTP-tick smoke
  * ``README.md``             — `npx playwright test` quickstart

The codegen is pure-Python (no npm or browser deps needed for the
generator itself). A separate CI job runs `npx playwright install` +
`npx playwright test` to exercise the suite for real.

Public API: ``write_studio_e2e(out_dir, slug, studio_url)``.
"""
from tools.studio_e2e.emitter import (
    E2EArtifacts,
    write_studio_e2e,
)

__all__ = [
    "E2EArtifacts",
    "write_studio_e2e",
]
