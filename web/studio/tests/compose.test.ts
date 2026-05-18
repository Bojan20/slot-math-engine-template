// W199-COMPOSE — node-graph feature editor specs.
//
// Pure logic tests against the compose module — no DOM coupling.
// Covers: palette catalog shape, node CRUD, connection creation,
// multi-select / bulk delete semantics, template loading,
// composed RTP calculation, validation (missing input, circular
// dep, trigger sum), and snapshot round-trip.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FEATURE_PALETTE,
  TEMPLATES,
  emptyGraph,
  addNode,
  addEdge,
  removeNodes,
  validateGraph,
  computeComposedRTP,
  loadTemplate,
  snapshotGraph,
  restoreGraph,
  resetIdSeed,
  exportToIRBlob,
  createComposeBridge,
  type ComposeGraph,
} from '../src/compose.js';

beforeEach(() => {
  resetIdSeed(1);
});

describe('feature palette catalog', () => {
  it('has 18+ feature entries across the three required categories', () => {
    expect(FEATURE_PALETTE.length).toBeGreaterThanOrEqual(18);
    const cats = new Set(FEATURE_PALETTE.map((p) => p.category));
    expect(cats.has('Triggers')).toBe(true);
    expect(cats.has('Mechanics')).toBe(true);
    expect(cats.has('Modifiers')).toBe(true);
  });

  it('covers every required mechanic in the kimi spec', () => {
    const required = [
      'scatter_trigger',
      'anywhere_trigger',
      'mystery_trigger',
      'hold_and_win',
      'free_spins',
      'cascade',
      'cluster',
      'expanding_wilds',
      'walking_wilds',
      'sticky_wilds',
      'pick_bonus',
      'wheel_bonus',
      'symbol_upgrade',
      'multiplier_ladder',
      'variable_multiplier',
      'sticky_multiplier',
      'retrigger',
      'persistent_state',
      'compound_trigger',
    ];
    const kinds = new Set(FEATURE_PALETTE.map((p) => p.kind));
    for (const k of required) expect(kinds.has(k)).toBe(true);
  });

  it('every palette entry declares a formula string', () => {
    for (const p of FEATURE_PALETTE) {
      expect(typeof p.formula).toBe('string');
      expect(p.formula.length).toBeGreaterThan(4);
    }
  });
});

describe('node CRUD', () => {
  it('addNode places a node with default params and unique id', () => {
    const g = emptyGraph();
    const a = addNode(g, 'free_spins', 50, 60);
    const b = addNode(g, 'free_spins', 200, 60);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).not.toBe(b!.id);
    expect(a!.params.spinCount).toBe(10);
    expect(g.nodes.length).toBe(2);
  });

  it('addNode returns null for unknown kind', () => {
    const g = emptyGraph();
    expect(addNode(g, 'nonsense_kind', 0, 0)).toBeNull();
    expect(g.nodes.length).toBe(0);
  });

  it('removeNodes bulk-deletes nodes AND their incident edges (multi-select semantics)', () => {
    const g = emptyGraph();
    const a = addNode(g, 'scatter_trigger', 0, 0)!;
    const b = addNode(g, 'free_spins', 200, 0)!;
    const c = addNode(g, 'variable_multiplier', 400, 0)!;
    addEdge(g, a.id, 'trigger', b.id, 'trigger');
    addEdge(g, b.id, 'payout', c.id, 'payout');
    expect(g.edges.length).toBe(2);
    // Shift-select two nodes and bulk-delete.
    removeNodes(g, [a.id, b.id]);
    expect(g.nodes.length).toBe(1);
    expect(g.nodes[0].id).toBe(c.id);
    expect(g.edges.length).toBe(0);
  });
});

describe('connection creation (port → port)', () => {
  it('addEdge creates a bezier edge between two distinct nodes', () => {
    const g = emptyGraph();
    const a = addNode(g, 'scatter_trigger', 0, 0)!;
    const b = addNode(g, 'free_spins', 200, 0)!;
    const e = addEdge(g, a.id, 'trigger', b.id, 'trigger');
    expect(e).not.toBeNull();
    expect(g.edges.length).toBe(1);
    expect(g.edges[0].fromNode).toBe(a.id);
    expect(g.edges[0].toNode).toBe(b.id);
  });

  it('addEdge rejects self-loops and deduplicates identical edges', () => {
    const g = emptyGraph();
    const a = addNode(g, 'scatter_trigger', 0, 0)!;
    const b = addNode(g, 'free_spins', 200, 0)!;
    expect(addEdge(g, a.id, 'trigger', a.id, 'trigger')).toBeNull();
    addEdge(g, a.id, 'trigger', b.id, 'trigger');
    addEdge(g, a.id, 'trigger', b.id, 'trigger');
    expect(g.edges.length).toBe(1);
  });
});

describe('template loading', () => {
  it('exposes exactly 5 templates with the required ids', () => {
    const ids = TEMPLATES.map((t) => t.id).sort();
    expect(ids).toEqual([
      'classic_lines',
      'cluster',
      'free_spins',
      'hold_and_win',
      'megaways',
    ]);
  });

  it('Free Spins template wires scatter → FS → multiplier', () => {
    const g = loadTemplate('free_spins');
    expect(g.nodes.length).toBe(3);
    expect(g.edges.length).toBe(2);
    expect(g.nodes.some((n) => n.kind === 'scatter_trigger')).toBe(true);
    expect(g.nodes.some((n) => n.kind === 'free_spins')).toBe(true);
    expect(g.nodes.some((n) => n.kind === 'variable_multiplier')).toBe(true);
  });

  it('Classic Lines template loads an empty graph (base only)', () => {
    const g = loadTemplate('classic_lines');
    expect(g.nodes.length).toBe(0);
    expect(g.edges.length).toBe(0);
  });
});

describe('composed RTP', () => {
  it('returns the base RTP when no features are present', () => {
    const r = computeComposedRTP(emptyGraph());
    expect(r.base).toBeCloseTo(0.82, 3);
    expect(r.contributions.length).toBe(0);
    expect(r.total).toBeCloseTo(0.82, 3);
  });

  it('sums per-feature contributions and the total equals base + sum (capped at 1.0)', () => {
    const g = emptyGraph();
    addNode(g, 'cascade', 0, 0);          // +0.06
    addNode(g, 'variable_multiplier', 200, 0); // +0.04
    const r = computeComposedRTP(g);
    const sum = r.contributions.reduce((a, c) => a + c.contribution, 0);
    expect(r.total).toBeCloseTo(Math.min(1.0, r.base + sum), 6);
    expect(r.total).toBeGreaterThan(r.base);
  });

  it('caps the total at 1.0 even with many high-contribution features', () => {
    const g = emptyGraph();
    for (let i = 0; i < 12; i++) addNode(g, 'free_spins', i * 10, 0);
    const r = computeComposedRTP(g);
    expect(r.total).toBeLessThanOrEqual(1.0);
  });
});

describe('validation', () => {
  it('flags missing required input on a mechanic node', () => {
    const g = emptyGraph();
    addNode(g, 'free_spins', 0, 0); // requires "trigger" input
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'missing_input')).toBe(true);
  });

  it('passes when all required inputs are wired', () => {
    const g = loadTemplate('free_spins');
    const r = validateGraph(g);
    // Scatter has 0 inputs, FS has its trigger wired, VM has its payout wired.
    expect(r.ok).toBe(true);
  });

  it('detects a circular dependency between two nodes', () => {
    const g = emptyGraph();
    const a = addNode(g, 'retrigger', 0, 0)!;
    const b = addNode(g, 'compound_trigger', 200, 0)!;
    addEdge(g, a.id, 'trigger', b.id, 'trigger');
    addEdge(g, b.id, 'trigger', a.id, 'trigger');
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'circular')).toBe(true);
  });

  it('detects trigger probability sum exceeding 1.0 on a single sink', () => {
    const g = emptyGraph();
    const a = addNode(g, 'mystery_trigger', 0, 0)!;
    a.params.probability = 0.7;
    const b = addNode(g, 'mystery_trigger', 0, 100)!;
    b.params.probability = 0.6;
    const c = addNode(g, 'hold_and_win', 200, 50)!;
    addEdge(g, a.id, 'trigger', c.id, 'trigger');
    addEdge(g, b.id, 'trigger', c.id, 'trigger');
    const r = validateGraph(g);
    expect(r.issues.some((i) => i.kind === 'trigger_sum')).toBe(true);
  });
});

describe('save / restore round-trip', () => {
  it('snapshotGraph → restoreGraph produces a deep-equal graph', () => {
    const g = loadTemplate('hold_and_win');
    const snap = snapshotGraph(g);
    const g2 = restoreGraph(snap);
    expect(g2.nodes.length).toBe(g.nodes.length);
    expect(g2.edges.length).toBe(g.edges.length);
    // Deep params equality
    for (let i = 0; i < g.nodes.length; i++) {
      expect(g2.nodes[i].kind).toBe(g.nodes[i].kind);
      expect(g2.nodes[i].params).toEqual(g.nodes[i].params);
    }
    expect(JSON.stringify(g2)).toBe(JSON.stringify(g));
  });

  it('snapshot is decoupled — mutating original does not affect snapshot', () => {
    const g = loadTemplate('free_spins');
    const snap = snapshotGraph(g);
    (g.nodes[0].params as Record<string, unknown>).triggerCount = 999;
    const g2 = restoreGraph(snap);
    expect(g2.nodes[0].params.triggerCount).not.toBe(999);
  });
});

describe('IR export', () => {
  it('exportToIRBlob emits one feature per node and stamps the composed RTP', () => {
    const g = loadTemplate('free_spins');
    const ir = exportToIRBlob(g);
    expect(ir.features.length).toBe(g.nodes.length);
    expect(typeof ir.composedRtp).toBe('number');
    expect(ir.composedRtp).toBeGreaterThan(0.82);
  });
});

describe('compose bridge (window API surface)', () => {
  it('createComposeBridge exposes palette + templates + CRUD + validate', () => {
    const c = createComposeBridge();
    expect(c.palette.length).toBeGreaterThanOrEqual(18);
    expect(c.templates.length).toBe(5);
    const n = c.addNode('cascade', 0, 0);
    expect(n).not.toBeNull();
    const g: ComposeGraph = c.getGraph();
    expect(g.nodes.length).toBe(1);
    c.loadTemplate('megaways');
    expect(c.getGraph().nodes.length).toBeGreaterThan(0);
    const r = c.validate();
    expect(r).toHaveProperty('ok');
    expect(r).toHaveProperty('issues');
  });
});
