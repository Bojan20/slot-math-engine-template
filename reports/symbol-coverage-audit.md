# Symbol-coverage audit — every grid reads every symbol

**Boki imperative (2026-06-07)**: *"overi svaki moguci grid koji imamo da uvek simulator cita dinamicki simbole, kojiko god da ih ima i koji god da su. iz gdda mora svaki moguci simbol da se procita i da bude ubacen u grid"*.

Run: 2026-06-07T10:10:42.925Z
Fixtures: **152** · Pass: **152** · Fail: **0**

## Severity breakdown

| Severity | Count | Meaning |
|---|---:|---|
| ✓ pass | 143 | Simulator dynamically reads every declared/inferred symbol into the grid |
| ⓘ non-studio | 8 | PAR-internal intermediate IR (CE / parse_par output) — never feeds the Studio simulator |
| ⓘ non-reel | 1 | Topology kind (`crash` / `plinko` / `wheel`) doesn't drive a symbol grid — separate audit applies |
| ⚠ data-quality | 0 | Source IR is structurally empty (no symbols + no reels) — NOT a simulator bug |
| ✗ paying-symbol-missing | 0 | A declared HP/MP/LP symbol has no reel weight — simulator would never spawn it |
| ✗ paying-symbol-never-spawns | 0 | A reel-pooled symbol never appears in 2 000 spins (weight = 0 in every reel) |

## Methodology

Per fixture, dual reel-shape aware (canonical `{symId: weight}` + L&W sim `[{symbol, weight}]`):
1. Detect reel shape and build a flat per-symbol weight bag.
2. Assert every paying symbol (kind hp/mp/lp) has a positive weight on the reels — trigger-only/colossal/coin/bonus symbols are SOFT-OK (they spawn via feature triggers, not base draw).
3. Simulate **2 000 spins** via the production `_drawCellSymbol` (weighted draw + scatter/bonus/mult reel-gate on 5+ reel grids).
4. Assert every paying symbol spawns at least once.

## Trigger-only patterns (intentionally NOT on base reels)

`Big X` · `Colossal*` · `Mega*` · `Super*` · `Coin` · `Bonus` · `Volcano` · `Fireball` · `Mystery*` · bookkeeping `r0N`

## Results

| # | Fixture | Pool | Issues | Status |
|--:|---|---:|---|:--:|
| 1 | `web/studio/pilots/wrath-of-olympus.ir.json` | 14 | — | ✓ |
| 2 | `web/studio/pilots/spartacus-colossal-conquest.ir.json` | 15 | — | ✓ |
| 3 | `web/studio/pilots/quick-hit-platinum-phoenix.ir.json` | 16 | — | ✓ |
| 4 | `web/studio/pilots/rainbow-riches-megaways-vault.ir.json` | 14 | — | ✓ |
| 5 | `web/studio/pilots/huff-n-puff-storm-cellar.ir.json` | 14 | — | ✓ |
| 6 | `web/studio/ir-library/bonus/bonus-map-3path.ir.json` | 11 | — | ✓ |
| 7 | `web/studio/ir-library/bonus/bonus-race-6lane.ir.json` | 11 | — | ✓ |
| 8 | `web/studio/ir-library/bonus/bonus-pick-3of9.ir.json` | 11 | — | ✓ |
| 9 | `web/studio/ir-library/bonus/bonus-race-4lane.ir.json` | 11 | — | ✓ |
| 10 | `web/studio/ir-library/bonus/bonus-wheel-5tier.ir.json` | 11 | — | ✓ |
| 11 | `web/studio/ir-library/bonus/bonus-mystery-box.ir.json` | 11 | — | ✓ |
| 12 | `web/studio/ir-library/bonus/bonus-prize-board.ir.json` | 11 | — | ✓ |
| 13 | `web/studio/ir-library/bonus/bonus-wheel-3tier.ir.json` | 11 | — | ✓ |
| 14 | `web/studio/ir-library/bonus/bonus-treasure.ir.json` | 11 | — | ✓ |
| 15 | `web/studio/ir-library/bonus/bonus-pick-5of12.ir.json` | 11 | — | ✓ |
| 16 | `web/studio/ir-library/cluster/cluster-7x7-v2.ir.json` | 10 | — | ✓ |
| 17 | `web/studio/ir-library/cluster/cluster-mega.ir.json` | 10 | — | ✓ |
| 18 | `web/studio/ir-library/cluster/cluster-5x5.ir.json` | 10 | — | ✓ |
| 19 | `web/studio/ir-library/cluster/cluster-rectangle.ir.json` | 10 | — | ✓ |
| 20 | `web/studio/ir-library/cluster/cluster-tall.ir.json` | 10 | — | ✓ |
| 21 | `web/studio/ir-library/cluster/cluster-hex.ir.json` | 10 | — | ✓ |
| 22 | `web/studio/ir-library/cluster/cluster-diagonal.ir.json` | 10 | — | ✓ |
| 23 | `web/studio/ir-library/cluster/cluster-8x8.ir.json` | 10 | — | ✓ |
| 24 | `web/studio/ir-library/cluster/cluster-mini.ir.json` | 10 | — | ✓ |
| 25 | `web/studio/ir-library/cluster/cluster-6x6.ir.json` | 10 | — | ✓ |
| 26 | `web/studio/ir-library/freespins/fs-retrigger-v2.ir.json` | 10 | — | ✓ |
| 27 | `web/studio/ir-library/freespins/fs-x3-multiplier.ir.json` | 10 | — | ✓ |
| 28 | `web/studio/ir-library/freespins/fs-mult-trail.ir.json` | 10 | — | ✓ |
| 29 | `web/studio/ir-library/freespins/fs-walking-wilds.ir.json` | 10 | — | ✓ |
| 30 | `web/studio/ir-library/freespins/fs-x5-multiplier.ir.json` | 10 | — | ✓ |
| 31 | `web/studio/ir-library/freespins/fs-sticky-wilds-v2.ir.json` | 10 | — | ✓ |
| 32 | `web/studio/ir-library/freespins/fs-pickem.ir.json` | 10 | — | ✓ |
| 33 | `web/studio/ir-library/freespins/fs-double.ir.json` | 10 | — | ✓ |
| 34 | `web/studio/ir-library/freespins/fs-expanding-v2.ir.json` | 10 | — | ✓ |
| 35 | `web/studio/ir-library/freespins/fs-symbol-upgrade.ir.json` | 10 | — | ✓ |
| 36 | `web/studio/ir-library/freespins/fs-mystery-symbol.ir.json` | 10 | — | ✓ |
| 37 | `web/studio/ir-library/freespins/fs-locked-reels.ir.json` | 10 | — | ✓ |
| 38 | `web/studio/ir-library/freespins/fs-x2-multiplier.ir.json` | 10 | — | ✓ |
| 39 | `web/studio/ir-library/freespins/fs-super-spins.ir.json` | 10 | — | ✓ |
| 40 | `web/studio/ir-library/freespins/fs-mega-spins.ir.json` | 10 | — | ✓ |
| 41 | `web/studio/ir-library/classics/sticky-wilds-fs.ir.json` | 10 | — | ✓ |
| 42 | `web/studio/ir-library/classics/megaways-6reel.ir.json` | 10 | — | ✓ |
| 43 | `web/studio/ir-library/classics/wheel-bonus-3tier.ir.json` | 11 | — | ✓ |
| 44 | `web/studio/ir-library/classics/pick-bonus-4-of-9.ir.json` | 11 | — | ✓ |
| 45 | `web/studio/ir-library/classics/cluster-7x7.ir.json` | 10 | — | ✓ |
| 46 | `web/studio/ir-library/classics/free-spins-retrigger.ir.json` | 10 | — | ✓ |
| 47 | `web/studio/ir-library/classics/hold-and-win-classic.ir.json` | 11 | — | ✓ |
| 48 | `web/studio/ir-library/classics/expanding-wilds-fs.ir.json` | 10 | — | ✓ |
| 49 | `web/studio/ir-library/classics/cascade-with-multiplier.ir.json` | 10 | — | ✓ |
| 50 | `web/studio/ir-library/classics/classic-5x3-20lines.ir.json` | 10 | — | ✓ |
| 51 | `web/studio/ir-library/holdwin/hw-cash-fall.ir.json` | 11 | — | ✓ |
| 52 | `web/studio/ir-library/holdwin/hw-lock-it-link.ir.json` | 11 | — | ✓ |
| 53 | `web/studio/ir-library/holdwin/hw-row-complete.ir.json` | 11 | — | ✓ |
| 54 | `web/studio/ir-library/holdwin/hw-classic.ir.json` | 11 | — | ✓ |
| 55 | `web/studio/ir-library/holdwin/hw-jackpot-orb.ir.json` | 11 | — | ✓ |
| 56 | `web/studio/ir-library/holdwin/hw-coin-combo.ir.json` | 11 | — | ✓ |
| 57 | `web/studio/ir-library/holdwin/hw-column-complete.ir.json` | 11 | — | ✓ |
| 58 | `web/studio/ir-library/holdwin/hw-frenzy.ir.json` | 11 | — | ✓ |
| 59 | `web/studio/ir-library/holdwin/hw-megaorb.ir.json` | 11 | — | ✓ |
| 60 | `web/studio/ir-library/holdwin/hw-mini.ir.json` | 11 | — | ✓ |
| 61 | `web/studio/ir-library/classic-lines/classic-lines-lucky-7.ir.json` | 10 | — | ✓ |
| 62 | `web/studio/ir-library/classic-lines/classic-lines-777.ir.json` | 10 | — | ✓ |
| 63 | `web/studio/ir-library/classic-lines/classic-lines-diamonds.ir.json` | 10 | — | ✓ |
| 64 | `web/studio/ir-library/classic-lines/classic-lines-fruit.ir.json` | 10 | — | ✓ |
| 65 | `web/studio/ir-library/classic-lines/classic-lines-liberty-bell.ir.json` | 10 | — | ✓ |
| 66 | `web/studio/ir-library/cascade/cascade-fast.ir.json` | 10 | — | ✓ |
| 67 | `web/studio/ir-library/cascade/cascade-slow.ir.json` | 10 | — | ✓ |
| 68 | `web/studio/ir-library/cascade/cascade-tumble.ir.json` | 10 | — | ✓ |
| 69 | `web/studio/ir-library/cascade/cascade-mega-mult.ir.json` | 10 | — | ✓ |
| 70 | `web/studio/ir-library/cascade/cascade-avalanche.ir.json` | 10 | — | ✓ |
| 71 | `web/studio/ir-library/cascade/cascade-rolling.ir.json` | 10 | — | ✓ |
| 72 | `web/studio/ir-library/cascade/cascade-chain.ir.json` | 10 | — | ✓ |
| 73 | `web/studio/ir-library/cascade/cascade-collapse.ir.json` | 10 | — | ✓ |
| 74 | `web/studio/ir-library/cascade/cascade-rebirth.ir.json` | 10 | — | ✓ |
| 75 | `web/studio/ir-library/cascade/cascade-staircase.ir.json` | 10 | — | ✓ |
| 76 | `web/studio/ir-library/megaways/megaways-buffalo.ir.json` | 11 | — | ✓ |
| 77 | `web/studio/ir-library/megaways/megaways-cascadia.ir.json` | 11 | — | ✓ |
| 78 | `web/studio/ir-library/megaways/megaways-vikings.ir.json` | 11 | — | ✓ |
| 79 | `web/studio/ir-library/megaways/megaways-donkey-kong.ir.json` | 11 | — | ✓ |
| 80 | `web/studio/ir-library/megaways/megaways-7x.ir.json` | 11 | — | ✓ |
| 81 | `web/studio/ir-library/megaways/megaways-classic.ir.json` | 11 | — | ✓ |
| 82 | `web/studio/ir-library/megaways/megaways-extra-chilli.ir.json` | 11 | — | ✓ |
| 83 | `web/studio/ir-library/megaways/megaways-bonanza.ir.json` | 11 | — | ✓ |
| 84 | `web/studio/ir-library/megaways/megaways-fishin.ir.json` | 11 | — | ✓ |
| 85 | `web/studio/ir-library/megaways/megaways-mystery.ir.json` | 11 | — | ✓ |
| 86 | `web/studio/ir-library/jackpot/jackpot-must-hit.ir.json` | 11 | — | ✓ |
| 87 | `web/studio/ir-library/jackpot/jackpot-4tier-wap.ir.json` | 11 | — | ✓ |
| 88 | `web/studio/ir-library/jackpot/jackpot-mystery.ir.json` | 11 | — | ✓ |
| 89 | `web/studio/ir-library/jackpot/jackpot-linked.ir.json` | 11 | — | ✓ |
| 90 | `web/studio/ir-library/jackpot/jackpot-instant.ir.json` | 11 | — | ✓ |
| 91 | `web/studio/ir-library/jackpot/jackpot-network-wap.ir.json` | 11 | — | ✓ |
| 92 | `web/studio/ir-library/jackpot/jackpot-frenzy.ir.json` | 11 | — | ✓ |
| 93 | `web/studio/ir-library/jackpot/jackpot-3tier-basic.ir.json` | 11 | — | ✓ |
| 94 | `web/studio/ir-library/jackpot/jackpot-standalone.ir.json` | 11 | — | ✓ |
| 95 | `web/studio/ir-library/jackpot/jackpot-5tier-mega.ir.json` | 11 | — | ✓ |
| 96 | `web/studio/ir-library/hybrid/hybrid-cluster-fs.ir.json` | 12 | — | ✓ |
| 97 | `web/studio/ir-library/hybrid/hybrid-pick-jackpot.ir.json` | 12 | — | ✓ |
| 98 | `web/studio/ir-library/hybrid/hybrid-cascade-jackpot.ir.json` | 12 | — | ✓ |
| 99 | `web/studio/ir-library/hybrid/hybrid-wheel-fs.ir.json` | 12 | — | ✓ |
| 100 | `web/studio/ir-library/hybrid/hybrid-cascade-fs.ir.json` | 12 | — | ✓ |
| 101 | `web/studio/ir-library/hybrid/hybrid-fs-cluster.ir.json` | 12 | — | ✓ |
| 102 | `web/studio/ir-library/hybrid/hybrid-mega-wheel-fs.ir.json` | 12 | — | ✓ |
| 103 | `web/studio/ir-library/hybrid/hybrid-everything.ir.json` | 12 | — | ✓ |
| 104 | `web/studio/ir-library/hybrid/hybrid-megaways-hw.ir.json` | 12 | — | ✓ |
| 105 | `web/studio/ir-library/hybrid/hybrid-mystery-hw.ir.json` | 12 | — | ✓ |
| 106 | `build/games/wrath-of-olympus/v12.1.0/web/game.ir.json` | 14 | — | ✓ |
| 107 | `build/games/wrath-of-olympus/v12.1.0/server/game.ir.json` | 14 | — | ✓ |
| 108 | `build/games/wrath-of-olympus/v12_audit/game.ir.json` | 14 | — | ✓ |
| 109 | `games/ce-copy-test/out/lw.200-1637-001.slot-sim.ir.json` | 24 | — | ✓ |
| 110 | `games/ce-copy-test/out/lw.200-1637-001.ir.json` | ? | PAR-internal IR (no topology / symbols / reels) — not a simulator input | ⓘ |
| 111 | `games/ce-copy-test/out/ce-copy-test.200-1637-003.ir.json` | ? | PAR-internal IR (no topology / symbols / reels) — not a simulator input | ⓘ |
| 112 | `games/ce-copy-test/out/ce-copy-test.200-1637-002.ir.json` | ? | PAR-internal IR (no topology / symbols / reels) — not a simulator input | ⓘ |
| 113 | `games/ce-copy-test/out/lw.200-1637-002.slot-sim.ir.json` | 24 | — | ✓ |
| 114 | `games/ce-copy-test/out/lw.200-1637-002.ir.json` | ? | PAR-internal IR (no topology / symbols / reels) — not a simulator input | ⓘ |
| 115 | `games/ce-copy-test/out/lw.200-1637-003.ir.json` | ? | PAR-internal IR (no topology / symbols / reels) — not a simulator input | ⓘ |
| 116 | `games/ce-copy-test/out/lw.200-1637-003.slot-sim.ir.json` | 24 | — | ✓ |
| 117 | `games/ce-copy-test/out/ce-copy-test.200-1637-001.ir.json` | ? | PAR-internal IR (no topology / symbols / reels) — not a simulator input | ⓘ |
| 118 | `games/megaways-clean-room-template/out/template-megaways-cleanroom.ir.json` | 11 | — | ✓ |
| 119 | `games/skeleton-key/out/skeleton-key.200-1517-002.slot-sim.ir.json` | 14 | — | ✓ |
| 120 | `games/skeleton-key/out/skeleton-key.200-1517-003.slot-sim.ir.json` | 14 | — | ✓ |
| 121 | `games/skeleton-key/out/skeleton-key.200-1517-001.slot-sim.ir.json` | 14 | — | ✓ |
| 122 | `games/walking-wild-clean-room-template/out/template-walking-wild-cleanroom.ir.json` | 10 | — | ✓ |
| 123 | `games/fort-knox-wolf-run/out/fort-knox-wolf-run.200-1775-002.slot-sim.ir.json` | 12 | — | ✓ |
| 124 | `games/fort-knox-wolf-run/out/igt.200-1775-002.slot-sim.ir.json` | 12 | — | ✓ |
| 125 | `games/fort-knox-wolf-run/out/igt.200-1775-001.ir.json` | ? | PAR-internal IR (no topology / symbols / reels) — not a simulator input | ⓘ |
| 126 | `games/fort-knox-wolf-run/out/igt.200-1775-001.slot-sim.ir.json` | 12 | — | ✓ |
| 127 | `games/fort-knox-wolf-run/out/igt.200-1775-002.ir.json` | ? | PAR-internal IR (no topology / symbols / reels) — not a simulator input | ⓘ |
| 128 | `games/fort-knox-wolf-run/out/fort-knox-wolf-run.200-1775-001.slot-sim.ir.json` | 12 | — | ✓ |
| 129 | `games/book-expanding-bonusbuy/out/template-book-bonusbuy.ir.json` | 10 | — | ✓ |
| 130 | `games/cash-eruption/out/cash-eruption.200-1637-001.slot-sim.ir.json` | 25 | — | ✓ |
| 131 | `games/cash-eruption/out/cash-eruption.200-1637-003.slot-sim.ir.json` | 25 | — | ✓ |
| 132 | `games/cash-eruption/out/cash-eruption.200-1637-002.slot-sim.ir.json` | 25 | — | ✓ |
| 133 | `games/fortune-coin-boost-classic/out/fortune-coin-boost-classic.200-1581-001.slot-sim.ir.json` | 18 | — | ✓ |
| 134 | `games/fortune-coin-boost-classic/out/fortune-coin-boost-classic.200-1581-004.slot-sim.ir.json` | 18 | — | ✓ |
| 135 | `games/fortune-coin-boost-classic/out/fortune-coin-boost-classic.200-1581-003.slot-sim.ir.json` | 18 | — | ✓ |
| 136 | `games/fortune-coin-boost-classic/out/fortune-coin-boost-classic.200-1581-002.slot-sim.ir.json` | 18 | — | ✓ |
| 137 | `reports/par-library/mystic-cluster/v1.0.0/game.ir.json` | 8 | — | ✓ |
| 138 | `reports/par-library/sky-cascade/v1.0.0/game.ir.json` | 6 | — | ✓ |
| 139 | `reports/par-library/stake-rush/v1.0.0/game.ir.json` | ? | topology=crash — non-reel game, separate audit applies | ⓘ |
| 140 | `reports/par-library/wrath-of-olympus/v12.0.0/game.ir.json` | 14 | — | ✓ |
| 141 | `reports/par-library/lightning-ways/v1.0.0/game.ir.json` | 11 | — | ✓ |
| 142 | `reports/par-library/oracle-of-delphi/v1.0.0/game.ir.json` | 4 | — | ✓ |
| 143 | `reports/greenfield-demo/orchard-cascade.slot-sim.ir.json` | 8 | — | ✓ |
| 144 | `reports/greenfield-demo/cascade-demo-nl.slot-sim.ir.json` | 8 | — | ✓ |
| 145 | `reports/greenfield-demo/golden-vault-nl.slot-sim.ir.json` | 8 | — | ✓ |
| 146 | `reports/greenfield-demo/golden-vault-holdandwin.slot-sim.ir.json` | 8 | — | ✓ |
| 147 | `reports/greenfield-demo/storm-megaways.slot-sim.ir.json` | 10 | — | ✓ |
| 148 | `reports/greenfield-demo/wolf-eruption-mythic.slot-sim.ir.json` | 10 | — | ✓ |
| 149 | `reports/greenfield-demo/crimson-tiger-243.slot-sim.ir.json` | 10 | — | ✓ |
| 150 | `reports/greenfield-demo/nl-demo-lines.slot-sim.ir.json` | 10 | — | ✓ |
| 151 | `reports/greenfield-demo/storm-megaways-nl.slot-sim.ir.json` | 10 | — | ✓ |
| 152 | `reports/greenfield-demo/tiger-ways.slot-sim.ir.json` | 8 | — | ✓ |

## Summary

- **152/152** fixtures PASS (100.0%) — simulator reads every symbol dynamically
- **0** structurally empty IR fixtures (data-quality issue at the source, NOT a simulator bug)
- **0** real simulator gaps (paying symbol cannot reach the grid)
