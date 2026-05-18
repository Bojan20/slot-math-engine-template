# Cert Lab Submission — Lab Adapter Framework v1.0

> **W210 Faza 600.0** — automated lab submission packager for the four
> labs that handle ~95% of Tier-1 online-slot certification:
> **GLI, BMM, eCOGRA, NMi**.
>
> v1.0 covers ~80% of typical lab submission shape. Edge cases
> (jurisdiction-specific addenda, e.g. AGCO skill-bonus override,
> Bavarian §15 GlüStV statistics) are tracked per-lab in W21x.

## 1. Lab Matrix

| Lab    | Primary footprint                                 | Required docs                                                                                                       | Bundle format        | Typical timeline |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- |
| GLI    | US (NJ DGE, NV NGCB, PA, MI, WV), UK, MGA, AGCO   | PAR sheet, TestU01 BigCrush, NIST SP 800-22, source code review, MDD, RTP verification, paytable schema, replay proof | `zip` (GLI-19 name)  | 6–12 weeks       |
| BMM    | MGA, IT, ES, DK, AU, PH, JP                       | Same as GLI + MGA PPD §11 disclosure (for MGA target), MGA AWP §15 for AWP titles                                   | `tar` + JSON manifest | 4–8 weeks        |
| eCOGRA | UKGC, MGA, GIB, IM-GSC, AT, SE — indie operators  | PAR sheet, Generic Slots Audit (GSA) report, UKGC RTS-12 + RTS-14 disclosures, monthly RTP proof, paytable, replay  | `zip` + YAML manifest | 3–6 weeks        |
| NMi    | NL KSA, MGA, UKGC, DE GGL, ES DGOJ, FR ANJ, IT ADM | PAR sheet, NMi G-MS standard report, EU GA 2024 compliance, MDD, RTP verification, paytable, replay                | `zip` + PKCS#7 sig   | 6–10 weeks       |

All four adapters expose the same interface:

```typescript
interface LabAdapter {
  labName: 'GLI' | 'BMM' | 'eCOGRA' | 'NMi';
  jurisdictionsSupported: string[];
  bundleFormat: 'zip' | 'tar' | 'gli-pkg';
  requiredDocuments: string[];
  packBundle(input: CertPackInput): Promise<CertBundle>;
  validateInput(input: CertPackInput): ValidationResult;
  generateCoverLetter(input: CertPackInput): string;
}
```

See `server/lib/cert/labs/types.ts` for full types and
`server/lib/cert/labs/{gli,bmm,ecogra,nmi}.ts` for adapters.

## 2. What Each Lab Requires

### GLI — Gaming Laboratories International

GLI is the largest US-focused lab. Every submission carries a
**GLI-19 Submission ID** of the form
`GLI-19-{VENDOR}-{GAME}-{VERSION}`. Bundles follow the strict naming
convention `{vendor}-{game}-{version}-GLI19.zip`.

Required documents (8): `PAR_SHEET_JSON`, `TESTU01_BIGCRUSH`,
`NIST_SP_800_22`, `SOURCE_CODE_REVIEW`, `MATH_DESIGN_DOC`,
`RTP_VERIFICATION`, `PAYTABLE_SCHEMA`, `REPLAY_DETERMINISM_PROOF`.

### BMM — BMM Testlabs

BMM has a strong EU + APAC footprint. MGA targets must include
`MGA_PPD_DISCLOSURE` (Player Protection Directive §11). AWP titles
also reference MGA AWP §15. Bundle is a `.tar` with
`bmm-submission.json` at root.

Required documents (8): same skeleton as GLI minus
`SOURCE_CODE_REVIEW`, plus `MGA_PPD_DISCLOSURE`.

### eCOGRA — UK + EU focus

eCOGRA is the go-to lab for indie operators on UKGC, MGA, GIB, IoM,
Austria, Sweden. The bundle layout is GSA (Generic Slots Audit) +
UKGC RTS-12 + RTS-14 disclosures + a monthly RTP proof.

Required documents (7): `PAR_SHEET_JSON`, `GSA_FORMAT_REPORT`,
`UKGC_RTS12_DISCLOSURE`, `UKGC_RTS14_DISCLOSURE`,
`MONTHLY_RTP_PROOF`, `PAYTABLE_SCHEMA`,
`REPLAY_DETERMINISM_PROOF`.

Bundle format: `zip` with an `ecogra-audit.yaml` manifest. Cover
letter is SOC-style.

eCOGRA enforces UKGC RTS-7 RTP floor of 85% — the adapter blocks
submissions where the target jurisdiction is `UKGC` and `rtp < 0.85`.

### NMi — Metrology & Gaming

NMi Gaming is Netherlands-based, popular for KSA submissions. Uses
the NMi G-MS (Gaming Metrology Scheme) standard plus EU Gambling
Act 2024 compliance.

Required documents (7): `PAR_SHEET_JSON`,
`NMI_GMS_STANDARD_REPORT`, `EU_GA_2024_COMPLIANCE`,
`MATH_DESIGN_DOC`, `RTP_VERIFICATION`, `PAYTABLE_SCHEMA`,
`REPLAY_DETERMINISM_PROOF`.

Bundle format: `zip` with PKCS#7-style detached signature. When the
target jurisdiction is `KSA`, the cover letter is bilingual (Dutch +
English).

## 3. How to Package — End-to-End

```bash
node scripts/cert-dossier-build.mjs \
  --game=quick-hit-platinum \
  --lab=GLI \
  --jurisdiction=UKGC \
  --output=dist/cert
```

The script:

1. Collects artifacts from the repo:
   - PAR sheet from `reports/par-samples/*.par.json`
   - RNG reports from `reports/rng/`
   - Closed-form portfolio from `reports/dossier/`
   - Industry pattern catalog from `docs/INDUSTRY_PATTERN_CATALOG.md`
   - Compliance verdicts from `reports/jurisdiction/JURISDICTION_EMIT.md`
2. Generates a 10000-spin replay sample on-the-fly
3. Hands all artifacts to the requested adapter
4. HSM-signs the canonical manifest (Ed25519, reusing
   `server/state/hsm.ts`)
5. Writes the bundle + `.sig` + `.manifest.json` to `--output`

Sample output for the rehearsal:

```
lab     jurisdiction  bundle                                                         bytes   files  sigOk
------  ------------  -------------------------------------------------------------  ------  -----  -----
GLI     UKGC          slot-math-engine-quick-hit-dragons-gli-ukgc-...zip             395107  12     true
BMM     MGA           slot-math-engine-quick-hit-dragons-bmm-mga-...tar              392192  12     true
eCOGRA  UKGC          slot-math-engine-quick-hit-dragons-ecogra-ukgc-...zip          399414  11     true
NMi     KSA           slot-math-engine-quick-hit-dragons-nmi-ksa-...zip              365707  11     true
```

To rehearse all 4 in one go:

```bash
node scripts/lab-submission-rehearsal.mjs
```

## 4. Cover Letter Conventions

- **GLI** — markdown, references GLI-19 ID, math summary table,
  required-docs list, GLI-19 §4.1 signature-binding clause.
- **BMM** — plain text, MGA PPD §11 + AWP §15 callouts when MGA is
  the target jurisdiction.
- **eCOGRA** — SOC-style audit opinion paragraph, RTS 12 + RTS 14
  references, monthly audit period header.
- **NMi** — bilingual when KSA; otherwise English. References
  NMi G-MS v2024 and EU Gambling Act 2024 §§14–22.

## 5. HSM Signature

Every bundle ships with an Ed25519 detached signature over the
canonical manifest JSON. Public key + signature are committed to the
`.sig` sidecar; verification reuses the helper at
`server/state/hsm.ts::HsmStore.verifyString`.

The signing key is the same one used by W205-W206 cert routes and
W209 marketplace license JWTs. Production deployments swap in a
managed-HSM (Thales Luna, AWS CloudHSM, GCP KMS) — the call
surface (`signString` / `verifyString`) does not change.

## 6. Post-Submission Process

1. Lab opens a ticket; operator receives a tracking number.
2. Lab may raise **questions** → `lab_questions` stage in the
   pipeline tracker (see `server/state/cert-pipeline.ts`).
3. If revisions are required → `revisions_needed` → repack →
   resubmit.
4. On approval → `approved` → `production_ready` after the operator
   commercial paperwork lands.

The pipeline tracker emits a deterministic audit hash so any UI can
flag tamper attempts on the stage transitions.

## 7. Typical Timelines (Industry Averages)

| Lab    | Submitted → Decision avg | Worst case (P95)   |
| ------ | ------------------------ | ------------------ |
| GLI    | 6–12 weeks               | 18 weeks           |
| BMM    | 4–8 weeks                | 14 weeks           |
| eCOGRA | 3–6 weeks                | 10 weeks           |
| NMi    | 6–10 weeks               | 16 weeks           |

The cert pipeline tracker seeds these into
`ESTIMATED_DAYS_IN_STAGE` so operator UIs can render a "you'll hear
back in ~21 days" badge without live telemetry.

## 8. v1.0 Scope Limits

This is an **MVP**:

- Adapter cover letters cover the dominant template; lab-specific
  edge addenda (e.g. AGCO skill-game override, Bavarian §15 GlüStV
  statistics) are tracked in W211+.
- BMM bundle is `.tar` not `.tar.gz` — production wrappers can gzip
  the bytes if zlib is loaded.
- NMi PKCS#7 signature is a CMS-style envelope around the Ed25519
  signature, not a true X.509-bound `SignedData` blob. Production
  deployments replace with a real PKCS#7 via the managed HSM.
- Test artifacts are stub bytes; production runs feed real PAR /
  TestU01 / SP 800-22 outputs collected by the wave scripts.
