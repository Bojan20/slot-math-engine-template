// CORTI W206-ONBOARDING — plan catalog + form validation helpers.

import type { PlanFeatures, SignupFormState, Tier } from './types.js';

export const PLANS: PlanFeatures[] = [
  {
    tier: 'trial',
    name: 'Trial',
    priceLabel: 'Free',
    priceDetail: '30 days · no card',
    popular: false,
    cta: 'Start free trial',
    features: [
      { label: '3 games', included: true },
      { label: '50 MC runs / day', included: true },
      { label: '5 cert submissions / mo', included: true },
      { label: 'Community support', included: true },
      { label: 'PAR sheet PDF export', included: true },
      { label: '24h email SLA', included: false },
      { label: 'Dedicated CSM', included: false },
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    priceLabel: '$5,000',
    priceDetail: 'per month',
    popular: true,
    cta: 'Upgrade to Pro',
    features: [
      { label: '25 games', included: true },
      { label: '1,000 MC runs / day', included: true },
      { label: '50 cert submissions / mo', included: true },
      { label: 'Email support · 24h SLA', included: true },
      { label: 'PAR sheet PDF export', included: true },
      { label: 'GaaS WebSocket', included: true },
      { label: 'Dedicated CSM', included: false },
    ],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    priceLabel: '$25,000',
    priceDetail: 'per month',
    popular: false,
    cta: 'Contact sales',
    features: [
      { label: 'Unlimited games', included: true },
      { label: 'Unlimited MC runs', included: true },
      { label: 'Unlimited cert submissions', included: true },
      { label: 'Phone + dedicated CSM', included: true },
      { label: 'On-prem deploy option', included: true },
      { label: 'White-label branding', included: true },
      { label: 'Custom SLA', included: true },
    ],
  },
];

export const ALL_JURISDICTIONS = [
  'UKGC',
  'MGA',
  'SE',
  'NJ',
  'PA',
  'MI',
  'ON',
  'BC',
  'NV',
  'AAMS',
  'DGA',
  'SGA',
  'KSA',
  'GBGA',
  'SK',
  'AGCO',
  'GENERIC',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidationResult {
  ok: boolean;
  errors: Partial<Record<keyof SignupFormState, string>>;
}

export function validateSignup(form: SignupFormState): ValidationResult {
  const errors: ValidationResult['errors'] = {};
  if (!form.email || !EMAIL_RE.test(form.email)) errors.email = 'Valid email required';
  if (!form.company || form.company.trim().length < 2) errors.company = 'Company name required';
  if (!form.jurisdiction || !ALL_JURISDICTIONS.includes(form.jurisdiction.toUpperCase())) {
    errors.jurisdiction = 'Pick a jurisdiction';
  }
  if (!form.useCase || form.useCase.trim().length < 4) errors.useCase = 'Tell us your use case';
  const pw = passwordStrength(form.password);
  if (pw.score < 3) errors.password = pw.message;
  if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match';
  return { ok: Object.keys(errors).length === 0, errors };
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  message: string;
}

export function passwordStrength(pw: string): PasswordStrength {
  let score = 0;
  if (!pw) return { score: 0, message: 'Password required' };
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) && pw.length >= 12) score = Math.min(4, score + 1) as 0 | 1 | 2 | 3 | 4;
  const labels = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;
  return { score: score as 0 | 1 | 2 | 3 | 4, message: labels[score] };
}

export function planFor(tier: Tier): PlanFeatures {
  const p = PLANS.find((x) => x.tier === tier);
  if (!p) throw new RangeError(`unknown tier: ${tier}`);
  return p;
}

export function defaultSignupForm(): SignupFormState {
  return {
    email: '',
    company: '',
    jurisdiction: 'UKGC',
    useCase: '',
    password: '',
    confirmPassword: '',
  };
}

/**
 * Hit the backend signup endpoint. Returns the parsed body on 201, or
 * throws on validation error / network failure.
 */
export async function submitSignup(
  form: SignupFormState,
  baseUrl: string = 'http://localhost:4000'
): Promise<{
  tenantId: string;
  licenseKey: string;
  trialExpiresAt: string;
  tier: Tier;
  verified: boolean;
}> {
  const res = await fetch(`${baseUrl}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: form.email,
      company: form.company,
      jurisdiction: form.jurisdiction,
      useCase: form.useCase,
      password: form.password,
    }),
  });
  const body = await res.json();
  if (res.status !== 201) {
    throw new Error(body.error ?? 'signup_failed');
  }
  return body;
}
