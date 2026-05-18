// Mock-data loader. Fetches the JSON payloads sitting next to the app
// at runtime (vite serves them via the relative `./data/*` paths). In
// vitest we import them through node:fs since fetch is not available
// by default; the test harness sets globalThis.__OP_DATA__ instead.

import type { OperatorGame, ABTest, Submission, RtpSample, ComplianceCell, Jurisdiction } from '@shared/types.js';

interface GamesPayload { games: OperatorGame[] }
interface AbPayload { tests: ABTest[] }
interface SubsPayload { submissions: Submission[] }

const RUNTIME_BASE = './data';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${RUNTIME_BASE}/${path}`);
  if (!res.ok) throw new Error(`failed to load ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadGames(): Promise<OperatorGame[]> {
  const j = await fetchJson<GamesPayload>('mock-games.json');
  return j.games;
}
export async function loadAbTests(): Promise<ABTest[]> {
  const j = await fetchJson<AbPayload>('mock-ab-tests.json');
  return j.tests;
}
export async function loadSubmissions(): Promise<Submission[]> {
  const j = await fetchJson<SubsPayload>('mock-submissions.json');
  return j.submissions;
}

// Deterministic mock RTP series. Seeded by game-id so reload is stable.
// Produces 24 hourly buckets ending now. Anomalies (rtp delta > 2pp) get
// injected for games whose hash maps below a threshold.
export function makeRtpSeries(game: OperatorGame, buckets = 24): RtpSample[] {
  const seed = hashStr(game.gameId);
  const rng = mulberry32(seed);
  const baseline = game.rtp;
  const now = Date.now();
  const HOUR = 3600 * 1000;
  // Anomaly probability tied to seed parity — keeps roughly 12% anomalous.
  const anomaly = (seed % 100) < 12;
  const out: RtpSample[] = [];
  for (let i = buckets - 1; i >= 0; i--) {
    const wobble = (rng() - 0.5) * 0.012;            // ±0.6pp jitter
    const spike  = anomaly && i < 4 ? 0.025 : 0;     // 2.5pp dip last 4h
    out.push({
      gameId: game.gameId,
      timestamp: now - i * HOUR,
      rtp: clamp01(baseline + wobble - spike),
      spins: Math.floor(2000 + rng() * 4000),
    });
  }
  return out;
}

export function isAnomaly(series: RtpSample[], baseline: number, threshold = 0.02): boolean {
  if (series.length === 0) return false;
  for (const s of series) {
    if (Math.abs(s.rtp - baseline) > threshold) return true;
  }
  return false;
}

// Roll-up live/pending counts per jurisdiction.
export function computeCompliance(games: OperatorGame[], subs: Submission[]): ComplianceCell[] {
  const ALL: Jurisdiction[] = ['UKGC','MGA','NV','NJ','PA','MI','ON','BC','AAMS','DGA','SGA','KSA','GBGA','SK','AGCO'];
  const byJ = new Map<Jurisdiction, ComplianceCell>();
  for (const j of ALL) byJ.set(j, { jurisdiction: j, liveCount: 0, pendingCount: 0, violationCount: 0 });
  for (const g of games) {
    if (g.status !== 'live') continue;
    for (const j of g.jurisdictions) {
      const c = byJ.get(j); if (c) c.liveCount += 1;
    }
  }
  for (const s of subs) {
    if (s.status === 'pending' || s.status === 'in_review') {
      const c = byJ.get(s.jurisdiction); if (c) c.pendingCount += 1;
    }
    if (s.status === 'rejected' || s.status === 'needs_revision') {
      const c = byJ.get(s.jurisdiction); if (c) c.violationCount += 1;
    }
  }
  return Array.from(byJ.values());
}

// Decide A/B winner using a simple ≥1pp RTP delta gate.
export function promoteWinner(test: ABTest, minRtpDeltaPp = 1): 'A' | 'B' | null {
  const delta = (test.variantB.rtp - test.variantA.rtp) * 100;
  if (Math.abs(delta) < minRtpDeltaPp) return null;
  return delta > 0 ? 'B' : 'A';
}

// ── helpers ────────────────────────────────────────────────────────────

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
