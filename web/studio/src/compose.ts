// W199-COMPOSE — Node-graph feature editor (state + logic).
//
// Pure TS module — no DOM coupling. Provides:
//   • Feature palette catalog (18+ items in 3 categories)
//   • Graph state (nodes + edges) with CRUD + selection
//   • Validation (missing inputs, circular deps, trigger sums)
//   • Composed RTP calculation (base + per-feature contributions)
//   • 5 template presets (Classic Lines / Megaways / Cluster /
//     Free Spins / Hold & Win)
//   • Save/restore JSON round-trip
//   • IR export hook (graph → feature config blob)
//
// The DOM render layer lives in `app.js` (`renderCompose()` plus
// helpers). This module is consumed via `window.__studio_compose__`.

export type ComposeCategory = 'Triggers' | 'Mechanics' | 'Modifiers';

export interface PaletteEntry {
  /** Stable kind id used in graph nodes + IR export. */
  kind: string;
  /** Display label in palette + node card. */
  label: string;
  /** Three-bucket grouping. */
  category: ComposeCategory;
  /** Parameter defaults the inspector shows + edits. */
  defaults: Record<string, unknown>;
  /** Required input-port names (for validation). */
  inputs: string[];
  /** Output-port names (declared for symmetry). */
  outputs: string[];
  /** Closed-form (or sketch) formula for inspector display. */
  formula: string;
  /** RTP contribution heuristic (proportion of base RTP). */
  rtpContribution: number;
}

export const FEATURE_PALETTE: PaletteEntry[] = [
  // ── Triggers ─────────────────────────────────────────────────
  {
    kind: 'scatter_trigger',
    label: 'Scatter Trigger',
    category: 'Triggers',
    defaults: { count: 3, type: 'scatter' },
    inputs: [],
    outputs: ['trigger'],
    formula: 'P_trig = C(R, k) · p^k · (1-p)^(R-k)',
    rtpContribution: 0,
  },
  {
    kind: 'anywhere_trigger',
    label: 'Anywhere Trigger',
    category: 'Triggers',
    defaults: { count: 3 },
    inputs: [],
    outputs: ['trigger'],
    formula: 'P_trig = sum over positions of indicator(count >= k)',
    rtpContribution: 0,
  },
  {
    kind: 'mystery_trigger',
    label: 'Mystery Trigger',
    category: 'Triggers',
    defaults: { probability: 0.012 },
    inputs: [],
    outputs: ['trigger'],
    formula: 'P_trig = p_mystery (per-spin Bernoulli)',
    rtpContribution: 0,
  },

  // ── Mechanics ────────────────────────────────────────────────
  {
    kind: 'hold_and_win',
    label: 'Hold & Win',
    category: 'Mechanics',
    defaults: { orbCount: 6, respinReset: 3, jackpotTiers: 4 },
    inputs: ['trigger'],
    outputs: ['payout'],
    formula: 'E[HW] = E[orbCount] · E[orbValue] (Markov absorbing chain)',
    rtpContribution: 0.04,
  },
  {
    kind: 'free_spins',
    label: 'Free Spins',
    category: 'Mechanics',
    defaults: { triggerCount: 3, spinCount: 10, retrigger: true, multiplier: 1 },
    inputs: ['trigger'],
    outputs: ['payout'],
    formula: 'E[FS] = N_FS · E[base_spin] · (1 + R)',
    rtpContribution: 0.18,
  },
  {
    kind: 'cascade',
    label: 'Cascade',
    category: 'Mechanics',
    defaults: { maxChain: 8, refillMode: 'gravity' },
    inputs: [],
    outputs: ['payout'],
    formula: 'E[Cascade] = sum_{i=1..C_max} E[win_i] · P(chain >= i)',
    rtpContribution: 0.06,
  },
  {
    kind: 'cluster',
    label: 'Cluster',
    category: 'Mechanics',
    defaults: { minClusterSize: 5, payoutTable: 'cluster.default' },
    inputs: [],
    outputs: ['payout'],
    formula: 'E[Cluster] = sum_{k>=5} P(|C|=k) · pay(k)',
    rtpContribution: 0.05,
  },
  {
    kind: 'expanding_wilds',
    label: 'Expanding Wilds',
    category: 'Mechanics',
    defaults: { trigger: 'wild_land', direction: 'vertical' },
    inputs: ['trigger'],
    outputs: ['payout'],
    formula: 'E[EW] = P(wild_land) · ΔRTP_expanded',
    rtpContribution: 0.03,
  },
  {
    kind: 'walking_wilds',
    label: 'Walking Wilds',
    category: 'Mechanics',
    defaults: { speed: 1, direction: 'right_to_left' },
    inputs: [],
    outputs: ['payout'],
    formula: 'E[WW] = sum_{t=1..L} P(survive_t) · E[win | wild_at_t]',
    rtpContribution: 0.025,
  },
  {
    kind: 'sticky_wilds',
    label: 'Sticky Wilds',
    category: 'Mechanics',
    defaults: { duration: 3 },
    inputs: ['trigger'],
    outputs: ['payout'],
    formula: 'E[SW] = sum_{d=1..D} ΔRTP_d',
    rtpContribution: 0.02,
  },
  {
    kind: 'pick_bonus',
    label: 'Pick Bonus',
    category: 'Mechanics',
    defaults: { pickCount: 3, prizePool: 'tier_a' },
    inputs: ['trigger'],
    outputs: ['payout'],
    formula: 'E[Pick] = N_picks · E[prize | distribution]',
    rtpContribution: 0.03,
  },
  {
    kind: 'wheel_bonus',
    label: 'Wheel Bonus',
    category: 'Mechanics',
    defaults: { tiers: 4, multipliers: [2, 5, 10, 25] },
    inputs: ['trigger'],
    outputs: ['payout'],
    formula: 'E[Wheel] = sum_{i} p_i · multiplier_i · stake',
    rtpContribution: 0.04,
  },
  {
    kind: 'symbol_upgrade',
    label: 'Symbol Upgrade',
    category: 'Mechanics',
    defaults: { upgradeMap: 'LP_to_HP' },
    inputs: [],
    outputs: ['payout'],
    formula: 'E[SU] = P(upgrade) · (E[pay_HP] - E[pay_LP])',
    rtpContribution: 0.015,
  },
  {
    kind: 'multiplier_ladder',
    label: 'Multiplier Ladder',
    category: 'Mechanics',
    defaults: { sequence: [1, 2, 3, 5, 10] },
    inputs: [],
    outputs: ['multiplier'],
    formula: 'E[ML] = sum_{step} P(reach_step) · m_step',
    rtpContribution: 0.04,
  },

  // ── Modifiers ────────────────────────────────────────────────
  {
    kind: 'variable_multiplier',
    label: 'Variable Multiplier',
    category: 'Modifiers',
    defaults: { range: [1, 10] },
    inputs: ['payout'],
    outputs: ['payout'],
    formula: 'E[VM · X] = E[X] · E[multiplier]',
    rtpContribution: 0.04,
  },
  {
    kind: 'sticky_multiplier',
    label: 'Sticky Multiplier',
    category: 'Modifiers',
    defaults: { duration: 5 },
    inputs: ['payout'],
    outputs: ['payout'],
    formula: 'E[SM · X] = E[X] · sum_{t} m_t',
    rtpContribution: 0.025,
  },
  {
    kind: 'retrigger',
    label: 'Retrigger',
    category: 'Modifiers',
    defaults: { probability: 0.18 },
    inputs: ['trigger'],
    outputs: ['trigger'],
    formula: 'E[total_spins] = N / (1 - p_retrigger)',
    rtpContribution: 0.02,
  },
  {
    kind: 'persistent_state',
    label: 'Persistent State',
    category: 'Modifiers',
    defaults: { type: 'meter' },
    inputs: [],
    outputs: ['state'],
    formula: 'E[carry] = sum_{spins} ΔS · P(S_t)',
    rtpContribution: 0.01,
  },
  {
    kind: 'compound_trigger',
    label: 'Compound Trigger',
    category: 'Modifiers',
    defaults: { combineOp: 'AND' },
    inputs: ['trigger', 'trigger'],
    outputs: ['trigger'],
    formula: 'AND: p = p1 · p2  ·  OR: p = 1 - (1-p1)(1-p2)',
    rtpContribution: 0,
  },
];

// ── Graph state ─────────────────────────────────────────────────

export interface ComposeNode {
  id: string;
  kind: string;
  x: number;
  y: number;
  params: Record<string, unknown>;
}

export interface ComposeEdge {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface ComposeGraph {
  nodes: ComposeNode[];
  edges: ComposeEdge[];
}

export function emptyGraph(): ComposeGraph {
  return { nodes: [], edges: [] };
}

let _idSeed = 1;
export function resetIdSeed(n = 1): void {
  _idSeed = n;
}
export function nextId(prefix: string): string {
  return `${prefix}-${_idSeed++}`;
}

export function findPaletteEntry(kind: string): PaletteEntry | undefined {
  return FEATURE_PALETTE.find((p) => p.kind === kind);
}

export function addNode(
  g: ComposeGraph,
  kind: string,
  x: number,
  y: number
): ComposeNode | null {
  const entry = findPaletteEntry(kind);
  if (!entry) return null;
  const node: ComposeNode = {
    id: nextId('n'),
    kind,
    x,
    y,
    params: { ...entry.defaults },
  };
  g.nodes.push(node);
  return node;
}

export function removeNodes(g: ComposeGraph, ids: string[]): void {
  const set = new Set(ids);
  g.nodes = g.nodes.filter((n) => !set.has(n.id));
  g.edges = g.edges.filter((e) => !set.has(e.fromNode) && !set.has(e.toNode));
}

export function addEdge(
  g: ComposeGraph,
  fromNode: string,
  fromPort: string,
  toNode: string,
  toPort: string
): ComposeEdge | null {
  if (fromNode === toNode) return null;
  const dup = g.edges.find(
    (e) =>
      e.fromNode === fromNode &&
      e.fromPort === fromPort &&
      e.toNode === toNode &&
      e.toPort === toPort
  );
  if (dup) return dup;
  const edge: ComposeEdge = {
    id: nextId('e'),
    fromNode,
    fromPort,
    toNode,
    toPort,
  };
  g.edges.push(edge);
  return edge;
}

// ── Validation ──────────────────────────────────────────────────

export interface ValidationIssue {
  nodeId?: string;
  edgeId?: string;
  kind: 'missing_input' | 'circular' | 'unknown_kind' | 'trigger_sum';
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export function validateGraph(g: ComposeGraph): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1) Each node required inputs satisfied.
  for (const n of g.nodes) {
    const entry = findPaletteEntry(n.kind);
    if (!entry) {
      issues.push({
        nodeId: n.id,
        kind: 'unknown_kind',
        message: `Unknown feature kind: ${n.kind}`,
      });
      continue;
    }
    for (let i = 0; i < entry.inputs.length; i++) {
      const port = entry.inputs[i];
      const matchIdx = g.edges.findIndex(
        (e) => e.toNode === n.id && e.toPort === port
      );
      // Compound trigger has 2 same-named ports — accept any 2 incoming.
      if (matchIdx < 0) {
        issues.push({
          nodeId: n.id,
          kind: 'missing_input',
          message: `${entry.label} missing required input "${port}"`,
        });
      }
    }
  }

  // 2) Circular dependency (DFS with grey/black colouring).
  const adj = new Map<string, string[]>();
  for (const n of g.nodes) adj.set(n.id, []);
  for (const e of g.edges) {
    adj.get(e.fromNode)?.push(e.toNode);
  }
  const colour = new Map<string, 0 | 1 | 2>();
  let cyclic = false;
  function dfs(u: string): void {
    if (cyclic) return;
    colour.set(u, 1);
    for (const v of adj.get(u) || []) {
      const c = colour.get(v) || 0;
      if (c === 1) {
        cyclic = true;
        return;
      }
      if (c === 0) dfs(v);
    }
    colour.set(u, 2);
  }
  for (const n of g.nodes) {
    if ((colour.get(n.id) || 0) === 0) dfs(n.id);
    if (cyclic) break;
  }
  if (cyclic) {
    issues.push({
      kind: 'circular',
      message: 'Circular dependency detected in graph',
    });
  }

  // 3) Trigger probability sum > 1 across sibling triggers feeding the
  //    same mechanic — soft heuristic, only when each trigger node has
  //    an explicit `probability` param.
  const triggerSink = new Map<string, number>();
  for (const e of g.edges) {
    if (e.toPort !== 'trigger') continue;
    const src = g.nodes.find((n) => n.id === e.fromNode);
    if (!src) continue;
    const p =
      typeof src.params['probability'] === 'number'
        ? (src.params['probability'] as number)
        : 0;
    if (p > 0) {
      triggerSink.set(e.toNode, (triggerSink.get(e.toNode) || 0) + p);
    }
  }
  for (const [sinkId, sum] of triggerSink.entries()) {
    if (sum > 1.0 + 1e-9) {
      issues.push({
        nodeId: sinkId,
        kind: 'trigger_sum',
        message: `Trigger probabilities sum to ${sum.toFixed(3)} (>1) on node ${sinkId}`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

// ── Composed RTP calc ───────────────────────────────────────────

export interface RTPContribution {
  kind: string;
  label: string;
  contribution: number;
}
export interface ComposedRTP {
  base: number;
  contributions: RTPContribution[];
  total: number;
}

const BASE_RTP = 0.82;

export function computeComposedRTP(g: ComposeGraph): ComposedRTP {
  const contributions: RTPContribution[] = [];
  let sum = BASE_RTP;
  for (const n of g.nodes) {
    const entry = findPaletteEntry(n.kind);
    if (!entry) continue;
    if (entry.rtpContribution > 0) {
      contributions.push({
        kind: entry.kind,
        label: entry.label,
        contribution: entry.rtpContribution,
      });
      sum += entry.rtpContribution;
    }
  }
  // Cap at 1.0 (no over-RTP) so the bars stay sane.
  const total = Math.min(1.0, sum);
  return { base: BASE_RTP, contributions, total };
}

// ── Templates ───────────────────────────────────────────────────

export type TemplateId =
  | 'classic_lines'
  | 'megaways'
  | 'cluster'
  | 'free_spins'
  | 'hold_and_win';

export interface TemplateMeta {
  id: TemplateId;
  label: string;
  build: () => ComposeGraph;
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'classic_lines',
    label: 'Classic Lines',
    build: () => emptyGraph(),
  },
  {
    id: 'megaways',
    label: 'Megaways',
    build: () => {
      const g = emptyGraph();
      const a = addNode(g, 'cascade', 80, 80)!;
      const b = addNode(g, 'multiplier_ladder', 360, 80)!;
      addEdge(g, a.id, 'payout', b.id, 'trigger');
      return g;
    },
  },
  {
    id: 'cluster',
    label: 'Cluster',
    build: () => {
      const g = emptyGraph();
      const a = addNode(g, 'cluster', 80, 80)!;
      const b = addNode(g, 'cascade', 360, 80)!;
      addEdge(g, a.id, 'payout', b.id, 'trigger');
      return g;
    },
  },
  {
    id: 'free_spins',
    label: 'Free Spins',
    build: () => {
      const g = emptyGraph();
      const a = addNode(g, 'scatter_trigger', 60, 80)!;
      const b = addNode(g, 'free_spins', 320, 80)!;
      const c = addNode(g, 'variable_multiplier', 580, 80)!;
      addEdge(g, a.id, 'trigger', b.id, 'trigger');
      addEdge(g, b.id, 'payout', c.id, 'payout');
      return g;
    },
  },
  {
    id: 'hold_and_win',
    label: 'Hold & Win',
    build: () => {
      const g = emptyGraph();
      const a = addNode(g, 'mystery_trigger', 60, 80)!;
      const b = addNode(g, 'hold_and_win', 320, 80)!;
      const c = addNode(g, 'sticky_multiplier', 580, 80)!;
      addEdge(g, a.id, 'trigger', b.id, 'trigger');
      addEdge(g, b.id, 'payout', c.id, 'payout');
      return g;
    },
  },
];

export function loadTemplate(id: TemplateId): ComposeGraph {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return emptyGraph();
  return t.build();
}

// ── Save / restore round-trip ───────────────────────────────────

export interface ComposeSnapshot {
  schemaVersion: 1;
  graph: ComposeGraph;
}

export function snapshotGraph(g: ComposeGraph): ComposeSnapshot {
  return {
    schemaVersion: 1,
    graph: {
      nodes: g.nodes.map((n) => ({ ...n, params: { ...n.params } })),
      edges: g.edges.map((e) => ({ ...e })),
    },
  };
}

export function restoreGraph(s: ComposeSnapshot): ComposeGraph {
  if (!s || s.schemaVersion !== 1) return emptyGraph();
  return {
    nodes: s.graph.nodes.map((n) => ({ ...n, params: { ...n.params } })),
    edges: s.graph.edges.map((e) => ({ ...e })),
  };
}

// ── IR export hook ──────────────────────────────────────────────
// Lightweight translator — produces a flat feature-config blob the
// engine bridge can fold into IR.features. Each node becomes one
// feature entry keyed by its kind.
export interface FeatureConfigEntry {
  kind: string;
  params: Record<string, unknown>;
  inputs: string[];
}
export interface ComposeIRBlob {
  features: FeatureConfigEntry[];
  composedRtp: number;
}

export function exportToIRBlob(g: ComposeGraph): ComposeIRBlob {
  const rtp = computeComposedRTP(g);
  return {
    features: g.nodes.map((n) => {
      const entry = findPaletteEntry(n.kind);
      const inputs: string[] = [];
      if (entry) {
        for (const port of entry.inputs) {
          const e = g.edges.find((x) => x.toNode === n.id && x.toPort === port);
          if (e) inputs.push(e.fromNode);
        }
      }
      return {
        kind: n.kind,
        params: { ...n.params },
        inputs,
      };
    }),
    composedRtp: rtp.total,
  };
}

// ── Compose Bridge (public window API) ──────────────────────────

export interface ComposeBridge {
  palette: PaletteEntry[];
  templates: TemplateMeta[];
  getGraph(): ComposeGraph;
  setGraph(g: ComposeGraph): void;
  addNode(kind: string, x: number, y: number): ComposeNode | null;
  removeNodes(ids: string[]): void;
  addEdge(
    fromNode: string,
    fromPort: string,
    toNode: string,
    toPort: string
  ): ComposeEdge | null;
  validate(): ValidationResult;
  composedRTP(): ComposedRTP;
  loadTemplate(id: TemplateId): ComposeGraph;
  snapshot(): ComposeSnapshot;
  restore(s: ComposeSnapshot): void;
  exportIR(): ComposeIRBlob;
}

export function createComposeBridge(): ComposeBridge {
  let graph: ComposeGraph = emptyGraph();
  return {
    palette: FEATURE_PALETTE,
    templates: TEMPLATES,
    getGraph: () => graph,
    setGraph: (g) => {
      graph = g;
    },
    addNode: (kind, x, y) => addNode(graph, kind, x, y),
    removeNodes: (ids) => removeNodes(graph, ids),
    addEdge: (fn, fp, tn, tp) => addEdge(graph, fn, fp, tn, tp),
    validate: () => validateGraph(graph),
    composedRTP: () => computeComposedRTP(graph),
    loadTemplate: (id) => {
      graph = loadTemplate(id);
      return graph;
    },
    snapshot: () => snapshotGraph(graph),
    restore: (s) => {
      graph = restoreGraph(s);
    },
    exportIR: () => exportToIRBlob(graph),
  };
}
