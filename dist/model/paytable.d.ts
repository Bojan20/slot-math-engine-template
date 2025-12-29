/**
 * SLOT MATH ENGINE TEMPLATE - Paytable Definitions
 *
 * Paytable design philosophy:
 * - LP symbols: Low frequency wins, sustain base game cadence
 * - HP symbols: Premium pays, create excitement moments
 * - Scatter: Pays anywhere + triggers Free Spins (1 per reel max)
 *
 * All pays are expressed as multipliers of TOTAL BET
 *
 * Target RTP allocation:
 * - Base game: ~45%
 * - Free Spins: ~20%
 * - Hold & Win: ~31%
 * - Total: 96%
 *
 * CUSTOMIZATION:
 * 1. Adjust LINE_PAYTABLE values to tune base game RTP
 * 2. Adjust SCATTER_PAYTABLE for FS trigger rewards
 * 3. Run simulation to verify RTP after changes
 */
import { SymbolId } from './symbols.js';
export interface PaytableEntry {
    symbol: SymbolId;
    pays: {
        3: number;
        4: number;
        5: number;
    };
}
export interface ScatterPayEntry {
    count: number;
    pay: number;
    freeSpinsAwarded: number;
}
/**
 * Line pays - expressed as total bet multipliers
 *
 * Pay philosophy:
 * - LP 3oak: 0.6-0.9x (sustain, frequent but small)
 * - LP 5oak: 5-9x (occasional nice hit)
 * - HP 3oak: 2-3x (excitement trigger)
 * - HP 5oak: 40-60x (premium moments)
 */
export declare const LINE_PAYTABLE: PaytableEntry[];
/**
 * Scatter pays - total bet multipliers, pays anywhere
 * Also triggers Free Spins
 */
export declare const SCATTER_PAYTABLE: ScatterPayEntry[];
/**
 * Get pay for a symbol and match count
 */
export declare function getLinePay(symbol: SymbolId, count: number): number;
/**
 * Get scatter pay and FS award for a given count
 */
export declare function getScatterResult(count: number): ScatterPayEntry | null;
/**
 * Build a lookup map for fast paytable access
 */
export type PaytableLookup = Map<SymbolId, {
    3: number;
    4: number;
    5: number;
}>;
export declare function buildPaytableLookup(): PaytableLookup;
export declare const PAYTABLE_LOOKUP: PaytableLookup;
//# sourceMappingURL=paytable.d.ts.map