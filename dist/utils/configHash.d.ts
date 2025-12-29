/**
 * SLOT MATH ENGINE TEMPLATE - Config Hashing & Fingerprinting
 *
 * Uses xxhash-wasm for fast, deterministic config hashing.
 * Critical for:
 * - Simulation reproducibility
 * - Certification audits
 * - Config versioning
 * - Cache invalidation
 *
 * xxHash is 10x faster than SHA-256 and perfect for non-crypto hashing.
 */
/**
 * Initialize xxhash (call once at startup)
 */
export declare function initXXHash(): Promise<void>;
/**
 * Hash a string using xxHash64
 */
export declare function hashString(input: string): Promise<string>;
/**
 * Hash an object (JSON serialized) using xxHash64
 * Keys are sorted for deterministic output
 */
export declare function hashObject(obj: unknown): Promise<string>;
/**
 * Config fingerprint structure
 */
export interface ConfigFingerprint {
    version: number;
    hash: string;
    algorithm: string;
    timestamp: number;
    isoDate: string;
}
/**
 * Generate a config fingerprint
 */
export declare function generateConfigFingerprint(config: unknown): Promise<ConfigFingerprint>;
/**
 * Compare two fingerprints
 */
export declare function compareFingerprints(a: ConfigFingerprint, b: ConfigFingerprint): boolean;
/**
 * Simulation manifest for audit trail
 */
export interface SimulationManifest {
    manifestVersion: string;
    createdAt: string;
    config: {
        fingerprint: ConfigFingerprint;
        raw: unknown;
    };
    simulation: {
        fingerprint: ConfigFingerprint;
        params: {
            spins: number;
            seed?: number;
            seeds?: number;
            engineVersion: string;
        };
    };
    combinedHash: string;
    reproducibility: {
        note: string;
        engineVersion: string;
    };
}
/**
 * Create a simulation manifest
 * Full audit trail for certification
 */
export declare function createSimulationManifest(config: unknown, simulationParams: {
    spins: number;
    seed?: number;
    seeds?: number;
    engineVersion: string;
}): Promise<SimulationManifest>;
/**
 * Verify manifest integrity
 */
export declare function verifyManifest(manifest: SimulationManifest): Promise<{
    valid: boolean;
    configMatch: boolean;
    paramsMatch: boolean;
    combinedMatch: boolean;
}>;
/**
 * Quick hash for caching (sync version using FNV-1a)
 * Use for high-frequency operations where async is too slow
 */
export declare function quickHash(str: string): number;
/**
 * Format hash for display (shortened)
 */
export declare function formatHash(hash: string, length?: number): string;
/**
 * Create deterministic simulation ID from config and seed
 */
export declare function createSimulationId(config: unknown, seed: number): Promise<string>;
//# sourceMappingURL=configHash.d.ts.map