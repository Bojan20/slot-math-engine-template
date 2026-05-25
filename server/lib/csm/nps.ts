/**
 * W215 Faza 1300.0 Agent C — NPS survey system.
 *
 * Captures Net Promoter Score responses, auto-classifies each into
 * detractor / passive / promoter, runs a deterministic keyword-based
 * sentiment pass over the free-form comment, and exposes an aggregator
 * that turns the response set into the canonical NPS score formula:
 *
 *     score = (% promoters - % detractors) * 100
 *
 * Real SMTP delivery is out of scope (deferred to the W21x email
 * provider integration); this module exposes `composeInvite()` which
 * produces the email body and a deterministic, single-use token. The
 * caller passes the token via the no-auth `POST /responses` endpoint.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export type NpsCategory = 'detractor' | 'passive' | 'promoter';
export type NpsSentiment = 'positive' | 'neutral' | 'negative' | 'unknown';

export interface NpsResponse {
  id: string;
  tenantId: string;
  respondentEmail: string;
  /** Integer 0..10. */
  scoreOutOf10: number;
  comment: string;
  surveyDate: string;
  category: NpsCategory;
  sentiment: NpsSentiment;
  /** Thematic tags extracted from the comment. */
  tags: string[];
}

export interface NpsResponseInput {
  tenantId: string;
  respondentEmail: string;
  scoreOutOf10: number;
  comment?: string;
  /** Optional explicit survey date (defaults to now). */
  surveyDate?: string;
}

export interface NpsAggregate {
  totalResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** -100..100 (rounded to nearest int). */
  score: number;
  meanScore: number;
}

export interface NpsInvite {
  token: string;
  subject: string;
  body: string;
  expiresAt: string;
}

/** Classify an NPS score into the canonical Bain & Co categories. */
export function classifyScore(score: number): NpsCategory {
  if (!Number.isInteger(score)) {
    throw new RangeError('nps: score must be an integer 0..10');
  }
  if (score < 0 || score > 10) {
    throw new RangeError('nps: score must be 0..10');
  }
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

const POSITIVE_WORDS = [
  'love',
  'great',
  'excellent',
  'fast',
  'helpful',
  'amazing',
  'smooth',
  'reliable',
  'easy',
  'fantastic',
  'awesome',
  'best',
];
const NEGATIVE_WORDS = [
  'slow',
  'broken',
  'bug',
  'crash',
  'terrible',
  'awful',
  'frustrated',
  'difficult',
  'hate',
  'confusing',
  'worst',
  'unstable',
];

const THEME_TAGS: ReadonlyArray<{ tag: string; words: ReadonlyArray<string> }> = [
  { tag: 'performance', words: ['fast', 'slow', 'latency', 'speed', 'performance'] },
  { tag: 'reliability', words: ['crash', 'bug', 'broken', 'down', 'unstable', 'reliable'] },
  { tag: 'support', words: ['support', 'help', 'response', 'csm', 'ticket'] },
  { tag: 'pricing', words: ['price', 'cost', 'expensive', 'cheap', 'value'] },
  { tag: 'ux', words: ['ui', 'ux', 'design', 'workflow', 'easy', 'confusing'] },
  { tag: 'compliance', words: ['cert', 'regulator', 'lab', 'compliance', 'jurisdiction'] },
];

/** Simple keyword-based sentiment (no LLM). Deterministic. */
export function classifySentiment(comment: string): NpsSentiment {
  const norm = comment.toLowerCase();
  if (norm.trim().length === 0) return 'unknown';
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE_WORDS) if (norm.includes(w)) pos += 1;
  for (const w of NEGATIVE_WORDS) if (norm.includes(w)) neg += 1;
  if (pos === 0 && neg === 0) return 'neutral';
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

/** Extract thematic tags from a comment. */
export function extractTags(comment: string): string[] {
  const norm = comment.toLowerCase();
  const tags = new Set<string>();
  for (const t of THEME_TAGS) {
    for (const w of t.words) {
      if (norm.includes(w)) {
        tags.add(t.tag);
        break;
      }
    }
  }
  return [...tags].sort();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class NpsStore {
  private readonly byId = new Map<string, NpsResponse>();
  private readonly tokens = new Map<
    string,
    { tenantId: string; email: string; expiresAt: number }
  >();

  record(input: NpsResponseInput): NpsResponse {
    if (!input.tenantId) throw new RangeError('nps: bad tenantId');
    if (!EMAIL_RE.test(input.respondentEmail)) {
      throw new RangeError('nps: bad respondentEmail');
    }
    classifyScore(input.scoreOutOf10);
    const comment = (input.comment ?? '').trim().slice(0, 2000);
    const surveyDate = input.surveyDate ?? new Date().toISOString();
    if (!Number.isFinite(Date.parse(surveyDate))) {
      throw new RangeError('nps: bad surveyDate');
    }
    const r: NpsResponse = {
      id: randomUUID(),
      tenantId: input.tenantId,
      respondentEmail: input.respondentEmail.toLowerCase(),
      scoreOutOf10: input.scoreOutOf10,
      comment,
      surveyDate,
      category: classifyScore(input.scoreOutOf10),
      sentiment: classifySentiment(comment),
      tags: extractTags(comment),
    };
    this.byId.set(r.id, r);
    return r;
  }

  get(id: string): NpsResponse | null {
    return this.byId.get(id) ?? null;
  }

  list(filter: { tenantId?: string; since?: string } = {}): NpsResponse[] {
    let rows = Array.from(this.byId.values());
    if (filter.tenantId) rows = rows.filter((r) => r.tenantId === filter.tenantId);
    if (filter.since) {
      const t = Date.parse(filter.since);
      rows = rows.filter((r) => Date.parse(r.surveyDate) >= t);
    }
    return rows.sort((a, b) => b.surveyDate.localeCompare(a.surveyDate));
  }

  aggregate(filter: { tenantId?: string; since?: string } = {}): NpsAggregate {
    const rows = this.list(filter);
    const total = rows.length;
    const promoters = rows.filter((r) => r.category === 'promoter').length;
    const passives = rows.filter((r) => r.category === 'passive').length;
    const detractors = rows.filter((r) => r.category === 'detractor').length;
    const meanScore =
      total === 0
        ? 0
        : rows.reduce((acc, r) => acc + r.scoreOutOf10, 0) / total;
    const score =
      total === 0
        ? 0
        : Math.round(((promoters - detractors) / total) * 100);
    return {
      totalResponses: total,
      promoters,
      passives,
      detractors,
      score,
      meanScore: Math.round(meanScore * 10) / 10,
    };
  }

  /** Compose an invite + tokenized link (no email actually sent). */
  composeInvite(
    tenantId: string,
    email: string,
    now: number = Date.now(),
    ttlDays: number = 14,
  ): NpsInvite {
    if (!EMAIL_RE.test(email)) throw new RangeError('nps: bad email');
    const token = createHash('sha256')
      .update(`${tenantId}|${email}|${randomBytes(16).toString('hex')}`)
      .digest('hex')
      .slice(0, 32);
    const expiresAtMs = now + ttlDays * 24 * 60 * 60 * 1000;
    this.tokens.set(token, {
      tenantId,
      email: email.toLowerCase(),
      expiresAt: expiresAtMs,
    });
    const expiresAt = new Date(expiresAtMs).toISOString();
    const subject = 'How are we doing? (1-minute NPS survey)';
    const body = [
      `Hi,`,
      ``,
      `We would love to hear from you. On a scale of 0-10, how likely`,
      `are you to recommend the Vendor B slot-math platform to a colleague?`,
      ``,
      `Click to respond (link expires ${expiresAt}):`,
      ``,
      `  https://platform.example.com/csm/nps/respond?token=${token}`,
      ``,
      `Thanks for taking the time.`,
      `— Customer Success`,
    ].join('\n');
    return { token, subject, body, expiresAt };
  }

  /** Redeem an invite token; throws if invalid / expired. */
  redeemToken(
    token: string,
    now: number = Date.now(),
  ): { tenantId: string; email: string } {
    const entry = this.tokens.get(token);
    if (!entry) throw new RangeError('nps: bad token');
    if (entry.expiresAt < now) {
      this.tokens.delete(token);
      throw new RangeError('nps: token expired');
    }
    this.tokens.delete(token);
    return { tenantId: entry.tenantId, email: entry.email };
  }

  size(): number {
    return this.byId.size;
  }

  reset(): void {
    this.byId.clear();
    this.tokens.clear();
  }
}
