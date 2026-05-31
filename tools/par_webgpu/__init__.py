"""SLOT-MATH Faza 6.4 — WebGPU MC acceleration shim.

In production: browser-side WebGPU compute shader runs 100B MC in <1 min
on a modern GPU (10× faster than CPU wasm), keeping MC compute on the
client without server load.

In this Python shim: generates the WGSL compute shader source + JS
bridge code that the studio web playable embeds. Studio-side runtime
loads it via wgpu.requestAdapter() → Pixi shell shows live RTP convergence
graph during MC run.

Server impact: zero. Client compute = free for operator.
"""
from tools.par_webgpu.shader_gen import (
    WebGpuMcConfig,
    generate_wgsl_shader,
    generate_js_bridge,
)

__all__ = [
    "WebGpuMcConfig",
    "generate_wgsl_shader",
    "generate_js_bridge",
]
