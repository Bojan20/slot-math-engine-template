// Shared types used by both operator dashboard (web/operator) and the
// regulator portal (web/regulator). These mirror the column shapes of the
// mock JSON payloads under each app's data/ dir. We keep this lightweight
// — no engine imports — so the mini-apps stay independent of the heavy
// `src/` engine tree.

export type GameStatus = 'live' | 'paused' | 'draft' | 'archived';
export type Vola = 'LOW' | 'MID' | 'HIGH';

export type Jurisdiction =
  | 'UKGC'
  | 'MGA'
  | 'NV'
  | 'NJ'
  | 'PA'
  | 'MI'
  | 'ON'
  | 'BC'
  | 'AAMS'
  | 'DGA'
  | 'SGA'
  | 'KSA'
  | 'GBGA'
  | 'SK'
  | 'AGCO';

export interface OperatorGame {
  gameId: string;
  name: string;
  version: string;
  rtp: number;            // 0..1
  status: GameStatus;
  jurisdictions: Jurisdiction[];
  vola: Vola;
  dailyRevenueUsd: number;
  hitFrequency: number;   // 0..1
  lastUpdated: string;    // ISO date
  pid: string;            // industry-pattern id, e.g. P-012
  supplier: string;
  family: string;         // 'cascade' | 'cluster' | 'lines' | 'ways' | etc
}

export interface ABTest {
  testId: string;
  gameId: string;
  variantA: { rtp: number; spinsToDate: number; winRate: number };
  variantB: { rtp: number; spinsToDate: number; winRate: number };
  trafficSplitB: number;     // 0..1
  startedAt: string;
  status: 'running' | 'paused' | 'completed';
  jurisdiction: Jurisdiction;
}

export type SubmissionStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_revision';

export interface Submission {
  submissionId: string;
  gameId: string;
  gameName: string;
  operator: string;
  jurisdiction: Jurisdiction;
  status: SubmissionStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  submittedAt: string;
  reviewer?: string;
  notes?: string;
  rtp: number;
  parSheetUrl: string;
  merkleRoot: string;
  packageSizeKb: number;
}

export interface ComplianceCell {
  jurisdiction: Jurisdiction;
  liveCount: number;
  pendingCount: number;
  violationCount: number;
}

// RTP monitoring sample — one row per (gameId, timestamp).
export interface RtpSample {
  gameId: string;
  timestamp: number;    // ms epoch
  rtp: number;          // 0..1
  spins: number;
}
