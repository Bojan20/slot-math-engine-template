/**
 * REEL STRIPS TEMPLATE
 *
 * Kopiraj u reels.ts i prilagodi za svoju igru.
 *
 * KLJUČNE FORMULE:
 * - P(symbol in window) = (count / strip_length) × rows
 * - Za FS trigger ~1/117-140: staviti 2 scattera po rilu na 54-stop strip
 * - Za H&W trigger ~1/190-200: staviti 6-7 specijalnih po rilu
 */
import { SymbolId } from './symbols.js';
export type ReelStrip = SymbolId[];
/**
 * BASE GAME REEL STRIPS
 *
 * Guidelines per reel (54 stops, 5x3 grid):
 * - Scatters: 2 per reel → ~1/117-140 FS trigger
 * - Wilds: 2-3 per reel → ~5-8% wild presence
 * - HP symbols: 2-4 per reel (rarer = higher volatility)
 * - LP symbols: Fill remaining (~35-40)
 * - Special (H&W trigger): 6-7 per reel → ~1/190-200 trigger
 *
 * MATH VALIDATION:
 * - P(scatter in window) = 2/54 × 3 = 11.1%
 * - P(3+ scatters) ≈ C(5,3) × 0.111³ × 0.889² ≈ 1/117
 */
export declare const BASE_REELS: ReelStrip[];
/**
 * FREE SPINS REEL STRIPS
 *
 * Differences from base:
 * - MORE Wilds: 5-6 per reel (10-12%) → bigger wins
 * - LESS Specials: 4-5 per reel → H&W rarer in FS
 * - Same Scatters: 2 per reel → retrigger ~10-12%
 * - Shorter strips: 50 stops → higher symbol density
 */
export declare const FREE_SPINS_REELS: ReelStrip[];
export declare function getReelLength(reelIndex: number, isFreeSpins?: boolean): number;
export declare function getSymbolAtPosition(reelIndex: number, stopIndex: number, isFreeSpins?: boolean): SymbolId;
export declare function getWindow(reelIndex: number, stopIndex: number, windowSize: number, isFreeSpins?: boolean): SymbolId[];
export declare function validateReelStrips(): boolean;
export declare function analyzeReelStrip(reels: ReelStrip[], name: string): void;
//# sourceMappingURL=reels.template.d.ts.map