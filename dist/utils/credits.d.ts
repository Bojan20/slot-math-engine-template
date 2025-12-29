/**
 * SLOT MATH ENGINE TEMPLATE - Integer Credits System
 *
 * All slot math calculations use integer credits to avoid
 * floating-point precision errors. This is critical for:
 * - Deterministic results across platforms
 * - Exact RTP calculations (no cumulative rounding errors)
 * - Certification compliance
 *
 * CREDIT_SCALE = 100 means:
 * - 1 bet = 100 credits
 * - 0.01 bet = 1 credit
 * - All wins are calculated in credits, converted to money at output
 */
/**
 * Credit scale factor
 * 100 = 2 decimal places (0.01 precision)
 * 1000 = 3 decimal places (0.001 precision)
 */
export declare const CREDIT_SCALE = 100;
/**
 * Convert bet amount to credits
 */
export declare function betToCredits(bet: number): number;
/**
 * Convert credits back to money amount
 */
export declare function creditsToMoney(credits: number): number;
/**
 * Calculate win in credits (deterministic integer math)
 * @param betCredits Bet amount in credits
 * @param multiplier Win multiplier (e.g., 5 for 5x)
 * @returns Win amount in credits
 */
export declare function calculateWinCredits(betCredits: number, multiplier: number): number;
/**
 * Calculate win from paytable payout (payout is already in bet multiples)
 * @param betCredits Bet amount in credits
 * @param payout Paytable payout value (e.g., 250 for 250x)
 * @returns Win amount in credits
 */
export declare function calculatePayoutCredits(betCredits: number, payout: number): number;
/**
 * Apply multiplier to existing win credits
 * @param winCredits Current win in credits
 * @param multiplier Multiplier to apply
 * @returns New win amount in credits
 */
export declare function applyMultiplier(winCredits: number, multiplier: number): number;
/**
 * Sum multiple credit amounts (safe for large sums)
 * Uses compensation for accumulated rounding if needed
 */
export declare function sumCredits(...amounts: number[]): number;
/**
 * Credit accumulator for large simulations
 * Uses standard number for counts up to Number.MAX_SAFE_INTEGER (~9 quadrillion)
 * which is sufficient for any practical simulation
 */
export declare class CreditAccumulator {
    private totalCredits;
    private count;
    add(credits: number): void;
    getTotal(): number;
    getCount(): number;
    getTotalAsMoney(): number;
    getMeanCredits(): number;
    getMeanAsMoney(): number;
    merge(other: CreditAccumulator): void;
    reset(): void;
}
/**
 * Validate that a value is a valid credit amount
 */
export declare function isValidCreditAmount(value: number): boolean;
/**
 * Format credits as money string
 */
export declare function formatCredits(credits: number, currency?: string): string;
/**
 * Win multiplier from credits
 * @param winCredits Win amount in credits
 * @param betCredits Bet amount in credits
 * @returns Win multiplier (e.g., 5.5 for 5.5x)
 */
export declare function getWinMultiplier(winCredits: number, betCredits: number): number;
//# sourceMappingURL=credits.d.ts.map