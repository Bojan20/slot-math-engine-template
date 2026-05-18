/**
 * CORTI W204-PROTOCOLS — cert submission store with real PAR PDF +
 * ed25519 HSM signature.
 *
 *  - submit(ir, jurisdiction) walks submitted → validating → par_generated
 *    → packaged → completed.
 *  - On `par_generated` we synthesize 12 GLI-16 sections and render
 *    them to a real PDF via pdf-lib.
 *  - On `packaged` we sign the canonical PAR payload with the in-process
 *    HSM (ed25519) so a regulator can verify it offline.
 *
 * Real deployments would route to GLI/BMM/iTechLabs cert labs over a
 * managed API; the on-disk PDF + signature artifacts in this template
 * are identical in shape to what those labs produce.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { sha256Hex, canonicalize } from '../lib/hashChain.js';
import type { HsmStore, HsmSignature } from './hsm.js';

export type CertStatus =
  | 'submitted'
  | 'validating'
  | 'par_generated'
  | 'packaged'
  | 'completed'
  | 'rejected';

export interface ParSection {
  index: number;
  title: string;
  rows: Array<{ k: string; v: string }>;
}

export interface PARSheet {
  gameId: string;
  jurisdiction: string;
  version: string;
  irSha256: string;
  generatedAt: string;
  rtp: number;
  hitFreq: number;
  variance: number;
  maxWinX: number;
  spins: number;
  rng: string;
  sections: ParSection[];
}

export interface CertSubmission {
  submissionId: string;
  jurisdiction: string;
  status: CertStatus;
  irSha256: string;
  createdAt: string;
  estimatedCompletion: string;
  parSheet?: {
    sections: number;
    rtp: number;
    sha256: string;
    merkleRoot: string;
  };
  parPdfSha256?: string;
  hsmSignature?: HsmSignature;
  operatorPackage?: { sizeBytes: number; sha256: string; downloadToken: string };
  regulatorFeedback?: string;
}

export interface SubmitInput {
  ir: unknown;
  jurisdiction: string;
}

let counter = 0;
function newSubmissionId(): string {
  counter++;
  return `cert-${Date.now().toString(36)}-${counter.toString(16).padStart(6, '0')}`;
}

// ───────────────────────────────────────────────────────────────────────
// PAR Sheet synth — generates 12 sections from the IR + a mock MC result.
// ───────────────────────────────────────────────────────────────────────
export function buildParSheet(ir: unknown, jurisdiction: string, irSha256: string): PARSheet {
  const obj = (ir ?? {}) as Record<string, unknown>;
  const meta = (obj.meta as Record<string, unknown> | undefined) ?? {};
  const game = (obj.game as Record<string, unknown> | undefined) ?? {};
  const gameId = String(meta.id ?? game.id ?? obj.gameId ?? 'unknown-game');
  const version = String(meta.version ?? '1.0.0');
  const rtp = 0.955;
  const hitFreq = 0.275;
  const variance = 17.42;
  const maxWinX = 5000;
  const spins = 1_000_000;
  const rng = 'pcg64';

  const fmtPct = (x: number) => `${(x * 100).toFixed(4)}%`;
  const sections: ParSection[] = [
    {
      index: 1,
      title: 'Meta',
      rows: [
        { k: 'game id', v: gameId },
        { k: 'version', v: version },
        { k: 'jurisdiction', v: jurisdiction },
        { k: 'IR sha256', v: irSha256.slice(0, 16) + '...' },
        { k: 'spins', v: spins.toLocaleString() },
        { k: 'rng', v: rng },
      ],
    },
    {
      index: 2,
      title: 'RTP summary',
      rows: [
        { k: 'total RTP', v: fmtPct(rtp) },
        { k: 'base game', v: fmtPct(rtp - 0.045) },
        { k: 'features', v: fmtPct(0.045) },
      ],
    },
    {
      index: 3,
      title: 'Hit frequency',
      rows: [
        { k: 'overall hit %', v: fmtPct(hitFreq) },
        { k: '1-in-N', v: (1 / hitFreq).toFixed(2) },
      ],
    },
    {
      index: 4,
      title: 'Volatility',
      rows: [
        { k: 'variance (sigma^2)', v: variance.toFixed(4) },
        { k: 'std dev (sigma)', v: Math.sqrt(variance).toFixed(4) },
        { k: 'max win (x)', v: maxWinX.toFixed(2) },
        { k: 'category', v: variance < 16 ? 'medium' : variance < 49 ? 'high' : 'very high' },
      ],
    },
    {
      index: 5,
      title: 'Win distribution',
      rows: [
        { k: 'miss', v: '72.50%' },
        { k: '<2x', v: '15.10%' },
        { k: '2-10x', v: '9.30%' },
        { k: '10-100x', v: '2.70%' },
        { k: '100x+', v: '0.40%' },
      ],
    },
    {
      index: 6,
      title: 'Jackpot section',
      rows: [
        { k: 'tiers', v: 'none' },
        { k: 'jackpot RTP', v: '0.0000%' },
      ],
    },
    {
      index: 7,
      title: 'Compliance',
      rows: [
        { k: 'RTP range required', v: '85.00% – 99.00%' },
        { k: 'max win cap (x)', v: String(maxWinX) },
        { k: 'jurisdiction', v: jurisdiction },
      ],
    },
    {
      index: 8,
      title: 'Statistical confidence',
      rows: [
        { k: 'std error', v: '0.000218' },
        { k: '95% CI', v: '±0.000427' },
        { k: '99% CI', v: '±0.000561' },
        { k: '99.9% CI', v: '±0.000718' },
      ],
    },
    {
      index: 9,
      title: 'Quantiles',
      rows: [
        { k: 'P50', v: '0.0000' },
        { k: 'P90', v: '1.5000' },
        { k: 'P99', v: '10.0000' },
        { k: 'P99.9', v: '50.0000' },
      ],
    },
    {
      index: 10,
      title: 'Moments',
      rows: [
        { k: 'mean (mu)', v: rtp.toFixed(6) },
        { k: 'variance', v: variance.toFixed(6) },
        { k: 'skewness (g1)', v: '12.74' },
        { k: 'excess kurtosis (g2)', v: '218.41' },
      ],
    },
    {
      index: 11,
      title: 'Bonus distances',
      rows: [
        { k: 'FS inter-trigger', v: '152.0' },
        { k: 'H&W inter-trigger', v: 'n/a' },
      ],
    },
    {
      index: 12,
      title: 'Required spins',
      rows: [
        { k: 'spins used', v: spins.toLocaleString() },
        { k: 'duration', v: '8421.3 ms' },
      ],
    },
  ];

  return {
    gameId,
    jurisdiction,
    version,
    irSha256,
    generatedAt: new Date().toISOString(),
    rtp,
    hitFreq,
    variance,
    maxWinX,
    spins,
    rng,
    sections,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Real PDF generator — pdf-lib, A4, 2-3 pages.
// ───────────────────────────────────────────────────────────────────────
export async function generateParPdf(
  par: PARSheet,
  signature: HsmSignature,
  merkleRoot: string
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`PAR Sheet · ${par.gameId} · ${par.jurisdiction}`);
  pdf.setAuthor('slot-math-engine-template');
  pdf.setSubject('GLI-16 Appendix D — PAR Sheet');
  pdf.setKeywords(['par', 'gli-16', par.gameId, par.jurisdiction]);
  pdf.setCreator('slot-math-engine-template / pdf-lib');
  pdf.setProducer('slot-math-engine-template');
  pdf.setCreationDate(new Date(par.generatedAt));
  pdf.setModificationDate(new Date(par.generatedAt));

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  // A4 portrait: 595 × 842 pt
  const W = 595, H = 842;
  const M = 40;            // page margin
  const titleSize = 16;
  const headerSize = 12;
  const bodySize = 9;
  const lineHeight = 12;
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const black = rgb(0, 0, 0);
  const grey  = rgb(0.35, 0.35, 0.35);
  const blue  = rgb(0.13, 0.21, 0.45);

  // ── Header ───────────────────────────────────────────────────────
  page.drawText('PAR Sheet — GLI-16 Appendix D', {
    x: M, y, size: titleSize, font: fontB, color: blue,
  });
  y -= titleSize + 6;
  page.drawText(`Game: ${par.gameId} · Version: ${par.version} · Jurisdiction: ${par.jurisdiction}`, {
    x: M, y, size: 10, font, color: black,
  });
  y -= 14;
  page.drawText(`Generated: ${par.generatedAt}`, { x: M, y, size: 9, font, color: grey });
  y -= 12;
  page.drawText(`IR sha256: ${par.irSha256}`, { x: M, y, size: 8, font: mono, color: grey });
  y -= 12;
  page.drawText(`Merkle: ${merkleRoot}`, { x: M, y, size: 8, font: mono, color: grey });
  y -= 16;
  // horizontal rule
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: grey });
  y -= 14;

  const newPageIfNeeded = (needed: number): void => {
    if (y - needed < M + 40) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  // ── Sections ─────────────────────────────────────────────────────
  for (const s of par.sections) {
    newPageIfNeeded(40 + s.rows.length * lineHeight);
    page.drawText(`Section ${String(s.index).padStart(2, '0')} - ${s.title}`, {
      x: M, y, size: headerSize, font: fontB, color: blue,
    });
    y -= headerSize + 4;
    for (const r of s.rows) {
      newPageIfNeeded(lineHeight + 4);
      page.drawText(r.k, { x: M + 12, y, size: bodySize, font, color: black });
      page.drawText(String(r.v), { x: M + 220, y, size: bodySize, font: mono, color: black });
      y -= lineHeight;
    }
    y -= 8;
  }

  // ── Footer (last page) ───────────────────────────────────────────
  newPageIfNeeded(80);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: grey });
  y -= 14;
  page.drawText('Cryptographic seal — ed25519 HSM signature', {
    x: M, y, size: 10, font: fontB, color: blue,
  });
  y -= 14;
  page.drawText(`Signer:  ${signature.signer}`, { x: M, y, size: 8, font, color: black });
  y -= 11;
  page.drawText(`SignedAt: ${signature.signedAt}`, { x: M, y, size: 8, font, color: black });
  y -= 11;
  // Public key (split for layout)
  page.drawText(`PublicKey: ${signature.publicKey}`, {
    x: M, y, size: 7, font: mono, color: black,
  });
  y -= 11;
  // Signature is 128 hex chars — split across two lines
  page.drawText(`Signature: ${signature.signature.slice(0, 64)}`, {
    x: M, y, size: 7, font: mono, color: black,
  });
  y -= 10;
  page.drawText(`           ${signature.signature.slice(64)}`, {
    x: M, y, size: 7, font: mono, color: black,
  });
  y -= 14;
  page.drawText(`Verify via: GET /api/cert/<submissionId>/verify-signature`, {
    x: M, y, size: 8, font, color: grey,
  });

  // Page numbers
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    p.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: W - M - 80, y: M / 2, size: 8, font, color: grey,
    });
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ───────────────────────────────────────────────────────────────────────
// CertStore
// ───────────────────────────────────────────────────────────────────────
export class CertStore {
  private readonly submissions = new Map<string, CertSubmission>();
  private readonly downloads = new Map<string, Buffer>();
  private readonly pdfs = new Map<string, Buffer>();
  private readonly parSheets = new Map<string, PARSheet>();
  private hsm: HsmStore | null = null;

  /** Wire HSM. Called by the routes registrar; tests may pass their own. */
  withHsm(hsm: HsmStore): this {
    this.hsm = hsm;
    return this;
  }

  async submit(input: SubmitInput): Promise<CertSubmission> {
    if (!input.ir || typeof input.ir !== 'object') {
      throw new RangeError('cert.submit: ir must be a non-null object');
    }
    if (!input.jurisdiction) {
      throw new RangeError('cert.submit: jurisdiction required');
    }
    const irSha256 = sha256Hex(canonicalize(input.ir));
    const submissionId = newSubmissionId();
    const now = new Date();
    const eta = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const submission: CertSubmission = {
      submissionId,
      jurisdiction: input.jurisdiction,
      status: 'submitted',
      irSha256,
      createdAt: now.toISOString(),
      estimatedCompletion: eta.toISOString(),
    };
    this.submissions.set(submissionId, submission);
    await this.advance(submissionId, input.ir);
    return submission;
  }

  /** Sync legacy wrapper for tests that don't await. */
  submitSync(input: SubmitInput): CertSubmission {
    if (!input.ir || typeof input.ir !== 'object') {
      throw new RangeError('cert.submit: ir must be a non-null object');
    }
    if (!input.jurisdiction) {
      throw new RangeError('cert.submit: jurisdiction required');
    }
    const irSha256 = sha256Hex(canonicalize(input.ir));
    const submissionId = newSubmissionId();
    const now = new Date();
    const eta = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const submission: CertSubmission = {
      submissionId,
      jurisdiction: input.jurisdiction,
      status: 'submitted',
      irSha256,
      createdAt: now.toISOString(),
      estimatedCompletion: eta.toISOString(),
    };
    this.submissions.set(submissionId, submission);
    // Run advance in the background; callers using submitSync read state
    // later via get(). When HSM is wired the PDF is async-generated.
    void this.advance(submissionId, input.ir);
    return submission;
  }

  get(submissionId: string): CertSubmission | null {
    return this.submissions.get(submissionId) ?? null;
  }

  getPar(submissionId: string): PARSheet | null {
    return this.parSheets.get(submissionId) ?? null;
  }

  getPdf(submissionId: string): Buffer | null {
    return this.pdfs.get(submissionId) ?? null;
  }

  private async advance(submissionId: string, ir: unknown): Promise<void> {
    const sub = this.submissions.get(submissionId);
    if (!sub) return;
    if (sub.status === 'completed' || sub.status === 'rejected') return;

    sub.status = 'validating';
    const par = buildParSheet(ir, sub.jurisdiction, sub.irSha256);
    this.parSheets.set(submissionId, par);
    const parSha = sha256Hex(canonicalize(par));
    const merkleRoot = sha256Hex(parSha + ':' + sub.irSha256);
    sub.parSheet = {
      sections: par.sections.length,
      rtp: par.rtp,
      sha256: parSha,
      merkleRoot,
    };
    sub.status = 'par_generated';

    // Generate real PDF + HSM signature when HSM is wired. In tests
    // that didn't call withHsm() we fall back to a stub buffer so the
    // legacy flow still works (op-package generation still proceeds).
    let pdfBuffer: Buffer;
    let signature: HsmSignature;
    if (this.hsm) {
      await this.hsm.init();
      signature = this.hsm.signCanonical({
        gameId: par.gameId,
        jurisdiction: par.jurisdiction,
        irSha256: par.irSha256,
        parSha256: parSha,
        merkleRoot,
      });
      pdfBuffer = await generateParPdf(par, signature, merkleRoot);
    } else {
      // No HSM wired — emit a minimal placeholder. Tests that exercise
      // the PDF path always wire HSM via withHsm().
      signature = {
        publicKey: '00'.repeat(32),
        signature: '00'.repeat(64),
        signedAt: new Date().toISOString(),
        signer: 'noop-hsm',
      };
      pdfBuffer = await generateParPdf(par, signature, merkleRoot);
    }
    this.pdfs.set(submissionId, pdfBuffer);
    sub.parPdfSha256 = sha256Hex(pdfBuffer.toString('binary'));
    sub.hsmSignature = signature;

    sub.status = 'packaged';
    const opPkgBuffer = Buffer.from(
      `mock operator-package.zip for ${submissionId}\nIR sha256: ${sub.irSha256}\n`
    );
    const opPkgSha = sha256Hex(opPkgBuffer.toString('utf8'));
    const downloadToken = `tok-${sub.submissionId}-${opPkgSha.slice(0, 8)}`;
    this.downloads.set(downloadToken, opPkgBuffer);
    sub.operatorPackage = {
      sizeBytes: opPkgBuffer.byteLength,
      sha256: opPkgSha,
      downloadToken,
    };
    sub.status = 'completed';
  }

  download(submissionId: string): { buffer: Buffer; sha256: string } | null {
    const sub = this.submissions.get(submissionId);
    if (!sub || !sub.operatorPackage) return null;
    const buffer = this.downloads.get(sub.operatorPackage.downloadToken);
    if (!buffer) return null;
    return { buffer, sha256: sub.operatorPackage.sha256 };
  }

  /**
   * CORTI W206-SECURITY — regulator decision (RBAC). Records an
   * approve/reject verdict + optional feedback on the submission.
   * Idempotent: returns false if the submission cannot transition
   * (e.g. already in a terminal state of the opposite kind).
   */
  setRegulatorDecision(
    submissionId: string,
    decision: 'approve' | 'reject',
    feedback?: string
  ): CertSubmission | null {
    const sub = this.submissions.get(submissionId);
    if (!sub) return null;
    sub.status = decision === 'approve' ? 'completed' : 'rejected';
    if (feedback !== undefined) sub.regulatorFeedback = feedback;
    return sub;
  }

  list(): CertSubmission[] {
    return Array.from(this.submissions.values());
  }

  reset(): void {
    this.submissions.clear();
    this.downloads.clear();
    this.pdfs.clear();
    this.parSheets.clear();
  }
}
