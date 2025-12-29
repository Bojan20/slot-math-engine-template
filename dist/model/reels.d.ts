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
export declare const BASE_REELS: ReelStrip[];
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
export declare const FREE_SPINS_REELS: ReelStrip[];
/**
 * Get reel strip length
 */
export declare function getReelLength(reelIndex: number, isFreeSpins?: boolean): number;
/**
 * Get symbol at position (with wrapping for window display)
 */
export declare function getSymbolAt(reelIndex: number, stopPosition: number, isFreeSpins?: boolean): SymbolId;
/**
 * Get visible window (3 symbols) from a stop position
 * Stop position is the TOP of the window
 */
export declare function getWindow(reelIndex: number, stopPosition: number, isFreeSpins?: boolean): SymbolId[];
/**
 * Calculate symbol distribution on a reel
 */
export interface SymbolDistribution {
    symbol: SymbolId;
    count: number;
    percentage: number;
}
export declare function getReelDistribution(reelIndex: number, isFreeSpins?: boolean): SymbolDistribution[];
/**
 * Validate reel strips
 */
export declare function validateReels(): boolean;
//# sourceMappingURL=reels.d.ts.map