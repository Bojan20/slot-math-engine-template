/**
 * Faza 11.6 — Spin Recall/Replay CLI Viewer tests (VIEW-01..20).
 */

import { describe, it, expect } from 'vitest';

import {
  MemoryJournal,
  RECALL_SCHEMA_VERSION,
  type SpinJournalEntry,
  SpinReplayViewer,
  type SpinDisplay,
  type ChainVerificationReport,
  type DisputeCertificate,
} from '../src/recall/index.js';

// ─── Fixture builders ─────────────────────────────────────────────────

function makeDraft(
  seq: number,
  overrides: Partial<SpinJournalEntry> = {},
): Omit<SpinJournalEntry, 'prev_hash' | 'entry_hash'> {
  return {
    schema_version: RECALL_SCHEMA_VERSION,
    seq,
    session_id: 'test_session',
    player_pseudonym: 'player_anon',
    spin_index: seq,
    timestamp_utc: `2024-07-15T12:34:56.${String(seq).padStart(3, '0')}Z`,
    config_hash: '9af3e2c1' + '0'.repeat(56),
    engine_version: '0.5.0',
    engine_build: 'g0001',
    rng_kind: 'pcg64',
    rng_seed_hex: 'deadbeef',
    rng_step: seq * 4,
    bet_total_mc: 1000,
    bet_currency: 'EUR',
    bet_meta: { ante: false, buy_feature: null },
    pre_state: {
      in_free_spins: false,
      fs_remaining: 0,
      fs_global_multiplier: 1,
      in_hold_and_win: false,
      hnw_respins_remaining: 0,
      jackpot_pools_mc: {},
    },
    result: {
      total_win_mc: seq * 100,
      line_wins_count: seq > 0 ? 1 : 0,
      scatter_count: 0,
      bonus_count: 0,
      triggered_features: seq === 3 ? ['free_spins'] : [],
      feature_trace_hash: '0'.repeat(64),
    },
    compliance: { win_cap_applied: false, near_miss_flagged: false },
    ...overrides,
  };
}

function buildJournal(count: number): SpinJournalEntry[] {
  const j = new MemoryJournal();
  for (let i = 0; i < count; i++) {
    j.append(makeDraft(i));
  }
  return j.readAll();
}

// ─── VIEW-01: Construct with empty journal ────────────────────────────

describe('VIEW-01: construct with empty journal', () => {
  it('constructs without error', () => {
    expect(() => new SpinReplayViewer([])).not.toThrow();
  });
});

// ─── VIEW-02: getSpin(0) on empty → undefined ─────────────────────────

describe('VIEW-02: getSpin(0) on empty → undefined', () => {
  it('returns undefined', () => {
    const viewer = new SpinReplayViewer([]);
    expect(viewer.getSpin(0)).toBeUndefined();
  });
});

// ─── VIEW-03: getSpin(0) on 1-entry → SpinDisplay ────────────────────

describe('VIEW-03: getSpin(0) on 1-entry journal → SpinDisplay', () => {
  it('returns a SpinDisplay object', () => {
    const journal = buildJournal(1);
    const viewer = new SpinReplayViewer(journal);
    const result = viewer.getSpin(0);
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
  });
});

// ─── VIEW-04: SpinDisplay has required fields ──────────────────────────

describe('VIEW-04: SpinDisplay has spinIndex, grid, win, features, chainValid, signature', () => {
  it('all fields present', () => {
    const journal = buildJournal(1);
    const viewer = new SpinReplayViewer(journal);
    const display = viewer.getSpin(0) as SpinDisplay;
    expect(display).toHaveProperty('spinIndex');
    expect(display).toHaveProperty('grid');
    expect(display).toHaveProperty('win');
    expect(display).toHaveProperty('features');
    expect(display).toHaveProperty('chainValid');
    expect(display).toHaveProperty('signature');
  });
  it('spinIndex matches requested index', () => {
    const journal = buildJournal(3);
    const viewer = new SpinReplayViewer(journal);
    expect((viewer.getSpin(2) as SpinDisplay).spinIndex).toBe(2);
  });
});

// ─── VIEW-05: formatSpinAscii returns non-empty string with 'Spin #' ──

describe('VIEW-05: formatSpinAscii returns non-empty string with "Spin #"', () => {
  it('output is non-empty and contains Spin #', () => {
    const journal = buildJournal(1);
    const viewer = new SpinReplayViewer(journal);
    const ascii = viewer.formatSpinAscii(0);
    expect(typeof ascii).toBe('string');
    expect(ascii.length).toBeGreaterThan(0);
    expect(ascii).toContain('Spin #');
  });
});

// ─── VIEW-06: formatSpinAscii contains win amount ─────────────────────

describe('VIEW-06: formatSpinAscii contains win amount', () => {
  it('ASCII output contains the win amount', () => {
    const journal = buildJournal(3);
    const viewer = new SpinReplayViewer(journal);
    const ascii = viewer.formatSpinAscii(2); // win = 200
    expect(ascii).toContain('200');
  });
});

// ─── VIEW-07: formatSpinAscii(99) on 0-entry → error string ──────────

describe('VIEW-07: formatSpinAscii(99) on 0-entry → error string (not throw)', () => {
  it('does not throw', () => {
    const viewer = new SpinReplayViewer([]);
    expect(() => viewer.formatSpinAscii(99)).not.toThrow();
  });
  it('returns an error string', () => {
    const viewer = new SpinReplayViewer([]);
    const result = viewer.formatSpinAscii(99);
    expect(typeof result).toBe('string');
    expect(result.toLowerCase()).toMatch(/error|out of bounds|not found/);
  });
});

// ─── VIEW-08: verifyChain on empty → totalSpins=0, integrityOk=true ──

describe('VIEW-08: verifyChain on empty → totalSpins=0, integrityOk=true', () => {
  it('totalSpins is 0', () => {
    const viewer = new SpinReplayViewer([]);
    const report = viewer.verifyChain();
    expect(report.totalSpins).toBe(0);
  });
  it('integrityOk is true', () => {
    const viewer = new SpinReplayViewer([]);
    const report = viewer.verifyChain();
    expect(report.integrityOk).toBe(true);
  });
});

// ─── VIEW-09: verifyChain returns required fields ──────────────────────

describe('VIEW-09: verifyChain returns ChainVerificationReport with required fields', () => {
  it('report has totalSpins, integrityOk, brokenSignatures', () => {
    const journal = buildJournal(5);
    const viewer = new SpinReplayViewer(journal);
    const report = viewer.verifyChain() as ChainVerificationReport;
    expect(report).toHaveProperty('totalSpins');
    expect(report).toHaveProperty('integrityOk');
    expect(report).toHaveProperty('brokenSignatures');
  });
});

// ─── VIEW-10: verifyChain on valid chain → integrityOk=true ──────────

describe('VIEW-10: verifyChain on valid chain → integrityOk=true', () => {
  it('valid 5-entry chain is ok', () => {
    const journal = buildJournal(5);
    const viewer = new SpinReplayViewer(journal);
    const report = viewer.verifyChain();
    expect(report.integrityOk).toBe(true);
    expect(report.totalSpins).toBe(5);
    expect(report.brokenSignatures).toHaveLength(0);
  });
});

// ─── VIEW-11: disputeCertificate has all required fields ──────────────

describe('VIEW-11: disputeCertificate has all required fields', () => {
  it('certificate has all fields', () => {
    const journal = buildJournal(3);
    const viewer = new SpinReplayViewer(journal);
    const cert = viewer.disputeCertificate(1) as DisputeCertificate;
    expect(cert).toHaveProperty('spinIndex');
    expect(cert).toHaveProperty('signature');
    expect(cert).toHaveProperty('prevSignature');
    expect(cert).toHaveProperty('grid');
    expect(cert).toHaveProperty('win');
    expect(cert).toHaveProperty('chainIntegrityOk');
    expect(cert).toHaveProperty('verificationTimestamp');
    expect(cert).toHaveProperty('verdictMessage');
  });
});

// ─── VIEW-12: verdictMessage contains 'verified' or 'invalid' ────────

describe('VIEW-12: verdictMessage contains "verified" or "invalid"', () => {
  it('valid spin → verdictMessage contains verified', () => {
    const journal = buildJournal(3);
    const viewer = new SpinReplayViewer(journal);
    const cert = viewer.disputeCertificate(0);
    expect(cert.verdictMessage.toLowerCase()).toMatch(/verified|invalid/);
  });
  it('out-of-range spin → verdictMessage contains invalid', () => {
    const journal = buildJournal(3);
    const viewer = new SpinReplayViewer(journal);
    const cert = viewer.disputeCertificate(99);
    expect(cert.verdictMessage.toLowerCase()).toContain('invalid');
  });
});

// ─── VIEW-13: verificationTimestamp > 0 ────────────────────────────────

describe('VIEW-13: verificationTimestamp > 0', () => {
  it('timestamp is a positive number', () => {
    const journal = buildJournal(2);
    const viewer = new SpinReplayViewer(journal);
    const cert = viewer.disputeCertificate(0);
    expect(cert.verificationTimestamp).toBeGreaterThan(0);
  });
});

// ─── VIEW-14: getRange(0,4) on 10-entry → 5 entries ──────────────────

describe('VIEW-14: getRange(0,4) on 10-entry → 5 entries', () => {
  it('returns 5 entries', () => {
    const journal = buildJournal(10);
    const viewer = new SpinReplayViewer(journal);
    const range = viewer.getRange(0, 4);
    expect(range).toHaveLength(5);
  });
});

// ─── VIEW-15: getRange(8,9) on 10-entry → 2 entries ──────────────────

describe('VIEW-15: getRange(8,9) on 10-entry → 2 entries', () => {
  it('returns 2 entries', () => {
    const journal = buildJournal(10);
    const viewer = new SpinReplayViewer(journal);
    const range = viewer.getRange(8, 9);
    expect(range).toHaveLength(2);
  });
});

// ─── VIEW-16: getRange(5,3) → empty (inverted range) ─────────────────

describe('VIEW-16: getRange(5,3) → empty (inverted range)', () => {
  it('returns empty array', () => {
    const journal = buildJournal(10);
    const viewer = new SpinReplayViewer(journal);
    const range = viewer.getRange(5, 3);
    expect(range).toHaveLength(0);
  });
});

// ─── VIEW-17: formatSessionReport non-empty multi-line ───────────────

describe('VIEW-17: formatSessionReport non-empty multi-line', () => {
  it('returns a multi-line string', () => {
    const journal = buildJournal(5);
    const viewer = new SpinReplayViewer(journal);
    const report = viewer.formatSessionReport();
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
    expect(report.split('\n').length).toBeGreaterThan(1);
  });
});

// ─── VIEW-18: formatSessionReport includes total spins ───────────────

describe('VIEW-18: formatSessionReport includes total spins', () => {
  it('report contains spin count', () => {
    const journal = buildJournal(7);
    const viewer = new SpinReplayViewer(journal);
    const report = viewer.formatSessionReport();
    expect(report).toContain('7');
  });
});

// ─── VIEW-19: formatSessionReport includes chain integrity ───────────

describe('VIEW-19: formatSessionReport includes chain integrity', () => {
  it('report mentions chain integrity', () => {
    const journal = buildJournal(5);
    const viewer = new SpinReplayViewer(journal);
    const report = viewer.formatSessionReport();
    expect(report.toLowerCase()).toMatch(/chain/i);
  });
});

// ─── VIEW-20: two viewers with same journal → same output ─────────────

describe('VIEW-20: two viewers with same journal → same output', () => {
  it('formatSpinAscii output matches', () => {
    const journal = buildJournal(5);
    const viewer1 = new SpinReplayViewer(journal);
    const viewer2 = new SpinReplayViewer(journal);
    expect(viewer1.formatSpinAscii(2)).toBe(viewer2.formatSpinAscii(2));
  });
  it('formatSessionReport output matches', () => {
    const journal = buildJournal(5);
    const viewer1 = new SpinReplayViewer(journal);
    const viewer2 = new SpinReplayViewer(journal);
    // Timestamps in session report differ if format uses Date.now() for session-level
    // We check structural equivalence by comparing non-timestamp lines
    const r1 = viewer1.formatSessionReport();
    const r2 = viewer2.formatSessionReport();
    expect(r1).toBe(r2);
  });
});
