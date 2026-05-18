/**
 * W210 Faza 600.0 — Pilot tenant onboarding wizard tests.
 *
 * Covers per-step validation, transitions, draft save/resume, full
 * submission shape, time estimate. Pure logic — DOM render tests live
 * in Playwright e2e later.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PILOT_STEPS,
  defaultPilotFlowState,
  validateIdentity,
  validateWallet,
  validateCatalog,
  validateCompliance,
  validatePreview,
  validateStep,
  validateAll,
  nextStep,
  prevStep,
  jumpTo,
  saveDraft,
  loadDraft,
  clearDraft,
  buildSubmission,
  estimateMinutesRemaining,
  type PilotFlowState,
} from '../src/pilot-flow.js';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  key(): string | null {
    return null;
  }
}

function filledState(): PilotFlowState {
  return {
    step: 'identity',
    identity: {
      operatorName: 'PilotOp Ltd',
      jurisdictions: ['UKGC', 'MGA'],
      regulators: ['GamCom', 'MGA'],
      primaryContactEmail: 'dev@pilotop.example',
    },
    wallet: {
      provider: 'generic-pam',
      baseUrl: 'https://wallet.pilotop.example',
      apiSecret: 'super-long-secret-shhhh',
      operatorId: 'pilot-1',
      connectionTested: true,
      connectionLatencyMs: 42,
    },
    catalog: { kernelIds: ['kernel-a'], templateIds: [] },
    compliance: {
      attestations: { UKGC: true, MGA: true },
      signedByName: 'Bojan',
      signedAtIso: '2026-05-18T12:00:00Z',
    },
    preview: { approved: true, notes: 'go live' },
    draftHistory: [],
  };
}

describe('pilot flow — meta', () => {
  it('has 5 steps in order', () => {
    expect(PILOT_STEPS.map((s) => s.id)).toEqual([
      'identity',
      'wallet',
      'catalog',
      'compliance',
      'preview',
    ]);
  });

  it('every step has an i18n key', () => {
    for (const s of PILOT_STEPS) {
      expect(s.i18nKey).toMatch(/^onboarding\.pilot\./);
    }
  });

  it('default state starts at identity step', () => {
    expect(defaultPilotFlowState().step).toBe('identity');
  });
});

describe('validateIdentity', () => {
  it('requires name + email + jurisdictions + regulators', () => {
    const v = validateIdentity({
      operatorName: '',
      jurisdictions: [],
      regulators: [],
      primaryContactEmail: '',
    });
    expect(v.ok).toBe(false);
    expect(v.errors).toContain('operator_name_required');
    expect(v.errors).toContain('contact_email_invalid');
    expect(v.errors).toContain('jurisdictions_required');
    expect(v.errors).toContain('regulators_required');
  });

  it('rejects malformed email', () => {
    const v = validateIdentity({
      operatorName: 'x',
      jurisdictions: ['UKGC'],
      regulators: ['GamCom'],
      primaryContactEmail: 'not-an-email',
    });
    expect(v.errors).toContain('contact_email_invalid');
  });

  it('accepts a full identity payload', () => {
    expect(validateIdentity(filledState().identity).ok).toBe(true);
  });
});

describe('validateWallet', () => {
  it('rejects non-https baseUrl', () => {
    const v = validateWallet({
      provider: 'generic-pam',
      baseUrl: 'http://insecure.example',
      apiSecret: 'super-long-secret-shhhh',
      operatorId: 'op-1',
      connectionTested: true,
    });
    expect(v.errors).toContain('wallet_baseUrl_must_be_https');
  });

  it('rejects short apiSecret', () => {
    const v = validateWallet({
      provider: 'generic-pam',
      baseUrl: 'https://x.example',
      apiSecret: 'short',
      operatorId: 'op-1',
      connectionTested: true,
    });
    expect(v.errors).toContain('wallet_apiSecret_too_short');
  });

  it('requires a tested connection before advancing', () => {
    const v = validateWallet({
      provider: 'generic-pam',
      baseUrl: 'https://x.example',
      apiSecret: 'super-long-secret-shhhh',
      operatorId: 'op-1',
      connectionTested: false,
    });
    expect(v.errors).toContain('wallet_connection_test_required');
  });

  it('accepts a fully filled wallet step', () => {
    expect(validateWallet(filledState().wallet).ok).toBe(true);
  });
});

describe('validateCatalog', () => {
  it('requires at least one item', () => {
    const v = validateCatalog({ kernelIds: [], templateIds: [] });
    expect(v.errors).toContain('catalog_pick_at_least_one');
  });

  it('accepts either kernels or templates', () => {
    expect(validateCatalog({ kernelIds: ['k1'], templateIds: [] }).ok).toBe(true);
    expect(validateCatalog({ kernelIds: [], templateIds: ['t1'] }).ok).toBe(true);
  });
});

describe('validateCompliance', () => {
  it('flags every unsigned jurisdiction', () => {
    const v = validateCompliance(
      {
        attestations: { UKGC: true },
        signedByName: 'me',
        signedAtIso: '2026-05-18T00:00:00Z',
      },
      ['UKGC', 'MGA']
    );
    expect(v.errors).toContain('compliance_MGA_unsigned');
  });

  it('passes when all jurisdictions signed', () => {
    const v = validateCompliance(filledState().compliance, ['UKGC', 'MGA']);
    expect(v.ok).toBe(true);
  });
});

describe('validatePreview', () => {
  it('requires approval', () => {
    expect(validatePreview({ approved: false, notes: '' }).ok).toBe(false);
    expect(validatePreview({ approved: true, notes: '' }).ok).toBe(true);
  });
});

describe('transitions', () => {
  it('nextStep blocks when current step invalid', () => {
    const s = defaultPilotFlowState();
    const after = nextStep(s);
    expect(after.step).toBe('identity');
  });

  it('nextStep advances past identity once valid', () => {
    const s: PilotFlowState = { ...filledState(), step: 'identity' };
    expect(nextStep(s).step).toBe('wallet');
  });

  it('prevStep walks backwards', () => {
    const s: PilotFlowState = { ...filledState(), step: 'wallet' };
    expect(prevStep(s).step).toBe('identity');
  });

  it('prevStep is a no-op at the first step', () => {
    const s = defaultPilotFlowState();
    expect(prevStep(s).step).toBe('identity');
  });

  it('jumpTo overrides the current step', () => {
    const s = defaultPilotFlowState();
    expect(jumpTo(s, 'preview').step).toBe('preview');
  });

  it('full chain advances identity → wallet → catalog → compliance → preview', () => {
    let s: PilotFlowState = { ...filledState(), step: 'identity' };
    s = nextStep(s);
    expect(s.step).toBe('wallet');
    s = nextStep(s);
    expect(s.step).toBe('catalog');
    s = nextStep(s);
    expect(s.step).toBe('compliance');
    s = nextStep(s);
    expect(s.step).toBe('preview');
    s = nextStep(s);
    expect(s.step).toBe('preview');
  });
});

describe('validateStep + validateAll', () => {
  it('validateStep dispatches to the right validator', () => {
    expect(validateStep(filledState(), 'identity').ok).toBe(true);
  });

  it('validateAll only true when every step passes', () => {
    expect(validateAll(filledState()).ok).toBe(true);
    expect(validateAll(defaultPilotFlowState()).ok).toBe(false);
  });
});

describe('draft persistence', () => {
  let storage: MemStorage;
  beforeEach(() => {
    storage = new MemStorage();
  });

  it('saveDraft stamps the history + writes to storage', () => {
    const s = saveDraft(filledState(), storage);
    expect(s.draftHistory.length).toBe(1);
    expect(storage.getItem('corti-pilot-flow')).toBeTruthy();
  });

  it('loadDraft rehydrates the state', () => {
    saveDraft(filledState(), storage);
    const loaded = loadDraft(storage);
    expect(loaded).not.toBeNull();
    expect(loaded!.identity.operatorName).toBe('PilotOp Ltd');
    expect(loaded!.wallet.provider).toBe('generic-pam');
  });

  it('loadDraft returns null when no draft saved', () => {
    expect(loadDraft(storage)).toBeNull();
  });

  it('loadDraft merges missing fields with defaults', () => {
    storage.setItem(
      'corti-pilot-flow',
      JSON.stringify({ step: 'wallet', identity: { operatorName: 'partial' } })
    );
    const loaded = loadDraft(storage);
    expect(loaded!.step).toBe('wallet');
    expect(loaded!.identity.operatorName).toBe('partial');
    expect(loaded!.identity.jurisdictions).toEqual([]);
  });

  it('clearDraft removes the entry', () => {
    saveDraft(filledState(), storage);
    clearDraft(storage);
    expect(storage.getItem('corti-pilot-flow')).toBeNull();
  });

  it('saveDraft caps history at 10 entries', () => {
    let s: PilotFlowState = filledState();
    for (let i = 0; i < 15; i++) {
      s = saveDraft(s, storage);
    }
    expect(s.draftHistory.length).toBe(10);
  });
});

describe('buildSubmission', () => {
  it('produces a clean payload for submission', () => {
    const sub = buildSubmission(filledState());
    expect(sub.operator.name).toBe('PilotOp Ltd');
    expect(sub.wallet.provider).toBe('generic-pam');
    expect(sub.wallet.config.apiSecret).toBe('super-long-secret-shhhh');
    expect(sub.compliance.attestedJurisdictions.sort()).toEqual(['MGA', 'UKGC']);
  });

  it('only includes attested jurisdictions', () => {
    const state = filledState();
    state.compliance.attestations = { UKGC: true, MGA: false };
    const sub = buildSubmission(state);
    expect(sub.compliance.attestedJurisdictions).toEqual(['UKGC']);
  });
});

describe('estimateMinutesRemaining', () => {
  it('60 minutes at the start', () => {
    expect(estimateMinutesRemaining(defaultPilotFlowState())).toBe(60);
  });

  it('drops as we advance', () => {
    const s = jumpTo(defaultPilotFlowState(), 'preview');
    expect(estimateMinutesRemaining(s)).toBeLessThanOrEqual(10);
  });
});
