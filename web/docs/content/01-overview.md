# Overview

**Slot Math Engine** is a production-grade math kernel + intermediate representation (IR) for slot game libraries. It powers the L&W workflow end-to-end:

1. Game designers author an IR file in the Studio mini-app
2. The engine runs the IR through a **closed-form solver** plus **Monte-Carlo** validation
3. A full certification dossier emerges - operator-package.zip with PAR sheets, audit hash-chain, jurisdiction overlays, and replay log - shipped straight to the regulator

## What ships in this monorepo

| Layer | What you get |
|---|---|
| **`src/` engine** | 77 solver kernels (W196 milestone) covering 100% of L&W mechanics + 30+ cross-cutting features |
| **`server/` Fastify backend** | Wallet, session, audit hash-chain, GaaS WebSocket, license, signup, cert REST API |
| **`sdk/` npm package** | `@slot-math-engine/sdk` - REST client, IR builder, kernel-author helper |
| **`web/studio/`** | Designer + math + producer Studio (Vite + TS) |
| **`web/operator/`** | Operator dashboard (lobby + reconciliation) |
| **`web/regulator/`** | Regulator portal (cert review + replay) |
| **`web/marketplace/`** | Operator-facing GaaS marketplace |
| **`web/pitch/`** | Investor pitch deck mini-app |
| **`web/cabinet/`** | Cabinet driver simulator (Bally / IGT / Konami / Aristocrat) |
| **`web/onboarding/`**, **`web/support/`**, **`web/docs/`** | Customer portals |

## Numbers as of W207

- **6352 vitest specs PASS** (root + every mini-app)
- **77 solver kernels** = 100% L&W mechanics coverage
- **15 jurisdictions** overlay (UKGC, MGA, NV, NJ, PA, MI, ON, BC, AAMS, DGA, SGA, KSA, GBGA, SK, AGCO)
- **12 mini-apps** under `web/`
- **Closed-form portfolio + MC corpus** generated on every release

## Why closed-form solvers matter

Slot math is traditionally verified by running 10-100M Monte-Carlo spins. That is fine for a single SKU but does not scale to a library of 200+ titles plus 15 jurisdiction variants per title. Closed-form solvers compute RTP, hit-frequency, and variance algebraically per kernel, which means:

- Acceptance runs in seconds, not hours
- Cert paper trail includes the analytical formula plus the MC validation - regulators get both
- Math changes are caught at PR time, before the producer commits to art and audio

## Where to next

- New here? Read **Quickstart** for a 5-minute compute-RTP walkthrough.
- Game designer? Jump to **Studio Workflow**.
- Operator integrating GaaS? Skip to **REST API** and **GaaS WebSocket**.
- Cert lab? See **Cert Pipeline**.
