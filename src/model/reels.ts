/**
 * SLOT MATH ENGINE TEMPLATE - Reel Strip Definitions
 *
 * Design targets:
 * - FS Trigger: ~1/140 (3+ scatters)
 * - H&W Trigger: ~1/200 (6+ special symbols)
 * - Hit Rate: ~25-30%
 * - Base RTP: ~45%
 *
 * Strip structure per reel (54 stops):
 * - 2 Scatters (3.7% per stop × 3 rows = ~11% per reel window)
 * - 7 Special symbols (H&W trigger)
 * - 3 Wilds
 * - 2 HP1, 1 HP2, 1 HP3
 * - Remaining LP symbols for cadence
 *
 * CUSTOMIZATION:
 * 1. Modify symbol distribution to tune feature frequencies
 * 2. Adjust strip length for different volatility profiles
 * 3. Run simulation to verify RTP after changes
 */

import { SymbolId } from './symbols.js';

export type ReelStrip = SymbolId[];

// Short aliases for readability
const L1 = SymbolId.LP_LYRE;
const L2 = SymbolId.LP_COIN;
const L3 = SymbolId.LP_HELMET;
const L4 = SymbolId.LP_SCROLL;
const L5 = SymbolId.LP_RING;
const H1 = SymbolId.HP_ZEUS;
const H2 = SymbolId.HP_HADES;
const H3 = SymbolId.HP_POSEIDON;
const WI = SymbolId.WILD_SHIELD;
const SC = SymbolId.SCATTER_TEMPLE;
const LO = SymbolId.LIGHTNING_ORB;

/**
 * BASE GAME REEL STRIPS
 *
 * Each reel: 54 stops
 * - 2 scatters per reel (FS trigger ~1/117-140)
 * - 7 special symbols (H&W trigger ~1/190-200)
 * - 3 wilds
 * - 2 HP1, 1 HP2, 1 HP3
 * - ~38 LP mixed
 */
export const BASE_REELS: ReelStrip[] = [
  // REEL 1 (54 stops)
  [
    H1, L1, L2, L3, L4, L5,     // HP1
    L1, L2, LO, L3, L4, L5,     // Special 1
    L1, L2, L3, WI, L4, L5,     // Wild 1
    L1, SC, L2, L3, L4, L5,     // Scatter 1
    L1, H2, L2, LO, L3, L4,     // HP2 + Special 2
    L5, L1, LO, L2, L3, L4,     // Special 3
    L5, H3, L1, L2, WI, L3,     // HP3 + Wild 2
    L4, SC, LO, L1, L2, L3,     // Scatter 2 + Special 4
    L4, L5, LO, L1, WI, L2,     // Special 5 + Wild 3
    L3, L4, LO, L5, H1, LO      // Special 6 + HP1 + Special 7
  ],

  // REEL 2 (54 stops)
  [
    L1, H1, L2, L3, L4, L5,     // HP1
    L1, L2, LO, L3, L4, L5,     // Special 1
    L1, L2, L3, WI, L4, L5,     // Wild 1
    L1, SC, L2, L3, L4, L5,     // Scatter 1
    L1, H2, L2, LO, L3, L4,     // HP2 + Special 2
    L5, L1, LO, L2, L3, L4,     // Special 3
    L5, H3, L1, L2, WI, L3,     // HP3 + Wild 2
    L4, SC, LO, L1, L2, L3,     // Scatter 2 + Special 4
    L4, L5, LO, L1, WI, L2,     // Special 5 + Wild 3
    L3, L4, LO, L5, H1, LO      // Special 6 + HP1 + Special 7
  ],

  // REEL 3 (54 stops) - CRITICAL MIDDLE REEL
  [
    H1, L1, L2, L3, L4, L5,     // HP1
    L1, L2, LO, L3, L4, L5,     // Special 1
    L1, L2, L3, WI, L4, L5,     // Wild 1
    L1, SC, L2, L3, L4, L5,     // Scatter 1
    L1, H2, L2, LO, L3, L4,     // HP2 + Special 2
    L5, L1, LO, L2, L3, L4,     // Special 3
    L5, H3, L1, L2, WI, L3,     // HP3 + Wild 2
    L4, SC, LO, L1, L2, L3,     // Scatter 2 + Special 4
    L4, L5, LO, L1, WI, L2,     // Special 5 + Wild 3
    L3, L4, LO, L5, H1, LO      // Special 6 + HP1 + Special 7
  ],

  // REEL 4 (54 stops)
  [
    L1, H1, L2, L3, L4, L5,     // HP1
    L1, L2, LO, L3, L4, L5,     // Special 1
    L1, L2, L3, WI, L4, L5,     // Wild 1
    L1, SC, L2, L3, L4, L5,     // Scatter 1
    L1, H2, L2, LO, L3, L4,     // HP2 + Special 2
    L5, L1, LO, L2, L3, L4,     // Special 3
    L5, H3, L1, L2, WI, L3,     // HP3 + Wild 2
    L4, SC, LO, L1, L2, L3,     // Scatter 2 + Special 4
    L4, L5, LO, L1, WI, L2,     // Special 5 + Wild 3
    L3, L4, LO, L5, H1, LO      // Special 6 + HP1 + Special 7
  ],

  // REEL 5 (54 stops)
  [
    H1, L1, L2, L3, L4, L5,     // HP1
    L1, L2, LO, L3, L4, L5,     // Special 1
    L1, L2, L3, WI, L4, L5,     // Wild 1
    L1, SC, L2, L3, L4, L5,     // Scatter 1
    L1, H2, L2, LO, L3, L4,     // HP2 + Special 2
    L5, L1, LO, L2, L3, L4,     // Special 3
    L5, H3, L1, L2, WI, L3,     // HP3 + Wild 2
    L4, SC, LO, L1, L2, L3,     // Scatter 2 + Special 4
    L4, L5, LO, L1, WI, L2,     // Special 5 + Wild 3
    L3, L4, LO, L5, H1, LO      // Special 6 + HP1 + Special 7
  ]
];

/**
 * FREE SPINS REEL STRIPS
 *
 * Higher volatility than base game:
 * - 5 Wilds per reel (~10%)
 * - 5 Special symbols per reel (~10%)
 * - 2 Scatters per reel (retrigger ~10-12%)
 *
 * Each reel: 50 stops
 */
export const FREE_SPINS_REELS: ReelStrip[] = [
  // FS REEL 1 (50 stops)
  [
    H1, L1, L2, L3, WI, L4,     // HP1 + wild
    L5, L1, LO, L2, L3, L4,     // Special 1
    L5, SC, L1, L2, L3, L4,     // Scatter 1
    L5, L1, WI, L2, H2, L3,     // Wild + HP2
    L4, L5, LO, L1, L2, L3,     // Special 2
    H3, L4, WI, L5, L1, L2,     // HP3 + wild
    L3, SC, LO, L5, L1, L2,     // Scatter 2 + Special 3
    L3, L4, WI, L5, LO, L1,     // Wild + Special 4
    L2, L3, WI, LO                // Wild + Special 5
  ],

  // FS REEL 2 (50 stops)
  [
    L1, H1, L2, L3, WI, L4,     // HP1 + wild
    L5, L1, LO, L2, L3, L4,     // Special 1
    L5, L1, SC, L2, L3, L4,     // Scatter 1
    L5, L1, WI, L2, H2, L3,     // Wild + HP2
    L4, L5, LO, L1, L2, L3,     // Special 2
    L4, H3, WI, L5, L1, L2,     // HP3 + wild
    L3, SC, LO, L5, L1, L2,     // Scatter 2 + Special 3
    L3, L4, WI, L5, LO, L1,     // Wild + Special 4
    L2, L3, WI, LO                // Wild + Special 5
  ],

  // FS REEL 3 (50 stops) - CRITICAL MIDDLE REEL
  [
    H1, L1, WI, L2, L3, L4,     // HP1 + wild
    L5, L1, LO, L2, WI, L3,     // Special 1 + wild
    L4, SC, L5, L1, L2, L3,     // Scatter 1
    L4, L5, WI, L1, H2, L2,     // Wild + HP2
    L3, L4, LO, L5, L1, L2,     // Special 2
    H3, L3, WI, L4, L5, L1,     // HP3 + wild
    L2, SC, LO, L4, L5, L1,     // Scatter 2 + Special 3
    L2, L3, WI, L4, LO, L5,     // Wild + Special 4
    L1, L2, LO                    // Special 5
  ],

  // FS REEL 4 (50 stops)
  [
    L1, H1, L2, L3, WI, L4,     // HP1 + wild
    L5, L1, LO, L2, L3, L4,     // Special 1
    L5, L1, SC, L2, L3, L4,     // Scatter 1
    L5, L1, WI, L2, H2, L3,     // Wild + HP2
    L4, L5, LO, L1, L2, L3,     // Special 2
    L4, H3, WI, L5, L1, L2,     // HP3 + wild
    L3, SC, LO, L5, L1, L2,     // Scatter 2 + Special 3
    L3, L4, WI, L5, LO, L1,     // Wild + Special 4
    L2, L3, WI, LO                // Wild + Special 5
  ],

  // FS REEL 5 (50 stops)
  [
    H1, L1, L2, L3, WI, L4,     // HP1 + wild
    L5, L1, LO, L2, L3, L4,     // Special 1
    L5, SC, L1, L2, L3, L4,     // Scatter 1
    L5, L1, WI, L2, H2, L3,     // Wild + HP2
    L4, L5, LO, L1, L2, L3,     // Special 2
    H3, L4, WI, L5, L1, L2,     // HP3 + wild
    L3, SC, LO, L5, L1, L2,     // Scatter 2 + Special 3
    L3, L4, WI, L5, LO, L1,     // Wild + Special 4
    L2, L3, WI, LO                // Wild + Special 5
  ]
];

/**
 * Get reel strip length
 */
export function getReelLength(reelIndex: number, isFreeSpins: boolean = false): number {
  const reels = isFreeSpins ? FREE_SPINS_REELS : BASE_REELS;
  return reels[reelIndex].length;
}

/**
 * Get symbol at position (with wrapping for window display)
 */
export function getSymbolAt(
  reelIndex: number,
  stopPosition: number,
  isFreeSpins: boolean = false
): SymbolId {
  const reels = isFreeSpins ? FREE_SPINS_REELS : BASE_REELS;
  const reel = reels[reelIndex];
  const wrappedPos = ((stopPosition % reel.length) + reel.length) % reel.length;
  return reel[wrappedPos];
}

/**
 * Get visible window (3 symbols) from a stop position
 * Stop position is the TOP of the window
 */
export function getWindow(
  reelIndex: number,
  stopPosition: number,
  isFreeSpins: boolean = false
): SymbolId[] {
  return [
    getSymbolAt(reelIndex, stopPosition, isFreeSpins),
    getSymbolAt(reelIndex, stopPosition + 1, isFreeSpins),
    getSymbolAt(reelIndex, stopPosition + 2, isFreeSpins)
  ];
}

/**
 * Calculate symbol distribution on a reel
 */
export interface SymbolDistribution {
  symbol: SymbolId;
  count: number;
  percentage: number;
}

export function getReelDistribution(
  reelIndex: number,
  isFreeSpins: boolean = false
): SymbolDistribution[] {
  const reels = isFreeSpins ? FREE_SPINS_REELS : BASE_REELS;
  const reel = reels[reelIndex];
  const counts = new Map<SymbolId, number>();

  for (const symbol of reel) {
    counts.set(symbol, (counts.get(symbol) || 0) + 1);
  }

  const distribution: SymbolDistribution[] = [];
  for (const [symbol, count] of counts) {
    distribution.push({
      symbol,
      count,
      percentage: (count / reel.length) * 100
    });
  }

  return distribution.sort((a, b) => b.count - a.count);
}

/**
 * Validate reel strips
 */
export function validateReels(): boolean {
  const allReels = [
    { name: 'BASE', reels: BASE_REELS },
    { name: 'FS', reels: FREE_SPINS_REELS }
  ];

  for (const { name, reels } of allReels) {
    if (reels.length !== 5) {
      console.error(`${name}: Expected 5 reels, got ${reels.length}`);
      return false;
    }

    for (let i = 0; i < reels.length; i++) {
      const reel = reels[i];

      if (reel.length < 30 || reel.length > 70) {
        console.warn(`${name} Reel ${i + 1}: Length ${reel.length} (expected 30-70)`);
      }

      // Check scatter count - should be 2 per reel for ~1/117-140 FS trigger
      const scatterCount = reel.filter(s => s === SC).length;
      if (scatterCount !== 2) {
        console.warn(`${name} Reel ${i + 1}: Has ${scatterCount} scatters, expected 2`);
      }

      // Check special symbol presence for H&W trigger
      const specialCount = reel.filter(s => s === LO).length;
      if (name === 'BASE' && (specialCount < 5 || specialCount > 8)) {
        console.warn(`${name} Reel ${i + 1}: Has ${specialCount} special symbols`);
      }
    }
  }

  return true;
}
