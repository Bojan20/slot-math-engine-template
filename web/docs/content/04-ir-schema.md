# IR Schema

The **Intermediate Representation** (IR) is the contract between the designer and the engine. It is a JSON document, schemaVersion-tagged, validated by a Zod schema in `src/schemas/ir.ts`. The SDK ships `IRBuilder` as a fluent builder for the same shape.

## Top-level shape

```typescript
interface IRDocument {
  schemaVersion: '1.0' | '2.0';
  gameId: string;
  topology: TopologyConfig;
  symbols: SymbolPool;
  paytable?: PaytableEntry[];
  features?: Record<string, FeatureConfig>;
  rtpTarget?: number;
  jurisdictions?: Jurisdiction[];
  metadata?: Record<string, unknown>;
}
```

## Field-by-field

### `schemaVersion`

`'1.0'` or `'2.0'`. Always pick the highest supported. `1.0` is kept for legacy IR files; the migration script (`npm run migrate-ir`) bumps them to `2.0`.

### `gameId`

Lowercase kebab-case identifier. Must be unique per tenant. Example: `huff-n-puff-storm-cellar`.

### `topology`

```typescript
interface TopologyConfig {
  kind: 'rectangular' | 'cluster_grid' | 'megaways' | 'colossal' | 'multi_grid';
  reels: number;          // 3..7
  rows: number | number[]; // single number for fixed grids, array for megaways
  ways?: number;          // 243, 1024, 117649 (megaways), etc.
  lines?: number;         // for line-pay games
}
```

### `symbols`

Map of symbol-id to per-strip count. Symbol ids are short codes:

| Code | Meaning |
|---|---|
| `HP` | High-pay |
| `MP` | Mid-pay |
| `LP` | Low-pay |
| `WILD` | Wild substitute |
| `SCATTER` | Scatter trigger |
| `BONUS` | Bonus trigger |

```json
{ "HP": 3, "MP": 3, "LP": 3, "WILD": 1, "SCATTER": 2 }
```

### `paytable`

Optional explicit paytable. If omitted the engine derives a fair paytable from symbol counts + `rtpTarget`.

```typescript
interface PaytableEntry {
  symbol: string;
  payouts: Record<number, number>; // k-of-a-kind -> multiplier
}
```

### `features`

Map of feature-name to feature-config. The engine matches feature-name against the registered kernel registry (`src/kernels/*`).

Common features:

```json
{
  "free_spins":             { "trigger": 3, "count": 10 },
  "sticky_wild":            { "expandDirection": "up" },
  "cascade_multiplier":     { "ladder": [1, 2, 3, 5] },
  "hold_n_win":             { "rounds": 3, "respinOnCoin": true },
  "wheel_bonus":            { "tiers": ["MINI", "MINOR", "MAJOR", "GRAND"] }
}
```

### `rtpTarget`

Target RTP as a fraction in [0.85, 0.99]. Used by the engine to back-solve any unspecified paytable rows. Most jurisdictions want >= 0.92.

### `jurisdictions`

Array of jurisdiction codes the game is intended to ship to. Pass `['GENERIC']` for the unconstrained baseline.

```json
["UKGC", "MGA", "NV", "NJ"]
```

### `metadata`

Free-form key-value bag for the producer. Example: theme, art-lock date, audio version, math sign-off date.

## Validation

```typescript
import { parseGameIR } from '../../../src/schemas/ir.js';

const ir = parseGameIR(rawJson);  // throws ZodError on invalid
```

The playground page in this docs site exposes the same validator via a JSON text-area: see **Interactive Playground**.

## A complete example

```json
{
  "schemaVersion": "2.0",
  "gameId": "huff-n-puff-storm-cellar",
  "topology": { "kind": "rectangular", "reels": 5, "rows": 3, "lines": 30 },
  "symbols": { "HP": 3, "MP": 3, "LP": 3, "WILD": 1, "SCATTER": 2 },
  "features": {
    "free_spins": { "trigger": 3, "count": 10 },
    "sticky_wild": { "expandDirection": "up" }
  },
  "rtpTarget": 0.955,
  "jurisdictions": ["UKGC", "MGA"],
  "metadata": { "theme": "barn-storm", "artLock": "2026-04-12" }
}
```
