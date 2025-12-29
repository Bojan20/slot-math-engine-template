/**
 * SLOT MATH ENGINE TEMPLATE - Math Archive System
 *
 * Creates tamper-evident archive of locked math configuration.
 * Archive contains:
 * - SimReport.json (full simulation results)
 * - config_snapshot.json (frozen config)
 * - MATH_LOCK.json (lock verification)
 * - MANIFEST.sha256 (checksums of all files)
 *
 * Archive format: .tar.gz for:
 * - Single file delivery
 * - Built-in compression
 * - Universal compatibility
 * - Easy verification
 */
/**
 * Manifest entry for a file
 */
export interface ManifestEntry {
    path: string;
    sha256: string;
    size: number;
    modifiedAt: string;
}
/**
 * Full manifest structure
 */
export interface ArchiveManifest {
    schemaVersion: string;
    createdAt: string;
    game: string;
    mathVersion: string;
    files: ManifestEntry[];
    totalSize: number;
    archiveHash?: string;
}
/**
 * Calculate SHA-256 hash of a file
 */
export declare function calculateFileHash(filePath: string): string;
/**
 * Calculate SHA-256 hash of string content
 */
export declare function calculateContentHash(content: string | Buffer): string;
/**
 * Generate manifest for a directory
 */
export declare function generateManifest(dirPath: string, mathVersion: string, game?: string): ArchiveManifest;
/**
 * Write manifest file
 */
export declare function writeManifest(dirPath: string, manifest: ArchiveManifest): string;
/**
 * Format manifest for human-readable output
 */
export declare function formatManifest(manifest: ArchiveManifest): string;
/**
 * Parse manifest from file content
 */
export declare function parseManifest(content: string): ManifestEntry[];
/**
 * Verify all files against manifest
 */
export declare function verifyManifest(dirPath: string, manifest: ArchiveManifest): {
    valid: boolean;
    errors: string[];
};
/**
 * Create tar archive from directory
 */
export declare function createTarGz(sourceDir: string, outputPath: string, manifest: ArchiveManifest): Promise<void>;
/**
 * Create complete math archive
 */
export declare function createMathArchive(lockDir: string, mathVersion: string, outputPath?: string): Promise<{
    archivePath: string;
    manifest: ArchiveManifest;
}>;
/**
 * Quick verification of archive integrity
 */
export declare function verifyArchiveHash(archivePath: string, expectedHash: string): boolean;
/**
 * Print archive info
 */
export declare function printArchiveInfo(manifest: ArchiveManifest): void;
//# sourceMappingURL=mathArchive.d.ts.map