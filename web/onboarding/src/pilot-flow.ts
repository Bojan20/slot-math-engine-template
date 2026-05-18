// W210 Faza 600.0 — Pilot tenant onboarding wizard.
//
// 5-step flow used by operator engineering teams to bring a new tenant
// live in ≤1h. Pure state-machine logic — DOM rendering lives in
// `components/pilot-step*.ts` and reads from this module's state shape.
//
// Steps:
//   1. identity   — operator name, jurisdiction(s), regulator(s)
//   2. wallet     — wallet provider type + credentials + test connection
//   3. catalog    — kernels + templates selection (marketplace)
//   4. compliance — RTS/PPD attestations per jurisdiction
//   5. preview    — deploy summary + final approval
//
// Each step has validate(), can save a draft, resume later via the
// localStorage key. The final submit returns the tenant + license setup
// payload that the server consumes.

export type PilotStepId =
  | 'identity'
  | 'wallet'
  | 'catalog'
  | 'compliance'
  | 'preview';

export const PILOT_STEPS: ReadonlyArray<{
  id: PilotStepId;
  title: string;
  i18nKey: string;
}> = [
  { id: 'identity', title: 'Operator identity', i18nKey: 'onboarding.pilot.step1.title' },
  { id: 'wallet', title: 'Wallet integration', i18nKey: 'onboarding.pilot.step2.title' },
  { id: 'catalog', title: 'Catalog selection', i18nKey: 'onboarding.pilot.step3.title' },
  {
    id: 'compliance',
    title: 'Compliance attestation',
    i18nKey: 'onboarding.pilot.step4.title',
  },
  { id: 'preview', title: 'Deploy preview', i18nKey: 'onboarding.pilot.step5.title' },
];

export type WalletProviderType =
  | 'generic-pam'
  | 'microgaming-style'
  | 'netent-aggregator'
  | 'playtech-style';

export interface IdentityStepData {
  operatorName: string;
  jurisdictions: string[];
  regulators: string[];
  primaryContactEmail: string;
}

export interface WalletStepData {
  provider: WalletProviderType | '';
  baseUrl: string;
  apiSecret: string;
  operatorId: string;
  connectionTested: boolean;
  connectionLatencyMs?: number;
}

export interface CatalogStepData {
  kernelIds: string[];
  templateIds: string[];
}

export interface ComplianceStepData {
  /** Map jurisdiction → signed attestation flag. */
  attestations: Record<string, boolean>;
  signedByName: string;
  signedAtIso: string | null;
}

export interface PreviewStepData {
  approved: boolean;
  notes: string;
}

export interface PilotFlowState {
  step: PilotStepId;
  identity: IdentityStepData;
  wallet: WalletStepData;
  catalog: CatalogStepData;
  compliance: ComplianceStepData;
  preview: PreviewStepData;
  /** ISO timestamps of draft saves — last entry is the most recent. */
  draftHistory: string[];
}

export interface PilotValidationResult {
  ok: boolean;
  errors: string[];
}

const STORAGE_KEY = 'corti-pilot-flow';

const VALID_WALLET_PROVIDERS: WalletProviderType[] = [
  'generic-pam',
  'microgaming-style',
  'netent-aggregator',
  'playtech-style',
];

export function defaultPilotFlowState(): PilotFlowState {
  return {
    step: 'identity',
    identity: {
      operatorName: '',
      jurisdictions: [],
      regulators: [],
      primaryContactEmail: '',
    },
    wallet: {
      provider: '',
      baseUrl: '',
      apiSecret: '',
      operatorId: '',
      connectionTested: false,
    },
    catalog: { kernelIds: [], templateIds: [] },
    compliance: { attestations: {}, signedByName: '', signedAtIso: null },
    preview: { approved: false, notes: '' },
    draftHistory: [],
  };
}

// ── validation per step ─────────────────────────────────────────────

export function validateIdentity(d: IdentityStepData): PilotValidationResult {
  const errors: string[] = [];
  if (!d.operatorName.trim()) errors.push('operator_name_required');
  if (d.operatorName.length > 120) errors.push('operator_name_too_long');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.primaryContactEmail))
    errors.push('contact_email_invalid');
  if (d.jurisdictions.length === 0) errors.push('jurisdictions_required');
  if (d.regulators.length === 0) errors.push('regulators_required');
  return { ok: errors.length === 0, errors };
}

export function validateWallet(d: WalletStepData): PilotValidationResult {
  const errors: string[] = [];
  if (!d.provider) {
    errors.push('wallet_provider_required');
  } else if (!VALID_WALLET_PROVIDERS.includes(d.provider as WalletProviderType)) {
    errors.push('wallet_provider_invalid');
  }
  if (!/^https:\/\//i.test(d.baseUrl)) errors.push('wallet_baseUrl_must_be_https');
  if (d.apiSecret.length < 16) errors.push('wallet_apiSecret_too_short');
  if (!d.operatorId.trim()) errors.push('wallet_operatorId_required');
  if (!d.connectionTested) errors.push('wallet_connection_test_required');
  return { ok: errors.length === 0, errors };
}

export function validateCatalog(d: CatalogStepData): PilotValidationResult {
  const errors: string[] = [];
  if (d.kernelIds.length + d.templateIds.length === 0)
    errors.push('catalog_pick_at_least_one');
  return { ok: errors.length === 0, errors };
}

export function validateCompliance(
  d: ComplianceStepData,
  requiredJurisdictions: string[]
): PilotValidationResult {
  const errors: string[] = [];
  for (const j of requiredJurisdictions) {
    if (!d.attestations[j]) errors.push(`compliance_${j}_unsigned`);
  }
  if (!d.signedByName.trim()) errors.push('compliance_signer_required');
  if (!d.signedAtIso) errors.push('compliance_signature_timestamp_required');
  return { ok: errors.length === 0, errors };
}

export function validatePreview(d: PreviewStepData): PilotValidationResult {
  const errors: string[] = [];
  if (!d.approved) errors.push('preview_approval_required');
  return { ok: errors.length === 0, errors };
}

/** Top-level validate — runs the matching step's check. */
export function validateStep(
  state: PilotFlowState,
  step: PilotStepId
): PilotValidationResult {
  switch (step) {
    case 'identity':
      return validateIdentity(state.identity);
    case 'wallet':
      return validateWallet(state.wallet);
    case 'catalog':
      return validateCatalog(state.catalog);
    case 'compliance':
      return validateCompliance(state.compliance, state.identity.jurisdictions);
    case 'preview':
      return validatePreview(state.preview);
  }
}

// ── transitions ─────────────────────────────────────────────────────

export function nextStep(state: PilotFlowState): PilotFlowState {
  const idx = PILOT_STEPS.findIndex((s) => s.id === state.step);
  if (idx < 0 || idx >= PILOT_STEPS.length - 1) return state;
  const v = validateStep(state, state.step);
  if (!v.ok) return state;
  return { ...state, step: PILOT_STEPS[idx + 1].id };
}

export function prevStep(state: PilotFlowState): PilotFlowState {
  const idx = PILOT_STEPS.findIndex((s) => s.id === state.step);
  if (idx <= 0) return state;
  return { ...state, step: PILOT_STEPS[idx - 1].id };
}

export function jumpTo(state: PilotFlowState, step: PilotStepId): PilotFlowState {
  return { ...state, step };
}

// ── persistence ─────────────────────────────────────────────────────

export function saveDraft(
  state: PilotFlowState,
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null
): PilotFlowState {
  const next: PilotFlowState = {
    ...state,
    draftHistory: [...state.draftHistory, new Date().toISOString()].slice(-10),
  };
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota / disabled */
    }
  }
  return next;
}

export function loadDraft(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null
): PilotFlowState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PilotFlowState>;
    return mergeDefault(parsed);
  } catch {
    return null;
  }
}

export function clearDraft(
  storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function mergeDefault(partial: Partial<PilotFlowState>): PilotFlowState {
  const base = defaultPilotFlowState();
  return {
    step: partial.step ?? base.step,
    identity: { ...base.identity, ...(partial.identity ?? {}) },
    wallet: { ...base.wallet, ...(partial.wallet ?? {}) },
    catalog: { ...base.catalog, ...(partial.catalog ?? {}) },
    compliance: { ...base.compliance, ...(partial.compliance ?? {}) },
    preview: { ...base.preview, ...(partial.preview ?? {}) },
    draftHistory: partial.draftHistory ?? base.draftHistory,
  };
}

// ── submission payload ──────────────────────────────────────────────

export interface PilotSubmission {
  operator: {
    name: string;
    primaryContactEmail: string;
    jurisdictions: string[];
    regulators: string[];
  };
  wallet: {
    provider: WalletProviderType;
    config: {
      baseUrl: string;
      apiSecret: string;
      operatorId: string;
    };
  };
  catalog: { kernelIds: string[]; templateIds: string[] };
  compliance: {
    signedByName: string;
    signedAtIso: string;
    attestedJurisdictions: string[];
  };
  notes: string;
}

export function buildSubmission(state: PilotFlowState): PilotSubmission {
  return {
    operator: {
      name: state.identity.operatorName.trim(),
      primaryContactEmail: state.identity.primaryContactEmail.trim(),
      jurisdictions: state.identity.jurisdictions.slice(),
      regulators: state.identity.regulators.slice(),
    },
    wallet: {
      provider: state.wallet.provider as WalletProviderType,
      config: {
        baseUrl: state.wallet.baseUrl,
        apiSecret: state.wallet.apiSecret,
        operatorId: state.wallet.operatorId,
      },
    },
    catalog: {
      kernelIds: state.catalog.kernelIds.slice(),
      templateIds: state.catalog.templateIds.slice(),
    },
    compliance: {
      signedByName: state.compliance.signedByName.trim(),
      signedAtIso: state.compliance.signedAtIso ?? '',
      attestedJurisdictions: Object.entries(state.compliance.attestations)
        .filter(([, v]) => v)
        .map(([k]) => k),
    },
    notes: state.preview.notes,
  };
}

/** Validate every step. Used as a final gate before submission. */
export function validateAll(state: PilotFlowState): PilotValidationResult {
  const allErrors: string[] = [];
  for (const s of PILOT_STEPS) {
    const r = validateStep(state, s.id);
    if (!r.ok) allErrors.push(...r.errors);
  }
  return { ok: allErrors.length === 0, errors: allErrors };
}

/** Time estimate (minutes) for a technical operator, used in UI. */
export function estimateMinutesRemaining(state: PilotFlowState): number {
  const order: PilotStepId[] = PILOT_STEPS.map((s) => s.id);
  const idx = order.indexOf(state.step);
  // Tuned so total ≤ 60 min for a fully unfilled flow.
  const perStep = [10, 20, 10, 15, 5];
  return perStep.slice(idx).reduce((a, b) => a + b, 0);
}
