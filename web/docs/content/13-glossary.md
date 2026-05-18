# Glossary

Quick reference for the slot-math terminology used across this codebase.

| Term | Definition |
|---|---|
| **RTP** | Return To Player. Long-run expected return as a fraction of bet. A 95.5% slot is `rtp = 0.955`. |
| **Hit frequency** | Fraction of spins that return any non-zero win. Typically 0.20-0.35. |
| **Variance** | Per-spin variance of the return. Used as the volatility proxy. |
| **Volatility** | Subjective player feel: low / medium / high. Maps roughly to variance buckets. |
| **PAR sheet** | "Probability and Accounting Report". Industry-standard cert document with per-symbol probabilities + expected returns. We emit PAR-USIF v1. |
| **USIF** | Universal Slot Industry Format. Common PAR schema we ship as our canonical PAR format. |
| **Closed-form** | An analytical formula for an outcome. Contrasted with Monte-Carlo. |
| **Monte-Carlo (MC)** | Simulation-based validation. We run 50M+ spins per cert. |
| **MC corpus** | The sealed set of MC runs included in the cert dossier. |
| **IR** | Intermediate Representation. JSON document describing the slot game. See **IR Schema**. |
| **Kernel** | A single math kernel implementing one mehanika family (e.g. cascade, hold-and-spin, wheel). 77 ship in W196. |
| **Mehanika** | Serbo-Croatian for "mechanic". Used throughout the codebase. |
| **Solver** | A closed-form kernel. Used interchangeably with "kernel" when the kernel exposes a closed-form. |
| **GaaS** | Gaming-as-a-Service. The operator-facing API layer on top of the engine. |
| **Operator** | The casino / gaming site (e.g. bet365). Calls our GaaS API to render games. |
| **Cabinet** | Land-based slot machine hardware. Runs the cabinet driver. |
| **Studio** | Our designer + math + producer mini-app (`web/studio/`). |
| **Audit chain** | Per-session sha256 hash-chain of spin responses. Signed with ed25519. |
| **Merkle commit** | Root hash of the per-spin merkle tree returned in every spin response. |
| **Hash-chain replay** | Regulator-grade offline verification of the audit chain. |
| **Jurisdiction** | Regulatory regime (e.g. UKGC, MGA, NV). 15 supported. |
| **Overlay** | Per-jurisdiction transform applied to the base IR + runtime guards. |
| **Reality check** | Periodic interstitial that asks the player to confirm continued play. Mandatory under UKGC / MGA / KSA. |
| **Self-exclusion** | Player-initiated permanent block. Checked on session create. |
| **Bet minor** | Bet amount in integer minor units (cents). Internal canonical form. |
| **Bet amount** | Bet in major units (dollars). External API form. |
| **Hold percentage** | `1 - RTP`. The house edge. |
| **Cycle length** | Number of spins to cover the full sample space. Closed-form solvers compute this directly. |
| **Stop position** | The symbol that lands on the visible row after a spin. |
| **Reel strip** | The full strip of symbols that the visible window is sampled from. |
| **Way win** | A win that pays for any sequence of matching symbols left-to-right regardless of position (vs. fixed paylines). 243-way, 1024-way. |
| **Megaways** | Variable-row topology where each reel can be 2-7 symbols tall per spin. |
| **Cascade** | Winning symbols are removed and new symbols fall in to replace them; possibly chains. |
| **Tumble** | Synonym for cascade. |
| **Hold-and-spin** | Sticky mechanic where collected coins lock and the rest of the grid respins. |
| **Free spins** | Bonus round triggered by scatters, runs for a fixed count without further bets. |
| **Wild** | Symbol that substitutes for any pay symbol. |
| **Scatter** | Symbol that triggers a bonus / free spins regardless of position. |
| **Sticky wild** | Wild that locks in place for the rest of the bonus / free-spin trail. |
| **Multiplier** | A scalar applied to a win amount (e.g. `2x`, `5x`). |
| **Bonus buy** | Player option to pay an inflated bet to immediately trigger a bonus. |
| **Ante bet** | Side bet that increases the bonus-trigger probability. |
| **Jackpot** | Special top-prize. Can be fixed, must-hit-by, or progressive (WAP). |
| **WAP** | Wide-Area Progressive jackpot pooled across multiple operators. |
| **MUST-HIT-BY** | Jackpot that is guaranteed to hit before a stated ceiling. |
| **Pseudo-must-hit** | Heuristic must-hit that doesn't carry a hard ceiling but trends in the same direction. |
| **Hit-frequency distribution** | Distribution of consecutive losing spins. Used to tune feel. |
| **Drawdown** | Largest peak-to-trough loss over a session. Used in RG modelling. |
| **HSM** | Hardware Security Module. Stores the engine's ed25519 signing key. |
| **Wave** | One unit of progress in our delivery workflow. Each wave = solver + acceptance pair. |
| **Wave commit** | The git commit pinned in `SLOT_ENGINE_MASTER_TODO.md` for a given wave. |
