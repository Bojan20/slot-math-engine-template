import { describe, it, expect } from 'vitest';
import {
  ClassIIBingoCoordinator,
  InMemoryBingoPool,
  type Ticket,
  type BingoRng,
} from '../src/evaluators/classIIBingoCoordinator.js';
import {
  applySkillModulation,
  type SkillEnvelope,
} from '../src/features/skillInfluencedOutcome.js';
import { PROFILES } from '../src/jurisdiction/profiles.js';

// ─── Class II coordinator helpers ─────────────────────────────────────────────

/** Deterministic test RNG — uses a tiny LCG so we don't pull a real RNG. */
class TestRng implements BingoRng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  randInt(n: number): number {
    this.state = (this.state * 1103515245 + 12345) >>> 0;
    return this.state % n;
  }
}

function makePool(n: number, prizeXFor: (i: number) => number): Ticket[] {
  const tickets: Ticket[] = [];
  for (let i = 0; i < n; i++) {
    tickets.push({ id: i, prizeX: prizeXFor(i) });
  }
  return tickets;
}

// ─── InMemoryBingoPool ────────────────────────────────────────────────────────

describe('InMemoryBingoPool', () => {
  it('takeAt removes the ticket and reduces size', () => {
    const pool = new InMemoryBingoPool([
      { id: 0, prizeX: 1 },
      { id: 1, prizeX: 2 },
      { id: 2, prizeX: 3 },
    ]);
    expect(pool.size()).toBe(3);
    const t = pool.takeAt(1);
    expect(t.id).toBe(1);
    expect(pool.size()).toBe(2);
    expect(pool.remainingTotalPrizeX()).toBe(1 + 3);
  });

  it('takeAt out of range throws', () => {
    const pool = new InMemoryBingoPool([{ id: 0, prizeX: 1 }]);
    expect(() => pool.takeAt(-1)).toThrow(/out of range/);
    expect(() => pool.takeAt(99)).toThrow(/out of range/);
  });

  it('reseed restores from template and resets remainingTotalPrizeX', () => {
    const pool = new InMemoryBingoPool([{ id: 0, prizeX: 1 }]);
    pool.takeAt(0);
    expect(pool.size()).toBe(0);
    expect(pool.remainingTotalPrizeX()).toBe(0);
    pool.reseed([{ id: 0, prizeX: 5 }, { id: 1, prizeX: 10 }]);
    expect(pool.size()).toBe(2);
    expect(pool.remainingTotalPrizeX()).toBe(15);
  });
});

// ─── ClassIIBingoCoordinator — construction ───────────────────────────────────

describe('ClassIIBingoCoordinator — construction', () => {
  it('rejects empty pool template', () => {
    expect(
      () =>
        new ClassIIBingoCoordinator({
          poolId: 'p',
          poolTemplate: [],
          rng: new TestRng(1),
        })
    ).toThrow(/poolTemplate must be non-empty/);
  });

  it('rejects empty poolId', () => {
    expect(
      () =>
        new ClassIIBingoCoordinator({
          poolId: '',
          poolTemplate: [{ id: 0, prizeX: 1 }],
          rng: new TestRng(1),
        })
    ).toThrow(/poolId required/);
  });

  it('rejects duplicate ticket ids', () => {
    expect(
      () =>
        new ClassIIBingoCoordinator({
          poolId: 'p',
          poolTemplate: [
            { id: 1, prizeX: 1 },
            { id: 1, prizeX: 2 },
          ],
          rng: new TestRng(1),
        })
    ).toThrow(/duplicate ticket id/);
  });

  it('rejects negative prizeX', () => {
    expect(
      () =>
        new ClassIIBingoCoordinator({
          poolId: 'p',
          poolTemplate: [{ id: 0, prizeX: -1 }],
          rng: new TestRng(1),
        })
    ).toThrow(/negative prizeX/);
  });
});

// ─── ClassIIBingoCoordinator — draw mechanics ─────────────────────────────────

describe('ClassIIBingoCoordinator — draw', () => {
  it('draw removes a ticket and reduces pool size', () => {
    const coord = new ClassIIBingoCoordinator({
      poolId: 'p',
      poolTemplate: makePool(10, () => 1),
      rng: new TestRng(42),
    });
    const before = coord.snapshot();
    expect(before.remainingTickets).toBe(10);

    const r = coord.draw();
    expect(r.ticket).toBeDefined();
    expect(r.poolAfter.remainingTickets).toBe(9);
    expect(r.poolAfter.drawnTickets).toBe(1);
  });

  it('draws are without replacement (every ticket id at most once per cycle)', () => {
    const coord = new ClassIIBingoCoordinator({
      poolId: 'p',
      poolTemplate: makePool(50, (i) => i),
      rng: new TestRng(7),
    });
    const seen = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const { ticket } = coord.draw();
      expect(seen.has(ticket.id)).toBe(false);
      seen.add(ticket.id);
    }
    expect(seen.size).toBe(50);
  });

  it('auto-resets cycle when pool drains', () => {
    const coord = new ClassIIBingoCoordinator({
      poolId: 'p',
      poolTemplate: makePool(3, () => 1),
      rng: new TestRng(11),
      cycleResetMode: 'auto',
    });
    for (let i = 0; i < 4; i++) coord.draw();
    const snap = coord.snapshot();
    expect(snap.currentCycle).toBe(1);
    expect(snap.drawnTickets).toBe(1);
  });

  it('manual cycle mode throws when pool drains', () => {
    const coord = new ClassIIBingoCoordinator({
      poolId: 'p',
      poolTemplate: makePool(2, () => 1),
      rng: new TestRng(13),
      cycleResetMode: 'manual',
    });
    coord.draw();
    coord.draw();
    expect(() => coord.draw()).toThrow(/pool empty/);
    coord.resetCycle();
    const r = coord.draw();
    expect(r.cycleIndex).toBe(1);
  });

  it('snapshot tracks remainingTotalPrizeX correctly', () => {
    const coord = new ClassIIBingoCoordinator({
      poolId: 'p',
      poolTemplate: [
        { id: 0, prizeX: 10 },
        { id: 1, prizeX: 20 },
        { id: 2, prizeX: 30 },
      ],
      rng: new TestRng(1),
    });
    expect(coord.snapshot().remainingTotalPrizeX).toBe(60);
    const r = coord.draw();
    expect(r.poolAfter.remainingTotalPrizeX).toBe(60 - r.ticket.prizeX);
  });

  it('theoretical RTP is Σ prizeX / |pool|', () => {
    const coord = new ClassIIBingoCoordinator({
      poolId: 'p',
      poolTemplate: makePool(4, (i) => i),
      rng: new TestRng(1),
    });
    expect(coord.poolTheoreticalRtp()).toBe((0 + 1 + 2 + 3) / 4);
  });

  it('full cycle sums to total prize pool (conservation invariant)', () => {
    const tpl = makePool(20, (i) => i * 2);
    const totalPrize = tpl.reduce((s, t) => s + t.prizeX, 0);
    const coord = new ClassIIBingoCoordinator({
      poolId: 'p',
      poolTemplate: tpl,
      rng: new TestRng(99),
    });
    let observed = 0;
    for (let i = 0; i < 20; i++) {
      observed += coord.draw().ticket.prizeX;
    }
    expect(observed).toBe(totalPrize);
  });

  it('determinism: same seed → same draw sequence', () => {
    const tpl = makePool(15, (i) => i);
    const coord1 = new ClassIIBingoCoordinator({
      poolId: 'p',
      poolTemplate: tpl,
      rng: new TestRng(2026),
    });
    const coord2 = new ClassIIBingoCoordinator({
      poolId: 'p',
      poolTemplate: tpl,
      rng: new TestRng(2026),
    });
    for (let i = 0; i < 10; i++) {
      const a = coord1.draw();
      const b = coord2.draw();
      expect(a.ticket.id).toBe(b.ticket.id);
    }
  });
});

// ─── Skill modulator ──────────────────────────────────────────────────────────

const envelope: SkillEnvelope = {
  rtpFloor: 0.85,
  rtpCeiling: 0.95,
  mode: 'multiplier',
};

describe('applySkillModulation', () => {
  it('skillScore=0 yields realisedRtp = floor', () => {
    const r = applySkillModulation({
      rawWin: 1000,
      declaredRtp: 0.90,
      skillScore: 0,
      envelope,
    });
    expect(r.realisedRtp).toBe(0.85);
  });

  it('skillScore=1 yields realisedRtp = ceiling', () => {
    const r = applySkillModulation({
      rawWin: 1000,
      declaredRtp: 0.90,
      skillScore: 1,
      envelope,
    });
    expect(r.realisedRtp).toBe(0.95);
  });

  it('skillScore=0.5 lies exactly midpoint', () => {
    const r = applySkillModulation({
      rawWin: 1000,
      declaredRtp: 0.90,
      skillScore: 0.5,
      envelope,
    });
    expect(r.realisedRtp).toBeCloseTo(0.90, 12);
  });

  it('clamps skillScore < 0 to 0', () => {
    const r = applySkillModulation({
      rawWin: 1000,
      declaredRtp: 0.90,
      skillScore: -3,
      envelope,
    });
    expect(r.audit.skillScore).toBe(0);
  });

  it('clamps skillScore > 1 to 1', () => {
    const r = applySkillModulation({
      rawWin: 1000,
      declaredRtp: 0.90,
      skillScore: 99,
      envelope,
    });
    expect(r.audit.skillScore).toBe(1);
  });

  it('modulatedWin = rawWin × multiplier, truncated toward zero', () => {
    const r = applySkillModulation({
      rawWin: 1000,
      declaredRtp: 1.0,
      skillScore: 1,
      envelope,
    });
    expect(r.modulatedWin).toBe(950);
  });

  it('rejects declaredRtp <= 0', () => {
    expect(() =>
      applySkillModulation({ rawWin: 1, declaredRtp: 0, skillScore: 0.5, envelope })
    ).toThrow(/declaredRtp/);
  });

  it('rejects envelope with ceiling <= floor', () => {
    expect(() =>
      applySkillModulation({
        rawWin: 1,
        declaredRtp: 0.9,
        skillScore: 0.5,
        envelope: { rtpFloor: 0.9, rtpCeiling: 0.9, mode: 'multiplier' },
      })
    ).toThrow(/rtpCeiling/);
  });

  it('rejects envelope with swing < 0.01 (Reg 14 §14.040(11))', () => {
    expect(() =>
      applySkillModulation({
        rawWin: 1,
        declaredRtp: 0.9,
        skillScore: 0.5,
        envelope: { rtpFloor: 0.90, rtpCeiling: 0.905, mode: 'multiplier' },
      })
    ).toThrow(/swing must be ≥ 0.01/);
  });

  it('audit record carries all inputs + outputs for regulator replay', () => {
    const r = applySkillModulation({
      rawWin: 500,
      declaredRtp: 0.9,
      skillScore: 0.5,
      envelope,
    });
    expect(r.audit.rawWin).toBe(500);
    expect(r.audit.modulatedWin).toBe(r.modulatedWin);
    expect(r.audit.declaredRtp).toBe(0.9);
    expect(r.audit.realisedRtp).toBeCloseTo(0.9, 12);
  });
});

// ─── Jurisdiction profile presence ────────────────────────────────────────────

describe('Faza 14.3 — jurisdiction profiles', () => {
  it('PROFILES carries ADM_VLT (land-based Italy)', () => {
    const p = PROFILES.get('ADM_VLT');
    expect(p).toBeDefined();
    expect(p!.maxStakeDefault).toBe(10.0);
    expect(p!.maxWinX).toBe(5000);
    expect(p!.prohibitAutoplay).toBe(true);
  });

  it('PROFILES carries NIGC_C2 (Class II bingo)', () => {
    const p = PROFILES.get('NIGC_C2');
    expect(p).toBeDefined();
    expect(p!.prohibitedFeatures).toContain('cascade');
    expect(p!.prohibitedFeatures).toContain('respin');
  });

  it('PROFILES carries NV_SKILL (Nevada skill-influenced)', () => {
    const p = PROFILES.get('NV_SKILL');
    expect(p).toBeDefined();
    expect(p!.requiredNearMissRule).toBe('allowed_within_distribution');
  });

  it('all 11 profiles are reachable from the registry', () => {
    const ids = ['UKGC', 'MGA', 'ADM', 'BMM', 'GLI19', 'AGCO', 'DGA', 'NJDGE', 'ADM_VLT', 'NIGC_C2', 'NV_SKILL'];
    for (const id of ids) {
      expect(PROFILES.get(id), `${id} must be present`).toBeDefined();
    }
  });
});
