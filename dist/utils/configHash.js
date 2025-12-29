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
import xxhash from 'xxhash-wasm';
// Cache the xxhash instance
let xxhashInstance = null;
/**
 * Initialize xxhash (call once at startup)
 */
export async function initXXHash() {
    if (!xxhashInstance) {
        xxhashInstance = await xxhash();
    }
}
/**
 * Get xxhash instance (initializes if needed)
 */
async function getXXHash() {
    if (!xxhashInstance) {
        await initXXHash();
    }
    return xxhashInstance;
}
/**
 * JSON replacer that sorts object keys for deterministic output
 */
function sortedReplacer(_key, value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value)
            .sort()
            .reduce((sorted, key) => {
            sorted[key] = value[key];
            return sorted;
        }, {});
    }
    return value;
}
/**
 * Hash a string using xxHash64
 */
export async function hashString(input) {
    const h = await getXXHash();
    return h.h64(input).toString(16);
}
/**
 * Hash an object (JSON serialized) using xxHash64
 * Keys are sorted for deterministic output
 */
export async function hashObject(obj) {
    const json = JSON.stringify(obj, sortedReplacer);
    return hashString(json);
}
/**
 * Generate a config fingerprint
 */
export async function generateConfigFingerprint(config) {
    const hash = await hashObject(config);
    const timestamp = Date.now();
    return {
        version: 1,
        hash,
        algorithm: 'xxhash64',
        timestamp,
        isoDate: new Date(timestamp).toISOString()
    };
}
/**
 * Compare two fingerprints
 */
export function compareFingerprints(a, b) {
    return a.hash === b.hash;
}
/**
 * Create a simulation manifest
 * Full audit trail for certification
 */
export async function createSimulationManifest(config, simulationParams) {
    const configFingerprint = await generateConfigFingerprint(config);
    const paramsFingerprint = await generateConfigFingerprint(simulationParams);
    // Combined fingerprint
    const combinedHash = await hashString(configFingerprint.hash + paramsFingerprint.hash);
    return {
        manifestVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        config: {
            fingerprint: configFingerprint,
            raw: config
        },
        simulation: {
            fingerprint: paramsFingerprint,
            params: simulationParams
        },
        combinedHash,
        reproducibility: {
            note: 'Same config + params + seed = identical results',
            engineVersion: simulationParams.engineVersion
        }
    };
}
/**
 * Verify manifest integrity
 */
export async function verifyManifest(manifest) {
    const configHash = await hashObject(manifest.config.raw);
    const paramsHash = await hashObject(manifest.simulation.params);
    const combinedHash = await hashString(configHash + paramsHash);
    return {
        valid: configHash === manifest.config.fingerprint.hash &&
            paramsHash === manifest.simulation.fingerprint.hash &&
            combinedHash === manifest.combinedHash,
        configMatch: configHash === manifest.config.fingerprint.hash,
        paramsMatch: paramsHash === manifest.simulation.fingerprint.hash,
        combinedMatch: combinedHash === manifest.combinedHash
    };
}
/**
 * Quick hash for caching (sync version using FNV-1a)
 * Use for high-frequency operations where async is too slow
 */
export function quickHash(str) {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 16777619) >>> 0;
    }
    return hash;
}
/**
 * Format hash for display (shortened)
 */
export function formatHash(hash, length = 8) {
    return hash.substring(0, length);
}
/**
 * Create deterministic simulation ID from config and seed
 */
export async function createSimulationId(config, seed) {
    const configHash = await hashObject(config);
    const seedHash = await hashString(seed.toString());
    const timestamp = Date.now().toString(36);
    return `SIM-${formatHash(configHash, 6)}-${formatHash(seedHash, 4)}-${timestamp}`;
}
//# sourceMappingURL=configHash.js.map