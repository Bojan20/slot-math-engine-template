/**
 * SLOT MATH ENGINE TEMPLATE - Zod Validation Schemas
 *
 * TypeScript-first schema validation using Zod.
 * Provides:
 * - Runtime validation with detailed errors
 * - Automatic TypeScript type inference
 * - Fail-fast validation before simulation
 *
 * Usage:
 *   const result = GameConfigSchema.safeParse(config);
 *   if (!result.success) console.log(result.error.issues);
 */
import { z } from 'zod';
export declare const VolatilitySchema: z.ZodEnum<{
    low: "low";
    medium: "medium";
    high: "high";
    extreme: "extreme";
}>;
export declare const FreeSpinsConfigSchema: z.ZodObject<{
    scatter3Award: z.ZodNumber;
    scatter4Award: z.ZodNumber;
    scatter5Award: z.ZodNumber;
    globalMultiplierStart: z.ZodNumber;
    globalMultiplierIncrement: z.ZodNumber;
    maxRetriggers: z.ZodNumber;
}, z.core.$strip>;
export declare const MultiplierOrbConfigSchema: z.ZodObject<{
    possibleValues: z.ZodArray<z.ZodNumber>;
    weights: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
export declare const CapsConfigSchema: z.ZodObject<{
    maxWinMultiplier: z.ZodNumber;
    maxTotalMultiplier: z.ZodNumber;
    maxFreeSpinsFromRetrigger: z.ZodNumber;
}, z.core.$strip>;
export declare const SimulationDefaultsSchema: z.ZodObject<{
    defaultSpins: z.ZodNumber;
    quickSpins: z.ZodNumber;
    fullSpins: z.ZodNumber;
}, z.core.$strip>;
export declare const GameConfigSchema: z.ZodObject<{
    name: z.ZodString;
    version: z.ZodString;
    mathVersion: z.ZodString;
    numReels: z.ZodNumber;
    numRows: z.ZodNumber;
    numPaylines: z.ZodNumber;
    targetRTP: z.ZodNumber;
    targetVolatility: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        extreme: "extreme";
    }>;
    maxWinMultiplier: z.ZodNumber;
    defaultBet: z.ZodNumber;
    minBet: z.ZodNumber;
    maxBet: z.ZodNumber;
    freeSpins: z.ZodObject<{
        scatter3Award: z.ZodNumber;
        scatter4Award: z.ZodNumber;
        scatter5Award: z.ZodNumber;
        globalMultiplierStart: z.ZodNumber;
        globalMultiplierIncrement: z.ZodNumber;
        maxRetriggers: z.ZodNumber;
    }, z.core.$strip>;
    multiplierOrb: z.ZodObject<{
        possibleValues: z.ZodArray<z.ZodNumber>;
        weights: z.ZodArray<z.ZodNumber>;
    }, z.core.$strip>;
    caps: z.ZodObject<{
        maxWinMultiplier: z.ZodNumber;
        maxTotalMultiplier: z.ZodNumber;
        maxFreeSpinsFromRetrigger: z.ZodNumber;
    }, z.core.$strip>;
    simulation: z.ZodObject<{
        defaultSpins: z.ZodNumber;
        quickSpins: z.ZodNumber;
        fullSpins: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const SymbolPaySchema: z.ZodObject<{
    symbol: z.ZodString;
    pays: z.ZodRecord<z.ZodString, z.ZodNumber>;
}, z.core.$strip>;
export declare const PaytableSchema: z.ZodArray<z.ZodObject<{
    symbol: z.ZodString;
    pays: z.ZodRecord<z.ZodString, z.ZodNumber>;
}, z.core.$strip>>;
export declare const ReelStripSchema: z.ZodArray<z.ZodString>;
export declare const ReelStripsSchema: z.ZodArray<z.ZodArray<z.ZodString>>;
export declare const SimulationInputSchema: z.ZodObject<{
    spins: z.ZodNumber;
    seed: z.ZodOptional<z.ZodNumber>;
    bet: z.ZodDefault<z.ZodNumber>;
    workers: z.ZodOptional<z.ZodNumber>;
    mode: z.ZodDefault<z.ZodEnum<{
        base: "base";
        fs: "fs";
        full: "full";
    }>>;
    progressInterval: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export declare const SimReportSchema: z.ZodObject<{
    schemaVersion: z.ZodString;
    game: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
        mathVersion: z.ZodString;
        layout: z.ZodString;
        targetRTP: z.ZodNumber;
        targetVolatility: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
            extreme: "extreme";
        }>;
        maxWin: z.ZodNumber;
    }, z.core.$strip>;
    simulation: z.ZodObject<{
        spins: z.ZodNumber;
        seed: z.ZodOptional<z.ZodNumber>;
        workers: z.ZodNumber;
        mode: z.ZodString;
        engineVersion: z.ZodString;
        configHash: z.ZodString;
        durationMs: z.ZodNumber;
    }, z.core.$strip>;
    results: z.ZodObject<{
        observedRTP: z.ZodNumber;
        rtpCI: z.ZodObject<{
            lower: z.ZodNumber;
            upper: z.ZodNumber;
            confidence: z.ZodNumber;
        }, z.core.$strip>;
        hitRate: z.ZodNumber;
        avgWinOnHit: z.ZodNumber;
        volatilityIndex: z.ZodNumber;
        maxObservedWin: z.ZodNumber;
    }, z.core.$strip>;
    percentiles: z.ZodObject<{
        p50: z.ZodNumber;
        p75: z.ZodNumber;
        p90: z.ZodNumber;
        p95: z.ZodNumber;
        p99: z.ZodNumber;
        p99_9: z.ZodNumber;
        p99_99: z.ZodNumber;
    }, z.core.$strip>;
    tailBuckets: z.ZodObject<{
        ge10x: z.ZodNumber;
        ge50x: z.ZodNumber;
        ge100x: z.ZodNumber;
        ge200x: z.ZodNumber;
        ge500x: z.ZodNumber;
        ge1000x: z.ZodNumber;
    }, z.core.$strip>;
    features: z.ZodObject<{
        freeSpins: z.ZodObject<{
            triggerRate: z.ZodNumber;
            avgSpinsPerSession: z.ZodNumber;
            avgWinPerSession: z.ZodNumber;
            rtpContribution: z.ZodNumber;
        }, z.core.$strip>;
        multiplierOrb: z.ZodObject<{
            hitRate: z.ZodNumber;
            avgMultiplier: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    histogram: z.ZodArray<z.ZodObject<{
        range: z.ZodString;
        count: z.ZodNumber;
        percentage: z.ZodNumber;
    }, z.core.$strip>>;
    topWins: z.ZodArray<z.ZodObject<{
        spinIndex: z.ZodNumber;
        win: z.ZodNumber;
        isFS: z.ZodBoolean;
    }, z.core.$strip>>;
    mathLockChecklist: z.ZodOptional<z.ZodObject<{
        rtpInRange: z.ZodBoolean;
        hitRateAcceptable: z.ZodBoolean;
        maxWinReasonable: z.ZodBoolean;
        fsFrequencyOk: z.ZodBoolean;
        noAnomalies: z.ZodBoolean;
    }, z.core.$strip>>;
    tuningHints: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type Volatility = z.infer<typeof VolatilitySchema>;
export type FreeSpinsConfig = z.infer<typeof FreeSpinsConfigSchema>;
export type MultiplierOrbConfig = z.infer<typeof MultiplierOrbConfigSchema>;
export type CapsConfig = z.infer<typeof CapsConfigSchema>;
export type GameConfig = z.infer<typeof GameConfigSchema>;
export type SimulationInput = z.infer<typeof SimulationInputSchema>;
export type SimReport = z.infer<typeof SimReportSchema>;
/**
 * Validate game config with detailed error messages
 */
export declare function validateGameConfig(config: unknown): {
    success: boolean;
    data?: GameConfig;
    errors?: string[];
    warnings?: string[];
};
/**
 * Validate simulation input
 */
export declare function validateSimulationInput(input: unknown): {
    success: boolean;
    data?: SimulationInput;
    errors?: string[];
};
/**
 * Validate reel strips against symbol list
 */
export declare function validateReelStrips(strips: unknown, validSymbols: string[]): {
    success: boolean;
    errors?: string[];
    warnings?: string[];
};
/**
 * Quick validation that throws on error
 */
export declare function assertValidConfig(config: unknown): GameConfig;
//# sourceMappingURL=schemas.d.ts.map