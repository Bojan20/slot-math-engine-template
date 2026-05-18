# Jurisdictions

The engine ships with a 15-jurisdiction overlay. Each jurisdiction applies a deterministic transform to the IR + a set of runtime guards. The overlay is *additive* - the same IR file ships everywhere; the overlay narrows behaviour to the strictest of the targets.

## Supported jurisdictions

| Code | Region | Highlights |
|---|---|---|
| `UKGC` | United Kingdom | No autoplay, 2.5s minimum spin time, loss-limit mandatory, reality check 60min |
| `MGA` | Malta | Loss limit + session timer, reality check 30min |
| `NV` | Nevada | Max bet $100, RTP >= 0.75 (we ship >= 0.92), PAR sheet mandatory |
| `NJ` | New Jersey | Max bet $100, geofencing, age verification |
| `PA` | Pennsylvania | Same as NJ + responsible-gaming break every 60 min |
| `MI` | Michigan | NJ-equivalent + state-level age check |
| `ON` | Ontario | iGO certified, RG-Check messaging |
| `BC` | British Columbia | BCLC handshake |
| `AAMS` | Italy (ADM) | Bonus-rolling restrictions, max 2x deposit |
| `DGA` | Denmark | Hard 4s minimum spin time on slots |
| `SGA` | Sweden | Spelpaus.se opt-out, per-deposit limits |
| `KSA` | Netherlands | KSA reality check 30min, deposit-limit mandatory |
| `GBGA` | Gibraltar | UKGC-aligned |
| `SK` | Slovakia | Local-language UI mandatory |
| `AGCO` | Ontario (commercial) | iGO + AGCO RG-Check |

The catch-all baseline is `GENERIC` which applies no extra guards.

## How the overlay works

When a session is created with `jurisdiction: 'UKGC'` the server:

1. Loads the overlay config from `src/jurisdictions/UKGC.ts`
2. Wraps every `POST /spin` with a pre-check (autoplay reject, minimum spin time, loss-limit reached)
3. Adds an emit-time post-condition (e.g. reality-check pop emitted in `spin.notices`)
4. Tags the audit hash-chain entry with the active jurisdiction code

## Per-jurisdiction acceptance gate

```bash
npm run jurisdiction-auto-gate
```

Runs the IR through every declared jurisdiction and asserts:

- Loss-limit is honoured
- Autoplay is rejected where required
- Max-bet is enforced
- Reality-check interval is in spec
- PAR sheet is complete

The output is a per-jurisdiction pass/fail matrix that ships in the operator package.

## Adding a new jurisdiction

1. Create `src/jurisdictions/<CODE>.ts` exporting a `JurisdictionConfig`
2. Add the code to the `Jurisdiction` type in `sdk/types.ts`
3. Add an entry to `scripts/jurisdiction-emit-acceptance.mjs`
4. Add a vitest spec under `tests/jurisdictions/<CODE>.test.ts`

The jurisdictions test bench in `tests/jurisdictions/` exercises every guard in isolation so a new overlay never breaks an existing one.

## Cross-cutting RG safeguards

Regardless of jurisdiction the engine enforces:

- Per-spin debit happens **before** the outcome is computed (no negative-balance races)
- Loss-limit check is atomic against the wallet
- Self-exclusion list is checked on session create
- Audit chain entries are immutable + cross-signed
