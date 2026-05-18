# Cabinet Integration

Land-based cabinets (Bally Alpha2 Pro, IGT CrystalCurve, Konami Concerto, Aristocrat MarsX) talk to the engine through a thin **cabinet driver** that wraps `SlotMathClient` + `SlotMathLiveClient`. The driver runs on the cabinet's onboard computer and handles:

- Spin button -> `POST /api/gaas/spin`
- Reel-stop animation -> SDK `SpinResult.reelStop[][]`
- Top-box meter -> WS `wallet-update`
- Bonus screens -> WS `spin.result.bonus`
- Audit chain mirror -> WS `merkleCommit` written to local SQLite for offline replay

## Reference driver

`web/cabinet/` ships a TypeScript reference driver + a simulator (no real hardware required). Build:

```bash
cd web/cabinet
npm run build
```

The driver exposes a tiny C ABI (via `node-addon-api`) so the host firmware can call into it without spawning a Node process per spin.

## Per-vendor adapters

| Vendor | Adapter | Notes |
|---|---|---|
| Bally | `cabinet/adapters/bally.ts` | Alpha2 Pro SAS 6.02 |
| IGT | `cabinet/adapters/igt.ts` | CrystalCurve G2S 3.0 |
| Konami | `cabinet/adapters/konami.ts` | Concerto BCI v4 |
| Aristocrat | `cabinet/adapters/aristocrat.ts` | MarsX SDK |

Each adapter wraps the vendor SAS/G2S protocol and exposes a vendor-neutral `CabinetSpinHandler` interface to the rest of the driver.

## SAS / G2S meter mapping

| Logical | SAS meter | G2S meter |
|---|---|---|
| Total coin in | 0x0A | `meterCoinIn` |
| Total coin out | 0x0B | `meterCoinOut` |
| Games played | 0x15 | `meterGamesPlayed` |
| Total wagered | 0x06 | `meterTotalWagered` |
| Jackpot count | 0x36 | `meterJackpotCount` |

The driver writes through to local SQLite every 500 ms and reconciles against the server every 10 seconds. Net drift over 24h is sub-1c in our internal soak tests.

## Offline mode

Cabinets fall offline. The driver caches:

- Last `seamlessHandshake` for up to 24h
- Last 256 spins (signed locally with the cabinet's per-machine key)
- Local audit chain

On reconnect the driver replays the cached spins and the server verifies them against the cross-signed merkle root. Any divergence triggers a hard-lock that requires the slot tech to attend.

## Bonus screens

Bonus screens are rendered by the cabinet's existing GPU pipeline. The engine only returns the **outcome** (e.g. wheel slice index, picked items, ladder rung). The driver maps the outcome to a vendor-specific animation cue.

```typescript
import { SlotMathLiveClient } from '@slot-math-engine/sdk';

const live = new SlotMathLiveClient({ apiUrl: 'wss://engine.example.com' });

live.on('spin', (e) => {
  if (e.result && typeof e.result === 'object' && 'bonus' in e.result) {
    cabinetRenderBonus(e.result.bonus);
  }
});
```

## Cert handoff

The cabinet's audit chain is exported as part of the per-cabinet operator-package.zip (one per serial number). Regulators get a per-cabinet replay that proves every spin matches the engine-side hash.
