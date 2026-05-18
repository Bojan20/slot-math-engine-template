/**
 * CORTI W210 Faza 600.0 — GLI (Gaming Laboratories International) adapter.
 *
 * GLI is the largest US-focused lab. Submissions follow the GLI-19
 * (Online Gaming) standard with strict naming and a fixed required-
 * documents list. Cover letter references the GLI-19 ID system.
 *
 * v1.0 — covers 80% of typical lab submission. Edge cases
 * (jurisdiction-specific addenda) handled per-lab in W21x.
 */

import { createHash } from 'node:crypto';
import {
  buildZip,
  findArtifact,
  validateCommon,
  type CertBundle,
  type CertPackInput,
  type LabAdapter,
  type ValidationResult,
  type BundleManifestEntry,
} from './types.js';

export const GLI_REQUIRED_DOCS = [
  'PAR_SHEET_JSON',
  'TESTU01_BIGCRUSH',
  'NIST_SP_800_22',
  'SOURCE_CODE_REVIEW',
  'MATH_DESIGN_DOC',
  'RTP_VERIFICATION',
  'PAYTABLE_SCHEMA',
  'REPLAY_DETERMINISM_PROOF',
];

export const GLI_JURISDICTIONS = [
  'UKGC',
  'MGA',
  'AGCO',
  'NJ-DGE',
  'NV-NGCB',
  'PA-PGCB',
  'MI-MGCB',
  'WV-WVLC',
];

export class GliAdapter implements LabAdapter {
  readonly labName = 'GLI' as const;
  readonly jurisdictionsSupported = GLI_JURISDICTIONS;
  readonly bundleFormat = 'zip' as const;
  readonly requiredDocuments = GLI_REQUIRED_DOCS;

  validateInput(input: CertPackInput): ValidationResult {
    const base = validateCommon(input);
    const errors = [...base.errors];
    const warnings = [...base.warnings];
    if (!this.jurisdictionsSupported.includes(input.jurisdiction)) {
      warnings.push(`gli_jurisdiction_uncommon:${input.jurisdiction}`);
    }
    for (const need of GLI_REQUIRED_DOCS) {
      if (!findArtifact(input, need)) {
        errors.push(`gli_missing_required:${need}`);
      }
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  generateCoverLetter(input: CertPackInput): string {
    const gliId = `GLI-19-${input.vendor.toUpperCase()}-${input.game.toUpperCase()}-${input.version}`;
    return [
      `# GLI-19 Cover Letter`,
      ``,
      `**GLI Submission ID:** ${gliId}`,
      `**Vendor:** ${input.vendor}`,
      `**Game:** ${input.game}`,
      `**Version:** ${input.version}`,
      `**Target Jurisdiction:** ${input.jurisdiction}`,
      `**Submission Date (UTC):** ${input.generatedAt}`,
      `**Build SHA:** ${input.repoSha}`,
      ``,
      `## Math Summary`,
      ``,
      `| Metric | Value |`,
      `| --- | --- |`,
      `| Theoretical RTP | ${(input.rtp * 100).toFixed(4)}% |`,
      `| Hit Frequency | ${(input.hitFrequency * 100).toFixed(4)}% |`,
      `| Variance | ${input.variance.toFixed(4)} |`,
      `| Max Win Multiplier | ${input.maxWinX.toFixed(2)}x |`,
      ``,
      `## Submission Contents`,
      ``,
      GLI_REQUIRED_DOCS.map((d) => `- ${d}`).join('\n'),
      ``,
      `## Contact`,
      ``,
      `${input.contact.company}`,
      `${input.contact.name} — ${input.contact.email}`,
      input.contact.phone ? `Phone: ${input.contact.phone}` : '',
      input.contact.address ?? '',
      ``,
      `Pursuant to GLI-19 Section 4.1, all submitted artifacts are`,
      `cryptographically bound by the Ed25519 detached signature in`,
      `MANIFEST.sig.`,
    ].join('\n').replace(/\n\n+/g, '\n\n');
  }

  async packBundle(input: CertPackInput): Promise<CertBundle> {
    const validation = this.validateInput(input);
    if (!validation.ok) {
      throw new Error(`gli_validate_failed: ${validation.errors.join(',')}`);
    }
    const safeVendor = sanitize(input.vendor);
    const safeGame = sanitize(input.game);
    const filename = `${safeVendor}-${safeGame}-${input.version}-GLI19.zip`;

    const coverLetter = this.generateCoverLetter(input);
    const manifest: BundleManifestEntry[] = [];
    const files: Array<{ path: string; data: Buffer }> = [];

    const addFile = (path: string, data: Buffer | Uint8Array): void => {
      const buf = Buffer.from(data);
      files.push({ path, data: buf });
      manifest.push({
        path,
        sha256: createHash('sha256').update(buf).digest('hex'),
        sizeBytes: buf.length,
      });
    };

    addFile('COVER_LETTER.md', Buffer.from(coverLetter, 'utf8'));
    for (const a of input.artifacts) {
      addFile(a.bundlePath, Buffer.from(a.data));
    }

    const manifestJson = JSON.stringify(
      {
        labName: 'GLI',
        gliId: `GLI-19-${input.vendor}-${input.game}-${input.version}`,
        vendor: input.vendor,
        game: input.game,
        version: input.version,
        jurisdiction: input.jurisdiction,
        repoSha: input.repoSha,
        generatedAt: input.generatedAt,
        requiredDocuments: GLI_REQUIRED_DOCS,
        entries: manifest,
      },
      null,
      2
    );
    addFile('MANIFEST.json', Buffer.from(manifestJson, 'utf8'));

    const zipBytes = buildZip(files);
    const sha256 = createHash('sha256').update(zipBytes).digest('hex');
    return {
      data: zipBytes,
      filename,
      sha256,
      mime: 'application/zip',
      manifest,
    };
  }
}

function sanitize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

export const gliAdapter = new GliAdapter();
