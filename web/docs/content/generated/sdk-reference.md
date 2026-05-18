# Auto-generated SDK reference

Generated from `sdk/*.ts` JSDoc comments by `scripts/generate-api-docs.mjs`. 
Captures 7 exported symbols across 4 files. 
See **TypeScript SDK** for the hand-curated narrative.

## sdk/index.ts
_no documented exports_

## sdk/types.ts
| Kind | Symbol | Summary |
|---|---|---|
| `type` | `Jurisdiction` | @slot-math-engine/sdk — Public types for third-party developers. Anything exported from this file is part of the SDK's stable public surface. Internal engine types live in src/ and are not exposed. |
| `type` | `SymbolPool` | Symbol pool counts indexed by symbol-id. |

## sdk/client.ts
| Kind | Symbol | Summary |
|---|---|---|
| `class` | `IRBuilder` | @slot-math-engine/sdk — REST client. Wraps the Studio/Server APIs so a third-party developer can write code like: const client = new SlotMathClient({ apiUrl: 'http://localhost:4000' }); const result = await client.computeRTP(ir); / import type { ClientOptions, IRDocument, RTPResult, SpinResult, RenderConfig, SeamlessHandshake, ApiError, } from './types.js'; export class SlotMathClient { private readonly apiUrl: string; private readonly apiKey?: string; private readonly timeou |

## sdk/kernel-author.ts
| Kind | Symbol | Summary |
|---|---|---|
| `interface` | `KernelParamSpec` | @slot-math-engine/sdk — kernel-author helper. Skeletons + utilities for third-party developers writing a new math kernel. The kernel is a pure function: `(ctx, params) → result`. We give them an authoring helper that wires up: • parameter schema (Zod-like minimal types — no runtime dep) • RTP estimator hooks (closed-form + MC) • registration to the engine's kernel registry This is intentionally a minimal SDK helper — the real kernel lives in `src/kernels/` of the engine itsel |
| `function` | `validateParams` | Parameter key. */ key: string; type: 'number' \| 'integer' \| 'string' \| 'boolean' \| 'array'; /** Default value for testing. */ default?: unknown; /** Inclusive numeric bounds. */ min?: number; max?: number; /** Allowed string/enum values. */ enum?: string[]; description?: string; } export interface KernelContext { /** Pseudo-RNG seeded by the engine; returns [0, 1). */ rng: () => number; /** Per-spin bet size. */ bet: number; /** Symbol pool. */ symbolPool: Record<string, numb |
| `function` | `defineKernel` | Author a new kernel definition with sensible defaults. The returned object can be registered with `engine.registerKernel(def)` (when the engine API supports it) or simply exported from your package. |
| `function` | `defaultMC` | Compute a quick MC estimate when the kernel doesn't ship one. |
