/**
 * PAYTABLE TEMPLATE
 *
 * Kopiraj u paytable.ts i prilagodi vrednosti.
 *
 * SVE VREDNOSTI SU x TOTAL BET (ne line bet!)
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
 * LINE PAYS
 *
 * Vodič za vrednosti (96% RTP, medium volatility):
 *
 * | Tier    | 3oak      | 4oak     | 5oak      |
 * |---------|-----------|----------|-----------|
 * | LP-Low  | 0.4-0.6x  | 1.5-2x   | 4-6x      |
 * | LP-Mid  | 0.6-0.9x  | 2-3x     | 6-9x      |
 * | HP-Low  | 1.5-2x    | 5-8x     | 25-40x    |
 * | HP-Mid  | 2-2.5x    | 8-12x    | 40-50x    |
 * | HP-Top  | 2.5-3.5x  | 10-15x   | 50-70x    |
 * | Wild    | =HP-Top   | =HP-Top  | =HP-Top   |
 */
export declare const LINE_PAYTABLE: PaytableEntry[];
/**
 * SCATTER PAYS
 *
 * Scatter plaća anywhere (ne mora biti na payline)
 * Plus triggeruje Free Spins
 */
export declare const SCATTER_PAYTABLE: ScatterPayEntry[];
export declare function getLinePay(symbol: SymbolId, count: number): number;
export declare function getScatterResult(count: number): ScatterPayEntry | null;
export type PaytableLookup = Map<SymbolId, {
    3: number;
    4: number;
    5: number;
}>;
export declare function buildPaytableLookup(): PaytableLookup;
export declare const PAYTABLE_LOOKUP: PaytableLookup;
//# sourceMappingURL=paytable.template.d.ts.map