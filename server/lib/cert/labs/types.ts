/**
 * CORTI W210 Faza 600.0 — Lab Submission Packager.
 *
 * Generic lab adapter interface. Four concrete adapters live in
 * `./gli.ts`, `./bmm.ts`, `./ecogra.ts`, `./nmi.ts`.
 *
 * v1.0 covers ~80% of typical Tier-1 lab submission shape. Edge cases
 * (jurisdiction-specific addenda, e.g. KSA Dutch translations, AGCO
 * skill-based override) are tracked in W21x waves.
 */

import type { HsmSignature } from '../../../state/hsm.js';

export type LabName = 'GLI' | 'BMM' | 'eCOGRA' | 'NMi';
export type BundleFormat = 'zip' | 'tar' | 'gli-pkg';

/**
 * Input to every lab adapter. The packager script in
 * `scripts/cert-dossier-build.mjs` is responsible for collecting these
 * artifacts from the repo before handing off to the adapter.
 */
export interface CertPackInput {
  vendor: string;            // e.g. 'slot-math-engine'
  game: string;              // e.g. 'quick-hit-platinum'
  version: string;           // e.g. '1.0.0'
  jurisdiction: string;      // e.g. 'UKGC', 'MGA', 'AGCO', 'AU-NCPF', 'KSA'
  /** Build/commit SHA at time of pack. */
  repoSha: string;
  /** UTC ISO timestamp the pack was assembled. */
  generatedAt: string;

  /** Game theoretic numbers usually surfaced on the cover sheet. */
  rtp: number;
  hitFrequency: number;
  variance: number;
  maxWinX: number;

  /** Pre-collected artifact blobs the adapter writes into the bundle. */
  artifacts: CertArtifact[];

  /** Cover-letter contact block. */
  contact: {
    company: string;
    name: string;
    email: string;
    phone?: string;
    address?: string;
  };
}

export interface CertArtifact {
  /** Logical id, e.g. 'PAR_SHEET_JSON', 'TESTU01_BIGCRUSH', 'MDD_PDF'. */
  id: string;
  /** Destination path inside the bundle. */
  bundlePath: string;
  /** Raw bytes to write. */
  data: Buffer | Uint8Array;
  /** Optional MIME / kind label. */
  mime?: string;
}

export interface CertBundle {
  /** Final bundle bytes (zip / tar.gz / etc). */
  data: Buffer;
  /** Suggested filename. */
  filename: string;
  /** SHA-256 of the bundle bytes (lowercase hex). */
  sha256: string;
  /** Bundle MIME hint. */
  mime: string;
  /** Per-file manifest (path → sha256). Useful for downstream auditing. */
  manifest: BundleManifestEntry[];
  /** HSM detached signature over the canonical manifest JSON. */
  signature?: HsmSignature;
}

export interface BundleManifestEntry {
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface LabAdapter {
  readonly labName: LabName;
  readonly jurisdictionsSupported: string[];
  readonly bundleFormat: BundleFormat;
  readonly requiredDocuments: string[];

  packBundle(input: CertPackInput): Promise<CertBundle>;
  validateInput(input: CertPackInput): ValidationResult;
  generateCoverLetter(input: CertPackInput): string;
}

/** Helper exposed to all adapters — locates a known-id artifact. */
export function findArtifact(
  input: CertPackInput,
  id: string
): CertArtifact | undefined {
  return input.artifacts.find((a) => a.id === id);
}

/** Common validators reused by every adapter. */
export function validateCommon(input: CertPackInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input.vendor) errors.push('vendor_required');
  if (!input.game) errors.push('game_required');
  if (!input.version) errors.push('version_required');
  if (!input.jurisdiction) errors.push('jurisdiction_required');
  if (input.rtp < 0 || input.rtp > 1) errors.push('rtp_out_of_range');
  if (input.hitFrequency < 0 || input.hitFrequency > 1) {
    errors.push('hit_frequency_out_of_range');
  }
  if (input.maxWinX <= 0) errors.push('max_win_x_must_be_positive');
  if (!input.contact?.email || !input.contact.email.includes('@')) {
    errors.push('contact_email_required');
  }
  if (input.artifacts.length === 0) warnings.push('no_artifacts');
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Minimal in-memory zip builder. The four adapter modules all need a
 * deterministic zip (no time-dependent fields) so signatures verify
 * byte-for-byte. We use stored (no compression) — bundles are small
 * enough that not having deflate keeps the file format trivial and
 * avoids extra deps.
 */
export function buildZip(
  files: Array<{ path: string; data: Buffer | Uint8Array }>
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = Buffer.from(f.path, 'utf8');
    const dataBytes = Buffer.from(f.data);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // local file header
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(0, 8);            // method = stored
    local.writeUInt16LE(0, 10);           // mod time
    local.writeUInt16LE(0x21, 12);        // mod date (deterministic: 1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, dataBytes);

    // central directory header
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);

    offset += local.length + nameBytes.length + dataBytes.length;
  }

  const centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuffer, eocd]);
}

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Minimal tar.gz-like archive — actually a tar concatenation (no gzip)
 * with a `.tar` extension. We sidestep the zlib dep dance for v1 by
 * exposing the raw tar. BMM accepts tar; downstream compression can be
 * applied by a wrapper that has zlib loaded.
 */
export function buildTar(
  files: Array<{ path: string; data: Buffer | Uint8Array }>
): Buffer {
  const blocks: Buffer[] = [];
  for (const f of files) {
    const header = Buffer.alloc(512);
    header.write(f.path.slice(0, 100), 0, 'utf8');
    header.write('0000644 ', 100, 'ascii');
    header.write('0000000 ', 108, 'ascii');
    header.write('0000000 ', 116, 'ascii');
    const sizeOctal = f.data.length.toString(8).padStart(11, '0') + ' ';
    header.write(sizeOctal, 124, 'ascii');
    header.write('00000000000 ', 136, 'ascii');
    header.write('        ', 148, 'ascii'); // checksum placeholder
    header.write('0', 156, 'ascii');         // typeflag = regular file
    header.write('ustar  ', 257, 'ascii');
    let chk = 0;
    for (let i = 0; i < 512; i++) chk += header[i];
    header.write(chk.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
    blocks.push(header);
    const data = Buffer.from(f.data);
    blocks.push(data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad > 0) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024)); // end-of-archive
  return Buffer.concat(blocks);
}
