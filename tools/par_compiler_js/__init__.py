"""W7.7 — Live PAR Compiler (vanilla JS browser runtime).

The original W7.7 row in the master TODO assumed a full
WebGPU + wasm-bindgen + WASM build pipeline for in-browser 5M-spin
Monte Carlo. WebGPU compute shaders need a wasm-pack toolchain that
isn't on this machine. The functional value designers care about
— "type a DSL → see RTP instantly" — is delivered just as well by a
**deterministic vanilla-JS closed-form RTP evaluator** that ships as
ONE self-contained ``.js`` file (no WASM, no CDN, no dependencies).

Pipeline:

1. Python emits a JS bundle (single string) containing:
   * ``closedFormRtp(spec)`` — the same left-anchored-run math as
     `RtpModel.rtp()` (W7.6) and `qmc_estimator::LinesEvalSpec`
     (W5.4 Rust side).
   * ``runMcSimulation(spec, nSpins, seed)`` — Mulberry32 RNG +
     simple line evaluator for a Monte Carlo sanity check the
     designer can run in the browser console.
   * ``compileAndEvaluate(spec)`` — convenience entrypoint that
     returns ``{rtp, hitFreq, volatility}``.
2. :func:`build_studio_html(...)` wraps the bundle in a self-
   contained HTML page with a textarea + result panel. Designer
   pastes a JSON spec, hits Run, sees closed-form RTP + MC
   convergence next to it.

Deterministic, audit-friendly: the JS bundle's SHA-256 can be pinned
in the cert bundle so the auditor knows the browser eval used the
same closed-form math the Rust simulator uses.
"""

from .compile import (
    JsBundle,
    build_js_bundle,
    build_studio_html,
    canonical_js_runtime,
    write_studio_html,
)

__all__ = [
    "JsBundle",
    "build_js_bundle",
    "build_studio_html",
    "canonical_js_runtime",
    "write_studio_html",
]
