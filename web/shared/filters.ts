// Generic filter / sort helpers shared between operator and regulator.
// Pure functions, no DOM, so they are trivially unit-testable.

import type {
  OperatorGame,
  Submission,
  GameStatus,
  SubmissionStatus,
  Jurisdiction,
} from './types.js';

export interface GameFilter {
  search?: string;
  status?: GameStatus | 'any';
  jurisdiction?: Jurisdiction | 'any';
  rtpMin?: number;
  rtpMax?: number;
}

export function filterGames(games: OperatorGame[], f: GameFilter): OperatorGame[] {
  const q = (f.search ?? '').trim().toLowerCase();
  return games.filter((g) => {
    if (q.length > 0) {
      const hay = `${g.name} ${g.gameId} ${g.pid} ${g.supplier}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.status && f.status !== 'any' && g.status !== f.status) return false;
    if (f.jurisdiction && f.jurisdiction !== 'any' && !g.jurisdictions.includes(f.jurisdiction))
      return false;
    if (typeof f.rtpMin === 'number' && g.rtp < f.rtpMin) return false;
    if (typeof f.rtpMax === 'number' && g.rtp > f.rtpMax) return false;
    return true;
  });
}

export interface SubmissionFilter {
  search?: string;
  status?: SubmissionStatus | 'any';
  jurisdiction?: Jurisdiction | 'any';
}

export function filterSubmissions(
  subs: Submission[],
  f: SubmissionFilter,
): Submission[] {
  const q = (f.search ?? '').trim().toLowerCase();
  return subs.filter((s) => {
    if (q.length > 0) {
      const hay = `${s.gameName} ${s.gameId} ${s.operator} ${s.submissionId}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.status && f.status !== 'any' && s.status !== f.status) return false;
    if (f.jurisdiction && f.jurisdiction !== 'any' && s.jurisdiction !== f.jurisdiction)
      return false;
    return true;
  });
}

// Stable sort helper that returns a new array (does not mutate input).
export function sortBy<T>(arr: T[], key: (t: T) => number | string, dir: 'asc' | 'desc' = 'asc'): T[] {
  const out = arr.slice();
  out.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return dir === 'asc' ? -1 : 1;
    if (ka > kb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  return out;
}
