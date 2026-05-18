// CORTI W206-ONBOARDING — onboarding mini-app shared types.

export type Route = 'landing' | 'signup' | 'verify' | 'plans' | 'wizard' | 'dashboard';

export type Tier = 'trial' | 'pro' | 'enterprise';

export interface PlanFeatures {
  tier: Tier;
  name: string;
  priceLabel: string;
  priceDetail: string;
  popular: boolean;
  features: { label: string; included: boolean }[];
  cta: string;
}

export interface SignupFormState {
  email: string;
  company: string;
  jurisdiction: string;
  useCase: string;
  password: string;
  confirmPassword: string;
}

export interface SignupResult {
  tenantId: string;
  licenseKey: string;
  trialExpiresAt: string;
  tier: Tier;
  verified: boolean;
}

export type WizardStepId = 'workspace' | 'gdd' | 'play' | 'certify' | 'package';

export interface WizardStep {
  id: WizardStepId;
  title: string;
  description: string;
  cta: string;
  deeplink: string;
}

export interface WizardState {
  current: number;
  completed: Set<WizardStepId>;
}

export interface OnboardingState {
  route: Route;
  signup: SignupFormState;
  signupErrors: Partial<Record<keyof SignupFormState, string>>;
  result: SignupResult | null;
  selectedTier: Tier;
  wizard: WizardState;
}
