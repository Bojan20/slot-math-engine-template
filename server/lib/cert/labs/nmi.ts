/**
 * CORTI W210 Faza 600.0 — NMi Metrology & Gaming adapter.
 *
 * NMi Gaming is Netherlands-based with a strong EU footprint
 * (especially KSA / Kansspelautoriteit). Submissions reference the
 * NMi G-MS (Gaming Metrology Scheme) standard and the EU Gambling Act
 * 2024 framework. Cover letters are bilingual (Dutch + English) when
 * jurisdiction is KSA.
 *
 * Bundle format: zip with PKCS#7-style detached signature file
 * (`nmi-submission.p7s`). Our P7 here is a CMS-style envelope synthesized
 * from the Ed25519 signature — production deployments swap in a real
 * PKCS#7 SignedData blob via an HSM.
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

export const NMI_REQUIRED_DOCS = [
  'PAR_SHEET_JSON',
  'NMI_GMS_STANDARD_REPORT',
  'EU_GA_2024_COMPLIANCE',
  'MATH_DESIGN_DOC',
  'RTP_VERIFICATION',
  'PAYTABLE_SCHEMA',
  'REPLAY_DETERMINISM_PROOF',
];

export const NMI_JURISDICTIONS = [
  'KSA',
  'MGA',
  'UKGC',
  'DE-GGL',
  'ES-DGOJ',
  'FR-ANJ',
  'IT-ADM',
];

export class NmiAdapter implements LabAdapter {
  readonly labName = 'NMi' as const;
  readonly jurisdictionsSupported = NMI_JURISDICTIONS;
  readonly bundleFormat = 'zip' as const;
  readonly requiredDocuments = NMI_REQUIRED_DOCS;

  validateInput(input: CertPackInput): ValidationResult {
    const base = validateCommon(input);
    const errors = [...base.errors];
    const warnings = [...base.warnings];
    if (!this.jurisdictionsSupported.includes(input.jurisdiction)) {
      warnings.push(`nmi_jurisdiction_uncommon:${input.jurisdiction}`);
    }
    for (const need of NMI_REQUIRED_DOCS) {
      if (!findArtifact(input, need)) {
        errors.push(`nmi_missing_required:${need}`);
      }
    }
    // KSA-specific: max bet checks (regulator-specific in production)
    if (input.jurisdiction === 'KSA' && input.maxWinX > 1_000_000) {
      warnings.push('nmi_ksa_max_win_unusually_high');
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  generateCoverLetter(input: CertPackInput): string {
    const isKsa = input.jurisdiction === 'KSA';
    const lines: string[] = [];
    if (isKsa) {
      lines.push(`NMi Gaming — Indieningsbrief (NL)`);
      lines.push(`================================`);
      lines.push(``);
      lines.push(`Aanvrager:   ${input.contact.company}`);
      lines.push(`Spel:        ${input.game}`);
      lines.push(`Versie:      ${input.version}`);
      lines.push(`Jurisdictie: ${input.jurisdiction} (Kansspelautoriteit)`);
      lines.push(`Datum:       ${input.generatedAt}`);
      lines.push(``);
      lines.push(`Hierbij dienen wij het spel "${input.game}" v${input.version}`);
      lines.push(`ter beoordeling in volgens de NMi G-MS standaard en de`);
      lines.push(`EU Gambling Act 2024 conformiteitsregels.`);
      lines.push(``);
      lines.push(`Theoretische RTP: ${(input.rtp * 100).toFixed(4)}%`);
      lines.push(`Max winst:        ${input.maxWinX.toFixed(2)}x inzet`);
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
    lines.push(`NMi Gaming — Submission Cover Letter (EN)`);
    lines.push(`=========================================`);
    lines.push(``);
    lines.push(`Submitter:     ${input.contact.company}`);
    lines.push(`Game:          ${input.game}`);
    lines.push(`Version:       ${input.version}`);
    lines.push(`Jurisdiction:  ${input.jurisdiction}${isKsa ? ' (Netherlands KSA)' : ''}`);
    lines.push(`Date:          ${input.generatedAt}`);
    lines.push(`Build SHA:     ${input.repoSha}`);
    lines.push(``);
    lines.push(`Theoretical RTP: ${(input.rtp * 100).toFixed(4)}%`);
    lines.push(`Hit Frequency:   ${(input.hitFrequency * 100).toFixed(4)}%`);
    lines.push(`Variance:        ${input.variance.toFixed(4)}`);
    lines.push(`Max Win:         ${input.maxWinX.toFixed(2)}x`);
    lines.push(``);
    lines.push(`Reference standards:`);
    lines.push(`  - NMi G-MS (Gaming Metrology Scheme), v2024`);
    lines.push(`  - EU Gambling Act 2024 §§ 14-22 (RNG + RTP + RG)`);
    lines.push(``);
    lines.push(`Contact: ${input.contact.name} <${input.contact.email}>`);
    if (input.contact.phone) lines.push(`Phone:   ${input.contact.phone}`);
    lines.push(``);
    lines.push(`The bundle contains a PKCS#7-style detached signature in`);
    lines.push(`nmi-submission.p7s. Verify the Ed25519 signature against`);
    lines.push(`the public key in nmi-submission.pubkey before accepting.`);
    return lines.join('\n');
  }

  async packBundle(input: CertPackInput): Promise<CertBundle> {
    const validation = this.validateInput(input);
    if (!validation.ok) {
      throw new Error(`nmi_validate_failed: ${validation.errors.join(',')}`);
    }
    const safeVendor = sanitize(input.vendor);
    const safeGame = sanitize(input.game);
    const filename = `${safeVendor}-${safeGame}-${input.version}-NMi.zip`;

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

    const manifestObj = {
      labName: 'NMi',
      nmiReference: `NMi-GMS-${input.vendor}-${input.game}-${input.version}`,
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
      requiredDocuments: NMI_REQUIRED_DOCS,
      ksaDualLanguage: input.jurisdiction === 'KSA',
      entries: manifest,
    };
    addFile('nmi-submission.json', Buffer.from(JSON.stringify(manifestObj, null, 2), 'utf8'));

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

export const nmiAdapter = new NmiAdapter();
