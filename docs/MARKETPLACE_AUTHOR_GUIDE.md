# Marketplace Author Guide

**W209 Faza 500.0 — Marketplace Activation. Document version: v0.9 (MVP).**

This guide walks third-party authors through publishing a kernel on the slot-math-engine marketplace: writing the manifest, passing the automated test gates, earning certification badges, and getting paid.

> **W215 update**: the synthetic static-inspection sandbox shipped in v0.9 has been replaced by a **v1.0 sandbox delivered W215** (real `vm.Script` execution with hard CPU + heap kill, regex deny-list, 6 harness gates). See `docs/KERNEL_SANDBOX.md` for the architecture and security model. The static path remains available as `runStaticInspection` for cheap first-pass screening on the wizard UI.

---

## 1. Concepts

A **kernel** is a pure function `(ctx, params) → { rtp, hitFrequency }`. It encodes one slot-math mechanic (e.g. cascade-multiplier-pyramid, hold-and-win-collect). Authors publish kernels; game designers consume them via IR documents that reference a kernel by `p_id_target`.

The marketplace runs every submission through a 6-gate test battery. All-pass auto-grants the **Verified** badge. Long-tail badges (**Engineering Team Endorsed**, **Production Proven**) come later via review or live-game tracking.

Revenue split is **70 / 30** by default (author / platform). Authors with 5+ certified kernels auto-promote to Tier 2 (75/25). Contractual partners get Tier 3 (80/20).

---

## 2. Writing a kernel

```typescript
import { defineKernel, validateParams } from '@slot-math-engine/sdk';

export const cascadePyramid = defineKernel({
  name: 'cascade-pyramid',
  version: '1.0.0',
  family: 'cascade',
  paramSpec: [
    { key: 'pTrigger', type: 'number', min: 0, max: 1 },
    { key: 'multiplier', type: 'integer', min: 1, max: 100 },
  ],
  closedForm: (ctx, params) => {
    validateParams(cascadePyramid.paramSpec, params as Record<string, unknown>);
    const p = params.pTrigger as number;
    const m = params.multiplier as number;
    // Geometric falloff: RTP = p * sum(m_i * (1 - p_break)^i)
    return { rtp: p * m * 0.5, hitFrequency: p };
  },
});
```

### Rules

- **`closedForm` is required.** It's the cert paper trail — regulators reference this exact formula.
- **No `Math.random()`** — use `ctx.rng()` (seeded by the engine).
- **No `: any`** annotations and no `@ts-ignore`. Strict mode wins.
- **No reserved vendor terms** (Vendor B, Vendor A, Vendor D, Vendor B, Vendor C, Vendor H, WMS, Konami, Vendor E). The kernel must stand on its own math, not borrow vendor branding.

---

## 3. The manifest

Every submission ships with a JSON manifest. Sample:

```json
{
  "name": "cascade-pyramid",
  "version": "1.0.0",
  "author": "bojan-studio",
  "license": "MIT",
  "p_id_target": "P-CASCADE-MULT-PYRAMID-001",
  "category": "cascade",
  "description": "Cascade multiplier pyramid with geometric falloff.",
  "math_summary": "RTP = p_trigger * sum(m_i * (1-p_break)^i)",
  "vendor_specific_notes": "no vendor IP — generic mechanic",
  "certification_level": "verified",
  "dependencies": []
}
```

### Validation rules

| Field | Rule |
|---|---|
| `name` | kebab-case, 3–64 chars, `[a-z0-9][a-z0-9-]*` |
| `version` | SemVer (`X.Y.Z`) |
| `license` | `MIT` / `Apache-2.0` / `BSD-3-Clause` / `GPL-3.0` / `proprietary` |
| `p_id_target` | `^P-[A-Z0-9-]+$` |
| `category` | one of: cascade, hold-and-win, wheel, cluster, megaways, mgaps, jackpot, free-spins, bonus, misc |
| `description` | ≥ 10 chars |
| `math_summary` | ≥ 10 chars |
| `certification_level` | `verified` / `endorsed` / `production-proven` |

`validateManifest()` (exported from the SDK) does the same checks client-side so you catch errors before submit.

---

## 4. The 6-gate test battery

Every submission runs through six gates. **All must pass** to auto-grant the Verified badge.

| Gate | Pass criterion |
|---|---|
| `determinism` | same seed → identical output 100k times. Unseeded `Math.random()` fails. |
| `closed-form-vs-mc` | closed-form RTP within tolerance of Monte-Carlo. Default ±5% relative, ±0.5pp absolute. |
| `performance` | solver completes 10k spins in < 2s. |
| `boundary` | handles 0-value, max-value, edge inputs without crashing. `throw new Error("not implemented")` and TODO-only stubs fail. |
| `naming` | source contains no reserved vendor terms (see §2). |
| `ts-strict` | compiles clean with `tsc --strict --noEmit`. No `: any`, no `@ts-ignore`. |

### v0.9 disclosure

The test runner now executes kernels in a **hardened sandbox** (W215 v1.0). Source is screened against a regex deny-list (`eval`, `new Function`, `require`, dynamic `import`, `__proto__`, `Reflect`, `Proxy`, …) and then run inside a frozen `vm` context with a `vm.Script.runInContext({ timeout })` hard CPU kill and heap monitoring. The 6 harness gates are all driven by REAL invocations of your `analyze*` / `simulate*` exports. The legacy static-inspection path is still callable as `runStaticInspection` for cheap pre-screening on the wizard UI.

Verdicts include `synthetic: true` so the UI can disclose this to operators.

---

## 5. Submitting

```typescript
import { submitKernel } from '@slot-math-engine/sdk';

const code = await fs.readFile('./cascade-pyramid.ts', 'utf-8');

const result = await submitKernel(
  manifest,
  code,
  process.env.AUTHOR_TOKEN!,
  { apiUrl: 'https://marketplace.slot-math-engine.com' }
);

console.log(result.submissionId);     // sub-abcd1234
console.log(result.verdict?.all_pass); // true → Verified granted
console.log(result.autoBadges);        // ['verified']
```

Without `apiUrl` the SDK falls back to a mock verdict so you can prototype locally.

The UI exposes the same flow via the "Submit Kernel" button → 4-step wizard:

1. Manifest fields
2. Paste kernel source
3. Live gate progress
4. Submission id + auto-granted badges

---

## 6. Certification badges

Three tiers, none mutually exclusive:

### Verified (auto)

Granted when all 6 test gates pass at submit time. Cyan badge.

### Engineering Team Endorsed (manual)

Granted by the platform engineering team after:
- a manual code review (math correctness, code quality, docs),
- a working sample game shipped using the kernel.

In v0.9 this is admin-only (email `marketplace@slot-math-engine.com`). Automated escalation queue lands in Q3.

### Production Proven (auto)

Granted automatically when the kernel is used in 3+ live operator games, each running for 90+ days without incident. Tracked daily by the platform; no author action required.

---

## 7. Revenue share

| Tier | Author share | Platform share | How to qualify |
|---|---|---|---|
| **Tier 1** (default) | 70% | 30% | none — every author starts here |
| **Tier 2** (verified) | 75% | 25% | 5+ certified (Verified) kernels |
| **Tier 3** (partner) | 80% | 20% | contractual partner deal |

### Worked example

Your kernel is installed by 100 operators at $5 / install / month.

- Gross: 100 × $5 = **$500**
- Tier 1 platform cut (30%): **$150**
- Tier 1 author pre-tax: **$350**
- After 30% US W-9 withholding (if applicable): **$245**

The UI on each kernel detail page shows this projection live: "if installed by N operators × $X/mo = $Y/mo author".

### Multi-currency

Authors pick a payout currency at signup: **USD / EUR / GBP / CAD / AUD**. The platform converts gross at the daily ECB rate (no FX margin in v0.9 — that lands when treasury hardens).

### Payout schedule

- Aggregated monthly, paid on the 15th of the following month.
- Minimum payout threshold: $100 (or local equivalent). Sub-threshold balances roll forward.
- Payment rails: ACH (US), SEPA (EU/GB), wire (CAD/AUD).

### Taxation basics (NOT tax advice)

- **US authors**: W-9 required, 1099-MISC issued annually. 24% backup withholding if W-9 missing.
- **EU authors**: VAT-reverse-charge if VAT-registered; otherwise gross.
- **UK authors**: VAT-reverse-charge or PSC depending on registration.
- **Other**: 30% default withholding unless treaty rate documented.

Consult a tax professional. The platform reports gross to the relevant authority — net is your responsibility.

---

## 8. Versioning a kernel

- Bump SemVer per change.
- Every new version re-runs the 6 gates.
- Old versions stay available but stop earning install revenue 90 days after a new MAJOR version supersedes them (operators must migrate).

---

## 9. Quick reference

| Action | API |
|---|---|
| Validate manifest client-side | `validateManifest(m)` |
| Validate code client-side | `validateKernelCode(code)` |
| Submit | `submitKernel(manifest, code, token, { apiUrl })` |
| Check badges | `GET /api/marketplace/kernels/:id/badges` |
| Skeleton manifest | `manifestSkeleton(authorId)` |

---

## 10. Roadmap (post-MVP)

- **W215 (delivered)**: full sandbox execution for the test runner — see `docs/KERNEL_SANDBOX.md`.
- **W216**: async queue + worker pool, persistent verdict store, local CLI for authors, automated badge escalation queue.
- **W220**: kernel marketplace search-by-RTP-range + jurisdiction filter.
- **W225**: revenue dashboard with per-operator install attribution.

Questions: `marketplace@slot-math-engine.com`. PR welcome on `slot-math-engine-template`.
