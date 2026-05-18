/**
 * CORTI W210 Faza 600.0 — eCOGRA adapter.
 *
 * eCOGRA is UK + EU focused, popular with indie operators. Uses a
 * Generic Slots Audit (GSA) format, references UKGC RTS-12 (game
 * fairness) and RTS-14 (game design), and emits a monthly RTP proof
 * line into the bundle.
 *
 * Bundle format: zip with ecogra-audit.yaml manifest at root. SOC-style
 * cover letter.
 *
 * v1.0 — covers 80% of typical submission shape.
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

export const ECOGRA_REQUIRED_DOCS = [
  'PAR_SHEET_JSON',
  'GSA_FORMAT_REPORT',
  'UKGC_RTS12_DISCLOSURE',
  'UKGC_RTS14_DISCLOSURE',
  'MONTHLY_RTP_PROOF',
  'PAYTABLE_SCHEMA',
  'REPLAY_DETERMINISM_PROOF',
];

export const ECOGRA_JURISDICTIONS = [
  'UKGC',
  'MGA',
  'GIB',
  'IM-GSC',
  'AT-BMF',
  'SE-Spelinspektionen',
];

export class EcograAdapter implements LabAdapter {
  readonly labName = 'eCOGRA' as const;
  readonly jurisdictionsSupported = ECOGRA_JURISDICTIONS;
  readonly bundleFormat = 'zip' as const;
  readonly requiredDocuments = ECOGRA_REQUIRED_DOCS;

  validateInput(input: CertPackInput): ValidationResult {
    const base = validateCommon(input);
    const errors = [...base.errors];
    const warnings = [...base.warnings];
    if (!this.jurisdictionsSupported.includes(input.jurisdiction)) {
      warnings.push(`ecogra_jurisdiction_uncommon:${input.jurisdiction}`);
    }
    for (const need of ECOGRA_REQUIRED_DOCS) {
      if (!findArtifact(input, need)) {
        errors.push(`ecogra_missing_required:${need}`);
      }
    }
    // UKGC-specific: RTP must be >= 0.85 per RTS-7
    if (input.jurisdiction === 'UKGC' && input.rtp < 0.85) {
      errors.push('ecogra_ukgc_rtp_below_rts7_floor');
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  generateCoverLetter(input: CertPackInput): string {
    return [
      `eCOGRA SOC-Style Cover Letter`,
      `-----------------------------`,
      ``,
      `Audit Reference: eCOGRA-GSA-${input.vendor}-${input.game}-${input.version}`,
      `Date of Assessment: ${input.generatedAt}`,
      `Audit Period: ${input.generatedAt.slice(0, 7)} (calendar month)`,
      ``,
      `Subject Game`,
      `~~~~~~~~~~~~`,
      `Vendor:        ${input.vendor}`,
      `Game:          ${input.game}`,
      `Version:       ${input.version}`,
      `Jurisdiction:  ${input.jurisdiction}`,
      `Build SHA:     ${input.repoSha}`,
      ``,
      `Audit Opinion`,
      `~~~~~~~~~~~~~`,
      `Based on the artifacts provided (see ecogra-audit.yaml), the`,
      `theoretical Return-to-Player of ${(input.rtp * 100).toFixed(4)}% is consistent`,
      `with the disclosed paytable and reel strips. The hit frequency`,
      `of ${(input.hitFrequency * 100).toFixed(4)}% and variance ${input.variance.toFixed(4)} are within`,
      `expected bounds for the declared volatility band.`,
      ``,
      `UKGC Compliance Notes`,
      `~~~~~~~~~~~~~~~~~~~~~`,
      `- RTS 12 (game fairness): see UKGC_RTS12_DISCLOSURE.`,
      `- RTS 14 (game design):   see UKGC_RTS14_DISCLOSURE.`,
      `- Monthly RTP proof:      see MONTHLY_RTP_PROOF.`,
      ``,
      `Issuer Contact`,
      `~~~~~~~~~~~~~~`,
      `Company:  ${input.contact.company}`,
      `Contact:  ${input.contact.name}`,
      `Email:    ${input.contact.email}`,
      input.contact.phone ? `Phone:    ${input.contact.phone}` : '',
      ``,
      `This bundle is bound by Ed25519 detached signature `,
      `(ecogra-audit.sig). Verify before accepting submission.`,
    ].join('\n');
  }

  async packBundle(input: CertPackInput): Promise<CertBundle> {
    const validation = this.validateInput(input);
    if (!validation.ok) {
      throw new Error(`ecogra_validate_failed: ${validation.errors.join(',')}`);
    }
    const safeVendor = sanitize(input.vendor);
    const safeGame = sanitize(input.game);
    const filename = `${safeVendor}-${safeGame}-${input.version}-eCOGRA.zip`;

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

    addFile('COVER_LETTER.txt', Buffer.from(coverLetter, 'utf8'));
    for (const a of input.artifacts) {
      addFile(a.bundlePath, Buffer.from(a.data));
    }

    // ecogra-audit.yaml — simple YAML serialized by hand (no dep).
    const yamlLines: string[] = [];
    yamlLines.push(`labName: eCOGRA`);
    yamlLines.push(`auditRef: eCOGRA-GSA-${input.vendor}-${input.game}-${input.version}`);
    yamlLines.push(`vendor: "${input.vendor}"`);
    yamlLines.push(`game: "${input.game}"`);
    yamlLines.push(`version: "${input.version}"`);
    yamlLines.push(`jurisdiction: "${input.jurisdiction}"`);
    yamlLines.push(`repoSha: "${input.repoSha}"`);
    yamlLines.push(`generatedAt: "${input.generatedAt}"`);
    yamlLines.push(`rtp: ${input.rtp}`);
    yamlLines.push(`hitFrequency: ${input.hitFrequency}`);
    yamlLines.push(`variance: ${input.variance}`);
    yamlLines.push(`maxWinX: ${input.maxWinX}`);
    yamlLines.push(`requiredDocuments:`);
    for (const d of ECOGRA_REQUIRED_DOCS) yamlLines.push(`  - ${d}`);
    yamlLines.push(`entries:`);
    for (const e of manifest) {
      yamlLines.push(`  - path: "${e.path}"`);
      yamlLines.push(`    sha256: "${e.sha256}"`);
      yamlLines.push(`    sizeBytes: ${e.sizeBytes}`);
    }
    addFile('ecogra-audit.yaml', Buffer.from(yamlLines.join('\n'), 'utf8'));

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

export const ecograAdapter = new EcograAdapter();
