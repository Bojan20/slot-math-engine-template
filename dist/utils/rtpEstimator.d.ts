/**
 * RTP ESTIMATOR UTILITY
 *
 * Brza procena RTP-a pre simulacije.
 * Koristi matematičke formule umesto Monte Carlo.
 *
 * NAPOMENA: Ovo je PROCENA, ne finalna vrednost!
 * Uvek verifikuj sa simulacijom.
 */
export interface PaytableEntry {
    symbol: string;
    tier: 'LP' | 'HP' | 'WILD';
    pays: {
        3: number;
        4: number;
        5: number;
    };
}
export interface ReelWeights {
    symbolCounts: Map<string, number[]>;
    stripLengths: number[];
}
export interface FeatureConfig {
    triggerRate: number;
    avgWin: number;
}
export interface RtpEstimate {
    baseGameRtp: number;
    featureRtps: {
        name: string;
        rtp: number;
    }[];
    totalRtp: number;
    breakdown: string;
}
/**
 * Calculate probability of N-of-a-kind for a symbol
 *
 * Formula for paylines:
 * P(3oak) = P(reel1) × P(reel2) × P(reel3) × (1 - P(reel4))
 *
 * Where P(reelN) = symbolCount[N] / stripLength[N] * rows
 * (simplified - assumes symbol can appear in any row)
 */
export declare function calculateSymbolProbability(symbolCounts: number[], stripLengths: number[], rows: number, wildCounts?: number[]): {
    p3oak: number;
    p4oak: number;
    p5oak: number;
};
/**
 * Estimate base game RTP from paytable and reel weights
 *
 * RTP = Σ (probability × payout) for all symbols and counts
 */
export declare function estimateBaseGameRtp(paytable: PaytableEntry[], reelWeights: ReelWeights, numPaylines: number, rows?: number): number;
/**
 * Estimate feature RTP contribution
 *
 * Feature RTP = (1 / triggerRate) × avgFeatureWin
 */
export declare function estimateFeatureRtp(feature: FeatureConfig): number;
/**
 * Estimate scatter pay RTP
 */
export declare function estimateScatterRtp(scatterCounts: number[], stripLengths: number[], rows: number, scatterPays: {
    count: number;
    pay: number;
}[]): number;
/**
 * Generate complete RTP estimate
 */
export declare function estimateFullRtp(paytable: PaytableEntry[], reelWeights: ReelWeights, numPaylines: number, rows: number, features: {
    name: string;
    config: FeatureConfig;
}[], scatterConfig?: {
    counts: number[];
    pays: {
        count: number;
        pay: number;
    }[];
}): RtpEstimate;
/**
 * Quick RTP sanity check
 */
export declare function quickRtpCheck(targetRtp: number, baseRtp: number, fsRate: number, fsAvgWin: number, hnwRate?: number, hnwAvgWin?: number, scatterRtp?: number): {
    estimated: number;
    delta: number;
    status: 'OK' | 'LOW' | 'HIGH';
};
/**
 * Calculate required feature avg win to hit target RTP
 */
export declare function requiredFeatureWin(targetRtp: number, currentBaseRtp: number, featureTriggerRate: number, otherFeaturesRtp?: number): number;
/**
 * Estimate volatility index from paytable
 */
export declare function estimateVolatilityIndex(paytable: PaytableEntry[], reelWeights: ReelWeights, numPaylines: number, rows?: number): {
    index: number;
    class: 'Low' | 'Medium' | 'High' | 'Very High';
};
export declare function printRtpSummary(estimate: RtpEstimate): void;
//# sourceMappingURL=rtpEstimator.d.ts.map