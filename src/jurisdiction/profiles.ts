/**
 * Faza 11.9 — Jurisdiction Profiles.
 * Last updated: 2026-05 (Faza 11.9 baseline).
 */

import type { JurisdictionProfile } from './types.js';

const UKGC: JurisdictionProfile = {
  id: 'UKGC',
  name: 'UK Gambling Commission',
  rtpRange: [0.94, 0.99],
  maxWinX: undefined,
  prohibitedFeatures: ['gamble', 'buy_feature'],
  requireLdwDisclosure: true,
  requireSessionTimeDisplay: true,
  requiredNearMissRule: 'must_be_random',
  informationalNotes: [
    'Auto-play is prohibited for online slots (LCCP SR Code 7.1.2, effective 31 Oct 2021).',
    'Maximum stake must not exceed £125 per spin for online slots.',
    'RNG must hold a certificate from an approved test house (GLI, BMM, iTech Labs).',
    'Mandatory RTP disclosure to players on game load screen.',
    'Bonus buy (direct feature purchase) is prohibited since Oct 2021.',
  ],
};

const MGA: JurisdictionProfile = {
  id: 'MGA',
  name: 'Malta Gaming Authority',
  rtpRange: [0.92, 0.99],
  maxWinX: 250_000,
  prohibitedFeatures: [],
  requireLdwDisclosure: true,
  requireSessionTimeDisplay: true,
  requiredNearMissRule: 'must_be_random',
  informationalNotes: [
    'Session time reminder must display every 60 minutes.',
    'Reality checks are required but not modelled in IR.',
    'RNG must be certified by an approved test laboratory.',
    'gamble and buy_feature are permitted under MGA framework.',
  ],
};

const ADM: JurisdictionProfile = {
  id: 'ADM',
  name: 'Agenzia delle Dogane e dei Monopoli (Italy)',
  rtpRange: [0.85, 0.97],
  maxWinX: 1_000,
  prohibitedFeatures: ['gamble'],
  requireLdwDisclosure: true,
  requireSessionTimeDisplay: true,
  requiredNearMissRule: 'must_be_random',
  informationalNotes: [
    'AWP (mechanical reel) RTP range is 0.70–0.85 — different from VLT.',
    'Maximum jackpot per play: €100 (AWP) or €1,000 (VLT).',
    'Mandatory session time limits (break required after 3h on VLT).',
    'Only EUR currency is allowed.',
    'Auto-play is prohibited.',
  ],
};

const BMM: JurisdictionProfile = {
  id: 'BMM',
  name: 'BMM Testlabs / GLI-16',
  rtpRange: [0.80, 0.99],
  maxWinX: undefined,
  prohibitedFeatures: [],
  requireLdwDisclosure: false,
  requireSessionTimeDisplay: false,
  requiredNearMissRule: 'must_be_random',
  informationalNotes: [
    'GLI-16 v3 requires RTP verification within ±0.05% of declared value over statistical cycle.',
    'PAR sheet must be available and match IR declarations (Faza 4 par module satisfies this).',
    'RNG must pass DieHarder and NIST statistical test suites.',
    'Recall capability (hash-chained audit trail) required for GLI-16 §4.5 (Faza 8.5 satisfies this).',
    'Maximum win cap must match compliance.max_win_cap_required.',
  ],
};

const GLI19: JurisdictionProfile = {
  id: 'GLI19',
  name: 'Gaming Laboratories International Standard 19',
  rtpRange: [0.80, 0.99],
  maxWinX: undefined,
  prohibitedFeatures: [],
  requireLdwDisclosure: false,
  requireSessionTimeDisplay: false,
  requiredNearMissRule: 'must_be_random',
  informationalNotes: [
    'Hash-chained spin audit trail required (Faza 8.5 recall journal satisfies this).',
    'Minimum 5-year audit log retention.',
    'Tamper-evident log with cryptographic integrity verification.',
    'Replay capability from any stored spin required.',
    'AES-based or otherwise certified CSPRNG required (Philox4x32 satisfies GLI §3.2).',
  ],
};

const AGCO: JurisdictionProfile = {
  id: 'AGCO',
  name: 'Alcohol and Gaming Commission of Ontario',
  rtpRange: [0.85, 0.99],
  maxWinX: undefined,
  prohibitedFeatures: ['gamble'],
  requireLdwDisclosure: true,
  requireSessionTimeDisplay: true,
  requiredNearMissRule: 'must_be_random',
  informationalNotes: [
    'Mandatory pre-commitment tools — not modelled in IR.',
    'Loss limits must be configurable by player.',
    'Auto-play restricted (manual stop required).',
    'RNG certificate from GLI, BMM, or eCOGRA required.',
  ],
};

const DGA: JurisdictionProfile = {
  id: 'DGA',
  name: 'Spillemyndigheden (Denmark)',
  rtpRange: [0.92, 0.99],
  maxWinX: undefined,
  prohibitedFeatures: [],
  requireLdwDisclosure: true,
  requireSessionTimeDisplay: true,
  requiredNearMissRule: 'must_be_random',
  informationalNotes: [
    'Responsible gambling tools must be integrated (not in IR).',
    'Advertising restrictions: no celebrity endorsements.',
    'Self-exclusion integration with ROFUS required.',
    'RNG must be tested by accredited test house.',
  ],
};

const NJDGE: JurisdictionProfile = {
  id: 'NJDGE',
  name: 'New Jersey Division of Gaming Enforcement',
  rtpRange: [0.83, 0.99],
  maxWinX: undefined,
  prohibitedFeatures: [],
  requireLdwDisclosure: true,
  requireSessionTimeDisplay: true,
  requiredNearMissRule: 'must_be_random',
  informationalNotes: [
    'RNG must be approved by NJDGE or a DGE-approved testing lab.',
    'PAR sheet submission required for each game variant.',
    'All games must be tested at minimum 10M cycle.',
    'No skill-based elements unless separately licensed.',
  ],
};

export const PROFILES: ReadonlyMap<string, JurisdictionProfile> = new Map([
  ['UKGC', UKGC],
  ['MGA', MGA],
  ['ADM', ADM],
  ['BMM', BMM],
  ['GLI19', GLI19],
  ['AGCO', AGCO],
  ['DGA', DGA],
  ['NJDGE', NJDGE],
]);
