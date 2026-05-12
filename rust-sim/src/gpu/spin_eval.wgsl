// Faza 9.8b — Spin evaluator (Phase-A skeleton).
//
// Thread layout: 1 thread = 1 spin. Workgroup size 64 (8x8).
// Per-thread RNG: Philox4x32 keyed by (base_seed, slice_index, gid).
// Per-thread output: f32 win in bet multiples, written to `wins[gid]`.
//
// The evaluator math (paylines, scatter detection, wild substitution,
// feature triggers, cascades) lands in Phase-B. Phase-A keeps the
// pipeline shape so the wgpu runner can be wired and validated.

struct Constants {
    base_seed: u32,
    slice_index_lo: u32,
    slice_index_hi: u32,
    start_spin_lo: u32,
    start_spin_hi: u32,
    span_lo: u32,
    span_hi: u32,
    total_bet_mc: u32,
    reels: u32,
    rows: u32,
}

@group(0) @binding(0) var<uniform> consts: Constants;
@group(0) @binding(1) var<storage, read_write> wins: array<f32>;

// Philox4x32 — counter-based RNG. Two rounds of mul-hi/xor, key schedule
// every round. Tuned for GPU: zero state shared between threads.
fn philox_round(ctr: vec4<u32>, key: vec2<u32>) -> vec4<u32> {
    let mul_a: u32 = 0xD2511F53u;
    let mul_b: u32 = 0xCD9E8D57u;

    let lo_a: u32 = ctr.x * mul_a;
    let hi_a: u32 = u32(u64(ctr.x) * u64(mul_a) >> 32u);

    let lo_b: u32 = ctr.z * mul_b;
    let hi_b: u32 = u32(u64(ctr.z) * u64(mul_b) >> 32u);

    return vec4<u32>(
        hi_b ^ ctr.y ^ key.x,
        lo_b,
        hi_a ^ ctr.w ^ key.y,
        lo_a
    );
}

// Bump the Philox key by the Weyl constants between rounds. Standard
// Philox4x32-10 schedule = 10 rounds; we expose 4 for the skeleton.
fn philox_key_bump(key: vec2<u32>) -> vec2<u32> {
    return vec2<u32>(key.x + 0x9E3779B9u, key.y + 0xBB67AE85u);
}

fn philox4x32(seed_lo: u32, seed_hi: u32, ctr: u64) -> vec4<u32> {
    var k = vec2<u32>(seed_lo, seed_hi);
    var c = vec4<u32>(
        u32(ctr & 0xFFFFFFFFu),
        u32((ctr >> 32u) & 0xFFFFFFFFu),
        0u, 0u
    );
    for (var round: u32 = 0u; round < 4u; round = round + 1u) {
        c = philox_round(c, k);
        k = philox_key_bump(k);
    }
    return c;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let g = gid.x;
    let span = (u64(consts.span_hi) << 32u) | u64(consts.span_lo);
    if (u64(g) >= span) {
        return;
    }

    // Derive per-spin RNG state. Mix slice_index, start_spin and the
    // global thread id so two slices of the same run never collide
    // and the same `(slice_index, g)` reproduces the same spin.
    let slice_lo = consts.slice_index_lo;
    let start_lo = consts.start_spin_lo;
    let key_lo = consts.base_seed ^ slice_lo ^ start_lo;
    let key_hi = consts.slice_index_hi ^ consts.start_spin_hi;

    let rnd = philox4x32(key_lo, key_hi, u64(g));

    // TODO(faza-9.8b): plug evaluator. For Phase-A we just emit a
    // deterministic placeholder so the pipeline can be tested
    // end-to-end. The value is a fraction in [0, 1) keyed on `rnd.x`
    // which gives us a uniform distribution to validate the dispatch
    // path. CPU side will reduce these into AtomicStats counters.
    wins[g] = f32(rnd.x) / f32(0xFFFFFFFFu);
}
