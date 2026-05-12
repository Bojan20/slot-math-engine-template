/**
 * Faza 11.9 — Jurisdiction Adapter: Core Types.
 */

import type { SlotGameIR } from '../ir/types.js';

export type JurisdictionId =
  | 'UKGC' | 'MGA' | 'ADM' | 'BMM' | 'GLI19' | 'AGCO' | 'DGA' | 'NJDGE'
  | string;

export type ViolationSeverity = 'error' | 'warning' | 'info';

export interface ComplianceViolation {
  ruleId: string;
  jurisdiction: JurisdictionId;
  severity: ViolationSeverity;
  message: string;
  field?: string;
  actual?: unknown;
  required?: unknown;
  canAutoFix: boolean;
}

export interface ComplianceSummary {
  errors: number;
  warnings: number;
  infos: number;
  autoFixable: number;
}

export interface ComplianceReport {
  checkedJurisdictions: JurisdictionId[];
  violations: ComplianceViolation[];
  isCompliant: boolean;
  autoFixable: boolean;
  summary: ComplianceSummary;
}

export interface AppliedFix {
  ruleId: string;
  description: string;
}

export interface AutoFixResult {
  ir: SlotGameIR;
  appliedFixes: AppliedFix[];
  remainingViolations: ComplianceViolation[];
  isFullyCompliant: boolean;
}

export interface JurisdictionProfile {
  readonly id: JurisdictionId;
  readonly name: string;
  readonly rtpRange: [number, number];
  readonly maxWinX?: number;
  readonly prohibitedFeatures: ReadonlyArray<string>;
  readonly requireLdwDisclosure: boolean;
  readonly requireSessionTimeDisplay: boolean;
  readonly requiredNearMissRule?: 'must_be_random' | 'allowed_within_distribution';
  readonly informationalNotes: ReadonlyArray<string>;
}
