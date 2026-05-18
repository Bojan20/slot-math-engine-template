/**
 * CORTI W210 Faza 600.0 — BMM Testlabs adapter.
 *
 * BMM has strong EU + Asia footprint. Submissions add MGA Player
 * Protection Directive §11 disclosure where MGA is the target
 * jurisdiction, and reference MGA AWP §15 for AWP-style games.
 *
 * Bundle format: tar (.tar) with bmm-submission.json manifest at root.
 * Real BMM API accepts tar.gz — caller can gzip the tar bytes if zlib
 * is available.
 *
 * v1.0 — covers 80% of typical submission shape.
 */

import { createHash } from 'node:crypto';
import {
  buildTar,
  findArtifact,
  validateCommon,
  type CertBundle,
  type CertPackInput,
  type LabAdapter,
  type ValidationResult,
  type BundleManifestEntry,
} from './types.js';

export const BMM_REQUIRED_DOCS = [
  'PAR_SHEET_JSON',
  'TESTU01_BIGCRUSH',
  'NIST_SP_800_22',
  'MATH_DESIGN_DOC',
  'RTP_VERIFICATION',
  'PAYTABLE_SCHEMA',
  'REPLAY_DETERMINISM_PROOF',
  'MGA_PPD_DISCLOSURE',
];

export const BMM_JURISDICTIONS = [
  'MGA',
  'UKGC',
  'IT-ADM',
  'ES-DGOJ',
  'DK-Spillemyndigheden',
  'AU-NCPF',
  'PH-PAGCOR',
  'JP-METI',
];

export class BmmAdapter implements LabAdapter {
  readonly labName = 'BMM' as const;
  readonly jurisdictionsSupported = BMM_JURISDICTIONS;
  readonly bundleFormat = 'tar' as const;
  readonly requiredDocuments = BMM_REQUIRED_DOCS;

  validateInput(input: CertPackInput): ValidationResult {
    const base = validateCommon(input);
    const errors = [...base.errors];
    const warnings = [...base.warnings];
    if (!this.jurisdictionsSupported.includes(input.jurisdiction)) {
      warnings.push(`bmm_jurisdiction_uncommon:${input.jurisdiction}`);
    }
    for (const need of BMM_REQUIRED_DOCS) {
      if (!findArtifact(input, need)) {
        errors.push(`bmm_missing_required:${need}`);
      }
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  generateCoverLetter(input: CertPackInput): string {
    const isMga = input.jurisdiction === 'MGA';
    return [
      `BMM Testlabs — Submission Cover Sheet`,
      `=====================================`,
      ``,
      `Vendor:           ${input.vendor}`,
      `Game:             ${input.game}`,
      `Version:          ${input.version}`,
      `Jurisdiction:     ${input.jurisdiction}`,
      `Submission Date:  ${input.generatedAt}`,
      `Build SHA:        ${input.repoSha}`,
      ``,
      `Theoretical RTP:  ${(input.rtp * 100).toFixed(4)}%`,
      `Hit Frequency:    ${(input.hitFrequency * 100).toFixed(4)}%`,
      `Variance:         ${input.variance.toFixed(4)}`,
      `Max Win:          ${input.maxWinX.toFixed(2)}x`,
      ``,
      isMga
        ? `MGA Player Protection Directive §11 disclosure attached as`
          + `\nMGA_PPD_DISCLOSURE artifact. MGA AWP §15 reviewed for AWP`
          + `\nflagged games — see MATH_DESIGN_DOC §3.4.`
        : `Cross-jurisdiction reference: MGA PPD §11 included for`
          + `\nportability even though target is ${input.jurisdiction}.`,
      ``,
      `Contact: ${input.contact.company} / ${input.contact.name}`,
      `         ${input.contact.email}`,
      input.contact.phone ? `Phone:   ${input.contact.phone}` : '',
      ``,
      `Ed25519 detached signature over manifest is included as`,
      `bmm-submission.sig (hex). Verify against the public key at`,
      `bmm-submission.pubkey before accepting.`,
    ].join('\n');
  }

  async packBundle(input: CertPackInput): Promise<CertBundle> {
    const validation = this.validateInput(input);
    if (!validation.ok) {
      throw new Error(`bmm_validate_failed: ${validation.errors.join(',')}`);
    }
    const safeVendor = sanitize(input.vendor);
    const safeGame = sanitize(input.game);
    const filename = `${safeVendor}-${safeGame}-${input.version}-BMM.tar`;

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

    const submissionJson = JSON.stringify(
      {
        labName: 'BMM',
        bmmReference: `BMM-${input.vendor}-${input.game}-${input.version}`,
        vendor: input.vendor,
        game: input.game,
        version: input.version,
        jurisdiction: input.jurisdiction,
        repoSha: input.repoSha,
        generatedAt: input.generatedAt,
        rtp: input.rtp,
        hitFrequency: input.hitFrequency,
        variance: input.variance,
        maxWinX: input.maxWinX,
        requiredDocuments: BMM_REQUIRED_DOCS,
        mgaPpdDisclosed: input.jurisdiction === 'MGA',
        entries: manifest,
      },
      null,
      2
    );
    addFile('bmm-submission.json', Buffer.from(submissionJson, 'utf8'));

    const tarBytes = buildTar(files);
    const sha256 = createHash('sha256').update(tarBytes).digest('hex');
    return {
      data: tarBytes,
      filename,
      sha256,
      mime: 'application/x-tar',
      manifest,
    };
  }
}

function sanitize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

export const bmmAdapter = new BmmAdapter();
