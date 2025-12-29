/**
 * Hash utilities for deterministic seed derivation and config checksums
 */
/**
 * FNV-1a 64-bit hash for fast deterministic seed derivation
 * Returns a 32-bit number suitable for RNG seeding
 */
export declare function hash64(baseSeed: number, workerIndex: number): number;
/**
 * Derive deterministic worker seeds from base seed
 * Ensures each worker gets a unique but reproducible seed
 */
export declare function deriveWorkerSeeds(baseSeed: number, workerCount: number): number[];
/**
 * Calculate SHA-256 checksum of an object (for config verification)
 */
export declare function checksumObject(obj: unknown): string;
/**
 * Calculate SHA-256 checksum of a string
 */
export declare function checksumString(str: string): string;
/**
 * Get git commit hash (if available)
 */
export declare function getGitCommit(): string | null;
/**
 * Murmur3 32-bit hash for additional mixing
 */
export declare function murmur3(key: number, seed?: number): number;
//# sourceMappingURL=hash.d.ts.map