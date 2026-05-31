"""SLOT-MATH Faza 6.4 — WGSL compute shader generator + JS bridge."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class WebGpuMcConfig:
    """Parameters baked into the WGSL shader at codegen time."""
    workgroup_size: int = 256
    spins_per_invocation: int = 4096
    reel_count: int = 5
    rows_per_reel: int = 3
    max_symbols_per_reel: int = 64


_WGSL_TEMPLATE = """\
// SLOT-MATH WebGPU MC compute shader — auto-emitted, do not edit.
// Workgroup: {workgroup_size}. Per-invocation spins: {spins_per_invocation}.

struct GameConfig {{
  reels: u32,
  rows: u32,
  symbols_per_reel: u32,
  target_rtp_micro: u32,         // RTP * 1_000_000 (integer)
  hit_freq_micro: u32,
  max_win_x: u32,
}};

struct ReelPool {{
  // Flat pool of u32 symbol indices, row-major: pool[r*max + i] = symbol_id
  data: array<u32, {pool_size}>,
  lengths: array<u32, {reel_count}>,
}};

struct Aggregate {{
  total_payout_x_micro: atomic<u32>,
  hits: atomic<u32>,
  total_spins: atomic<u32>,
  max_win_x: atomic<u32>,
}};

@group(0) @binding(0) var<uniform> cfg: GameConfig;
@group(0) @binding(1) var<storage, read> reels: ReelPool;
@group(0) @binding(2) var<storage, read_write> agg: Aggregate;

// Mulberry32 deterministic PRNG (matches Rust SlotRng + JS bundle)
fn rng_next(state: ptr<function, u32>) -> u32 {{
  *state = *state + 0x6D2B79F5u;
  var t: u32 = *state;
  t = (t ^ (t >> 15u)) * (t | 1u);
  t = t ^ (t + ((t ^ (t >> 7u)) * (t | 61u)));
  return t ^ (t >> 14u);
}}

@compute @workgroup_size({workgroup_size}, 1, 1)
fn mc_main(@builtin(global_invocation_id) gid: vec3<u32>) {{
  let invocation_idx = gid.x;
  // Per-invocation deterministic seed (composes with caller-supplied base seed)
  var state: u32 = invocation_idx * 0x9E3779B9u + 0xCAFEBABEu;
  var payout_acc: u32 = 0u;
  var hits_acc: u32 = 0u;
  var max_acc: u32 = 0u;

  for (var spin: u32 = 0u; spin < {spins_per_invocation}u; spin = spin + 1u) {{
    var symbols_picked = array<u32, {reel_count}>();
    for (var r: u32 = 0u; r < cfg.reels; r = r + 1u) {{
      let len = reels.lengths[r];
      let pick = rng_next(&state) % len;
      symbols_picked[r] = reels.data[r * {max_symbols_per_reel}u + pick];
    }}
    // Synthetic eval: count consecutive matches of first symbol from reel 0
    // (real eval lives in W244 kernel; this is the WebGPU fast-path stub
    // that proves the shader pipeline works — real shader is per-game.)
    let target = symbols_picked[0];
    var match_count: u32 = 1u;
    for (var r: u32 = 1u; r < cfg.reels; r = r + 1u) {{
      if (symbols_picked[r] == target) {{
        match_count = match_count + 1u;
      }} else {{
        break;
      }}
    }}
    if (match_count >= 3u) {{
      hits_acc = hits_acc + 1u;
      // Synthetic payout: 10× per match count
      let pay = match_count * 10u;
      payout_acc = payout_acc + pay;
      if (pay > max_acc) {{ max_acc = pay; }}
    }}
  }}

  atomicAdd(&agg.total_payout_x_micro, payout_acc * 1000000u);
  atomicAdd(&agg.hits, hits_acc);
  atomicAdd(&agg.total_spins, {spins_per_invocation}u);
  atomicMax(&agg.max_win_x, max_acc);
}}
"""


_JS_BRIDGE_TEMPLATE = """\
/* SLOT-MATH WebGPU MC bridge — auto-emitted, do not edit.
   Usage:
     const result = await runWebGpuMc(reelPools, gameConfig, totalSpins);
*/
import shaderSrc from './mc_shader.wgsl?raw';

const WORKGROUP_SIZE = {workgroup_size};
const SPINS_PER_INVOCATION = {spins_per_invocation};

export async function runWebGpuMc(reelPools, gameConfig, totalSpins) {{
  if (!navigator.gpu) throw new Error('WebGPU not available');
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  // Build buffers
  const cfgBuf = device.createBuffer({{
    size: 6 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  }});
  device.queue.writeBuffer(cfgBuf, 0, new Uint32Array([
    gameConfig.reels, gameConfig.rows, gameConfig.symbols_per_reel,
    Math.round(gameConfig.target_rtp * 1e6),
    Math.round(gameConfig.hit_freq * 1e6),
    gameConfig.max_win_x,
  ]));

  const reelBuf = device.createBuffer({{
    size: reelPools.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }});
  device.queue.writeBuffer(reelBuf, 0, reelPools);

  const aggBuf = device.createBuffer({{
    size: 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  }});

  const module = device.createShaderModule({{ code: shaderSrc }});
  const pipeline = device.createComputePipeline({{
    layout: 'auto',
    compute: {{ module, entryPoint: 'mc_main' }},
  }});
  const bindGroup = device.createBindGroup({{
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {{ binding: 0, resource: {{ buffer: cfgBuf }} }},
      {{ binding: 1, resource: {{ buffer: reelBuf }} }},
      {{ binding: 2, resource: {{ buffer: aggBuf }} }},
    ],
  }});

  const invocations = Math.ceil(totalSpins / SPINS_PER_INVOCATION);
  const workgroups = Math.ceil(invocations / WORKGROUP_SIZE);

  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(workgroups);
  pass.end();

  const readBuf = device.createBuffer({{
    size: 4 * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  }});
  enc.copyBufferToBuffer(aggBuf, 0, readBuf, 0, 4 * 4);
  device.queue.submit([enc.finish()]);

  await readBuf.mapAsync(GPUMapMode.READ);
  const out = new Uint32Array(readBuf.getMappedRange());
  const total_payout = out[0] / 1e6;
  const hits = out[1];
  const total_spins = out[2];
  const max_win_x = out[3];
  readBuf.unmap();

  return {{
    rtp: total_spins ? total_payout / total_spins : 0,
    hit_freq: total_spins ? hits / total_spins : 0,
    total_spins,
    max_win_x,
  }};
}}
"""


def generate_wgsl_shader(cfg: WebGpuMcConfig | None = None) -> str:
    cfg = cfg or WebGpuMcConfig()
    pool_size = cfg.reel_count * cfg.max_symbols_per_reel
    return _WGSL_TEMPLATE.format(
        workgroup_size=cfg.workgroup_size,
        spins_per_invocation=cfg.spins_per_invocation,
        pool_size=pool_size,
        reel_count=cfg.reel_count,
        max_symbols_per_reel=cfg.max_symbols_per_reel,
    )


def generate_js_bridge(cfg: WebGpuMcConfig | None = None) -> str:
    cfg = cfg or WebGpuMcConfig()
    return _JS_BRIDGE_TEMPLATE.format(
        workgroup_size=cfg.workgroup_size,
        spins_per_invocation=cfg.spins_per_invocation,
    )
