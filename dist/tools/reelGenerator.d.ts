/**
 * SLOT MATH ENGINE TEMPLATE - Professional Reel Strip Generator
 *
 * Constraint-based algorithmic reel strip generation with:
 * - Symbol placement rules (spacing, clustering, adjacency)
 * - Visual flow optimization
 * - Near-miss management (ethical, compliance-safe)
 * - Automatic validation
 *
 * Industry-standard approach used by top-tier slot studios.
 */
import { SymbolId } from '../model/symbols.js';
export interface SymbolRequirement {
    symbol: SymbolId;
    count: number;
    minSpacing?: number;
    maxSpacing?: number;
}
export interface AdjacencyRule {
    symbol: SymbolId;
    forbidden: SymbolId[];
    preferred: SymbolId[];
    bufferSize?: number;
}
export interface ClusterRule {
    symbols: SymbolId[];
    maxConsecutive: number;
}
export interface ReelConstraints {
    reelLength: number;
    requirements: SymbolRequirement[];
    adjacencyRules: AdjacencyRule[];
    clusterRules: ClusterRule[];
    maxConsecutiveLP: number;
    maxConsecutiveSameSymbol: number;
    hpIsolation: boolean;
    specialIsolation: boolean;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    stats: {
        symbolCounts: Map<SymbolId, number>;
        minSpacings: Map<SymbolId, number>;
        maxConsecutive: Map<SymbolId, number>;
        adjacencyViolations: number;
    };
}
export interface GenerationResult {
    strip: SymbolId[];
    validation: ValidationResult;
    iterations: number;
    seed: number;
}
export declare function validateReelStrip(strip: SymbolId[], constraints: ReelConstraints): ValidationResult;
export declare function generateReelStrip(constraints: ReelConstraints, seed?: number, maxIterations?: number): GenerationResult;
export declare const DEFAULT_BASE_CONSTRAINTS: ReelConstraints;
export declare const DEFAULT_FS_CONSTRAINTS: ReelConstraints;
export interface BatchGenerationResult {
    baseReels: GenerationResult[];
    fsReels: GenerationResult[];
    allValid: boolean;
    summary: {
        totalIterations: number;
        baseSuccess: number;
        fsSuccess: number;
    };
}
export declare function generateAllReels(baseSeed?: number): BatchGenerationResult;
export declare function stripToCode(strip: SymbolId[], reelName: string): string;
export declare function printValidationReport(result: GenerationResult, name: string): void;
//# sourceMappingURL=reelGenerator.d.ts.map