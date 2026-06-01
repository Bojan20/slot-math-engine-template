// Math GDD Import Pipeline — drop a PDF / DOCX / XLSX / CSV / MD / JSON / TXT
// design document, parse it into a structured ExtractedGDD with per-field
// confidence scoring, then project that into a valid SlotGameIR.
//
// Confidence scale (0-100):
//   100  exact textual / structural match ("Target RTP: 96.50%")
//   80-99 structured match (XLSX cell with header "RTP")
//   60-79 heuristic match (prose "approximately 96.5%")
//   40-59 weak guess from a pattern
//   <40  could not extract, marked for review
//
// No engine math here — we only build a SlotGameIR and let the existing
// `parseGameIR` (Zod + cross-validate) do the heavy lifting.

import type { SlotGameIR, Symbol as IRSymbol, SymbolKind } from '@engine/ir/types.js';

// ───────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────

export type GDDFormat = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'md' | 'json' | 'txt';

export interface FieldExtraction<T> {
  value: T;
  confidence: number; // 0-100
  source?: string;    // page / cell / line where extracted
}

export interface PaytableRow {
  symbol: string;
  x3: number;
  x4: number;
  x5: number;
}

export interface ExtractedGDD {
  meta: {
    id: FieldExtraction<string>;
    name: FieldExtraction<string>;
    version: FieldExtraction<string>;
  };
  topology: {
    kind: FieldExtraction<'rectangular' | 'variable_rows' | 'cluster' | 'hexagonal'>;
    reels: FieldExtraction<number>;
    rows: FieldExtraction<number>;
  };
  symbolPool: {
    HP: FieldExtraction<number>;
    MP: FieldExtraction<number>;
    LP: FieldExtraction<number>;
    WILD: FieldExtraction<number>;
    SCATTER: FieldExtraction<number>;
    MULT: FieldExtraction<number>;
  };
  paytable: FieldExtraction<PaytableRow[]>;
  targetRTP: FieldExtraction<number>;
  maxWin: FieldExtraction<number>;
  features: FieldExtraction<string[]>;
  jurisdictions: FieldExtraction<string[]>;
  volatility: FieldExtraction<'LOW' | 'MID' | 'HIGH'>;
  overallConfidence: number; // weighted average
}

// ───────────────────────────────────────────────────────────────────────
// Format detection
// ───────────────────────────────────────────────────────────────────────

const EXT_MAP: Record<string, GDDFormat> = {
  pdf: 'pdf',
  docx: 'docx',
  doc: 'docx',
  xlsx: 'xlsx',
  xls: 'xlsx',
  csv: 'csv',
  md: 'md',
  markdown: 'md',
  json: 'json',
  txt: 'txt',
  text: 'txt',
};

const MIME_MAP: Array<{ test: RegExp; format: GDDFormat }> = [
  { test: /application\/pdf/, format: 'pdf' },
  { test: /application\/vnd\.openxmlformats-officedocument\.wordprocessingml/, format: 'docx' },
  { test: /application\/msword/, format: 'docx' },
  { test: /application\/vnd\.openxmlformats-officedocument\.spreadsheetml/, format: 'xlsx' },
  { test: /application\/vnd\.ms-excel/, format: 'xlsx' },
  { test: /text\/csv/, format: 'csv' },
  { test: /text\/markdown/, format: 'md' },
  { test: /application\/json/, format: 'json' },
  { test: /text\/plain/, format: 'txt' },
];

export async function detectFormat(file: File): Promise<GDDFormat> {
  // MIME first
  if (file.type) {
    for (const { test, format } of MIME_MAP) {
      if (test.test(file.type)) return format;
    }
  }
  // Extension fallback
  const name = (file.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot >= 0) {
    const ext = name.slice(dot + 1);
    if (EXT_MAP[ext]) return EXT_MAP[ext];
  }
  // Content sniff — read first 8 bytes
  try {
    const buf = await file.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(buf);
    // PDF: "%PDF"
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
    // ZIP container (DOCX / XLSX): "PK\x03\x04"
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      // Best-effort: prefer xlsx unless name hint suggests docx
      return /\.docx?$/i.test(name) ? 'docx' : 'xlsx';
    }
    // JSON: "{" or "["
    if (bytes[0] === 0x7b || bytes[0] === 0x5b) return 'json';
  } catch {
    // ignore
  }
  return 'txt';
}

// ───────────────────────────────────────────────────────────────────────
// Default / empty extraction
// ───────────────────────────────────────────────────────────────────────

function f<T>(value: T, confidence = 0, source?: string): FieldExtraction<T> {
  return source !== undefined ? { value, confidence, source } : { value, confidence };
}

function emptyExtraction(filename: string): ExtractedGDD {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'imported-game';
  return {
    meta: {
      id: f(base, 30, 'filename'),
      name: f(filename.replace(/\.[^.]+$/, '') || 'Imported Game', 30, 'filename'),
      version: f('0.1.0', 20),
    },
    topology: {
      kind: f<'rectangular' | 'variable_rows' | 'cluster' | 'hexagonal'>('rectangular', 20),
      reels: f(5, 20),
      rows: f(3, 20),
    },
    symbolPool: {
      HP: f(3, 20),
      MP: f(3, 20),
      LP: f(3, 20),
      WILD: f(1, 20),
      SCATTER: f(1, 20),
      MULT: f(0, 20),
    },
    paytable: f<PaytableRow[]>([], 0),
    targetRTP: f(0.955, 20),
    maxWin: f(5000, 20),
    features: f<string[]>([], 0),
    jurisdictions: f<string[]>([], 0),
    volatility: f<'LOW' | 'MID' | 'HIGH'>('MID', 20),
    overallConfidence: 0,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Heuristic helpers — tier / feature / jurisdiction recognisers
// ───────────────────────────────────────────────────────────────────────

function tierOf(label: string): 'HP' | 'MP' | 'LP' | 'WILD' | 'SCATTER' | 'MULT' | 'BONUS' | null {
  const l = label.trim().toLowerCase();
  if (!l) return null;
  if (/^(w|wild|substitute|wld)\d*$/.test(l) || l.includes('wild')) return 'WILD';
  if (/^(s|sc|sct|scatter|free.?spin)\d*$/.test(l) || l.includes('scatter')) return 'SCATTER';
  // PHASE 52 — bonus is its own tier (hold_and_win cross-validate needs it).
  if (/^(b|bn|bns|bonus|coin|cash|orb)\d*$/.test(l) || l.includes('bonus')) return 'BONUS';
  if (/(mult|multiplier|x\d+|×\d+)/.test(l)) return 'MULT';
  if (/^(hp\d*|h\d+|high\d*|premium\d*|prem\d*)$/.test(l)) return 'HP';
  if (/^(mp\d*|m\d+|mid\d*|medium\d*|med\d*)$/.test(l)) return 'MP';
  if (/^(lp\d*|l\d+|low\d*|9|10|j|q|k|a|jack|queen|king|ace|ten|nine)$/.test(l)) return 'LP';
  // Fallback: keyword scan
  if (l.includes('premium') || l.startsWith('h')) return 'HP';
  if (l.includes('mid')) return 'MP';
  return 'LP';
}

const FEATURE_PATTERNS: Array<{ re: RegExp; tag: string }> = [
  { re: /\b(free\s*spins?|fs\b|bonus\s*round)\b/i, tag: 'free_spins' },
  { re: /\b(hold\s*&?\s*win|h&w|coin\s*collect|cash\s*respin)\b/i, tag: 'hold_and_win' },
  { re: /\b(cascade|tumble|avalanche|cascading|tumbling)\b/i, tag: 'cascade' },
  { re: /\b(cluster\s*pay|cluster)\b/i, tag: 'cluster' },
  { re: /\b(megaways|variable\s*rows|ways\s*-?\s*per\s*-?\s*spin)\b/i, tag: 'megaways' },
  { re: /\b(multiplier|×\d+|x\d+\s*mult)\b/i, tag: 'multiplier' },
  { re: /\b(sticky\s*wilds?)\b/i, tag: 'sticky_wilds' },
  { re: /\b(expanding\s*wilds?)\b/i, tag: 'expanding_wilds' },
  { re: /\b(buy\s*feature|feature\s*buy|bonus\s*buy)\b/i, tag: 'buy_feature' },
  { re: /\b(wheel|wheel\s*of)\b/i, tag: 'wheel' },
  { re: /\b(pick\s*\&\s*click|pick\s*me|pick\s*pool)\b/i, tag: 'pick' },
  { re: /\b(gamble|red\s*\/\s*black|suit\s*pick)\b/i, tag: 'gamble' },
];

const JURISDICTION_CODES = ['UKGC', 'MGA', 'ADM', 'eCOGRA', 'DGOJ', 'SE', 'PA', 'NL', 'DE', 'CA-ON', 'AU', 'NZ', 'JP', 'KR', 'BR'];

function extractFeatures(text: string): { features: string[]; confidence: number } {
  const set = new Set<string>();
  for (const { re, tag } of FEATURE_PATTERNS) {
    if (re.test(text)) set.add(tag);
  }
  const features = Array.from(set);
  const confidence = features.length === 0 ? 30 : Math.min(95, 50 + features.length * 10);
  return { features, confidence };
}

function extractJurisdictions(text: string): { jurisdictions: string[]; confidence: number } {
  const found = new Set<string>();
  for (const code of JURISDICTION_CODES) {
    const re = new RegExp('\\b' + code.replace(/[-]/g, '[-\\s]?') + '\\b', 'i');
    if (re.test(text)) found.add(code);
  }
  const jurisdictions = Array.from(found);
  const confidence = jurisdictions.length === 0 ? 20 : Math.min(95, 55 + jurisdictions.length * 8);
  return { jurisdictions, confidence };
}

function extractVolatility(text: string): { value: 'LOW' | 'MID' | 'HIGH'; confidence: number } {
  // Explicit labels first
  const exp = text.match(/volatility\s*[:=]\s*(low|medium|mid|high|very\s*high)/i);
  if (exp) {
    const v = exp[1]!.toLowerCase();
    if (v.includes('high')) return { value: 'HIGH', confidence: 95 };
    if (v.includes('low')) return { value: 'LOW', confidence: 95 };
    return { value: 'MID', confidence: 95 };
  }
  if (/\bhigh\s*volatility\b/i.test(text)) return { value: 'HIGH', confidence: 80 };
  if (/\blow\s*volatility\b/i.test(text)) return { value: 'LOW', confidence: 80 };
  if (/\bmid\s*volatility\b/i.test(text) || /\bmedium\s*volatility\b/i.test(text)) return { value: 'MID', confidence: 80 };
  return { value: 'MID', confidence: 25 };
}

function extractRTP(text: string): { value: number; confidence: number; source?: string } | null {
  // Strip Markdown emphasis markers so "**Target RTP:**" matches.
  const stripped = text.replace(/[*_`]+/g, '');
  // Explicit "Target RTP: 96.5%" or "RTP = 0.965"
  const exp = stripped.match(/(?:target\s*)?rtp\s*[:=]\s*([0-9.]+)\s*(%?)/i);
  if (exp) {
    let v = parseFloat(exp[1]!);
    if (exp[2] === '%' || v > 1) v = v / 100;
    if (v > 0.5 && v < 1) return { value: v, confidence: 100, source: 'explicit' };
  }
  const approx = stripped.match(/(?:approximately|approx\.?|~)\s*([0-9.]+)\s*%/i);
  if (approx) {
    const v = parseFloat(approx[1]!) / 100;
    if (v > 0.5 && v < 1) return { value: v, confidence: 70, source: 'prose' };
  }
  return null;
}

function extractMaxWin(text: string): { value: number; confidence: number } | null {
  const exp = text.match(/max\s*win\s*[:=]?\s*([0-9,]+)\s*x?/i);
  if (exp) {
    const v = parseInt(exp[1]!.replace(/,/g, ''), 10);
    if (v > 0) return { value: v, confidence: 90 };
  }
  return null;
}

function extractTopology(text: string): { reels: number; rows: number; confidence: number } | null {
  const m = text.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (m) {
    const reels = parseInt(m[1]!, 10);
    const rows = parseInt(m[2]!, 10);
    if (reels >= 3 && reels <= 10 && rows >= 1 && rows <= 10) {
      return { reels, rows, confidence: 85 };
    }
  }
  return null;
}

function tallyPool(rows: PaytableRow[]): { HP: number; MP: number; LP: number; WILD: number; SCATTER: number; MULT: number; BONUS: number } {
  const tally = { HP: 0, MP: 0, LP: 0, WILD: 0, SCATTER: 0, MULT: 0, BONUS: 0 };
  for (const row of rows) {
    const t = tierOf(row.symbol);
    if (!t) continue;
    tally[t] += 1;
  }
  return tally;
}

// ───────────────────────────────────────────────────────────────────────
// Confidence aggregator
// ───────────────────────────────────────────────────────────────────────

function overall(gdd: ExtractedGDD): number {
  // Weight key fields more heavily.
  const items: Array<[number, number]> = [
    [gdd.meta.id.confidence, 1],
    [gdd.meta.name.confidence, 2],
    [gdd.topology.reels.confidence, 2],
    [gdd.topology.rows.confidence, 2],
    [gdd.targetRTP.confidence, 4],
    [gdd.maxWin.confidence, 2],
    [gdd.paytable.confidence, 4],
    [gdd.symbolPool.HP.confidence, 2],
    [gdd.symbolPool.LP.confidence, 2],
    [gdd.symbolPool.WILD.confidence, 1],
    [gdd.symbolPool.SCATTER.confidence, 1],
    [gdd.features.confidence, 1],
    [gdd.jurisdictions.confidence, 1],
    [gdd.volatility.confidence, 1],
  ];
  let num = 0;
  let den = 0;
  for (const [c, w] of items) {
    num += c * w;
    den += w;
  }
  return den > 0 ? Math.round(num / den) : 0;
}

// ───────────────────────────────────────────────────────────────────────
// Per-format parsers
// ───────────────────────────────────────────────────────────────────────

async function parseJSON(file: File): Promise<ExtractedGDD> {
  const text = await file.text();
  const out = emptyExtraction(file.name);
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return out;
  }
  if (!obj || typeof obj !== 'object') return out;
  const o = obj as Record<string, unknown>;

  // Direct IR shape?
  const meta = (o.meta as Record<string, unknown> | undefined) || undefined;
  if (meta) {
    if (typeof meta.id === 'string') out.meta.id = f(meta.id, 100, 'meta.id');
    if (typeof meta.name === 'string') out.meta.name = f(meta.name, 100, 'meta.name');
    if (typeof meta.version === 'string') out.meta.version = f(meta.version, 100, 'meta.version');
  } else {
    if (typeof o.id === 'string') out.meta.id = f(o.id, 95, 'root.id');
    if (typeof o.name === 'string') out.meta.name = f(o.name, 95, 'root.name');
    if (typeof o.version === 'string') out.meta.version = f(o.version, 95, 'root.version');
  }

  const topo = (o.topology as Record<string, unknown> | undefined) || undefined;
  if (topo) {
    if (typeof topo.reels === 'number') out.topology.reels = f(topo.reels, 100, 'topology.reels');
    if (typeof topo.rows === 'number') out.topology.rows = f(topo.rows, 100, 'topology.rows');
    if (typeof topo.kind === 'string') {
      const k = topo.kind;
      if (k === 'rectangular' || k === 'variable_rows' || k === 'cluster_grid' || k === 'hexagonal') {
        out.topology.kind = f(k === 'cluster_grid' ? 'cluster' : (k as 'rectangular' | 'variable_rows' | 'hexagonal'), 100, 'topology.kind');
      }
    }
  } else if (typeof o.reels === 'number' && typeof o.rows === 'number') {
    out.topology.reels = f(o.reels, 90, 'root.reels');
    out.topology.rows = f(o.rows, 90, 'root.rows');
  }

  // Paytable: either an array of rows or a Record<symbol, Record<count,pay>>.
  const ptRaw = o.paytable;
  if (Array.isArray(ptRaw)) {
    const rows: PaytableRow[] = [];
    for (const r of ptRaw) {
      if (r && typeof r === 'object') {
        const rec = r as Record<string, unknown>;
        const sym = typeof rec.symbol === 'string' ? rec.symbol : '';
        if (!sym) continue;
        rows.push({
          symbol: sym,
          x3: Number(rec.x3 ?? rec['3'] ?? 0),
          x4: Number(rec.x4 ?? rec['4'] ?? 0),
          x5: Number(rec.x5 ?? rec['5'] ?? 0),
        });
      }
    }
    if (rows.length) out.paytable = f(rows, 95, 'paytable[]');
  } else if (ptRaw && typeof ptRaw === 'object') {
    const rows: PaytableRow[] = [];
    for (const [sym, payRaw] of Object.entries(ptRaw as Record<string, unknown>)) {
      if (payRaw && typeof payRaw === 'object') {
        const pay = payRaw as Record<string, unknown>;
        rows.push({
          symbol: sym,
          x3: Number(pay['3'] ?? pay.x3 ?? 0),
          x4: Number(pay['4'] ?? pay.x4 ?? 0),
          x5: Number(pay['5'] ?? pay.x5 ?? 0),
        });
      }
    }
    if (rows.length) out.paytable = f(rows, 95, 'paytable{}');
  }

  // Symbols → tier counts
  const syms = o.symbols;
  if (Array.isArray(syms)) {
    const tally = { HP: 0, MP: 0, LP: 0, WILD: 0, SCATTER: 0, MULT: 0, BONUS: 0 };
    for (const s of syms) {
      if (!s || typeof s !== 'object') continue;
      const sr = s as Record<string, unknown>;
      const kind = typeof sr.kind === 'string' ? sr.kind : '';
      const id = typeof sr.id === 'string' ? sr.id : '';
      let t: keyof typeof tally | null = null;
      if (kind === 'wild') t = 'WILD';
      else if (kind === 'scatter') t = 'SCATTER';
      else if (kind === 'multiplier') t = 'MULT';
      else if (kind === 'bonus') t = 'BONUS';
      else if (kind === 'mp') t = 'MP';
      else if (kind === 'hp') t = id.toUpperCase().startsWith('MP') ? 'MP' : 'HP';
      else if (kind === 'lp') t = 'LP';
      else t = tierOf(id);
      if (t) tally[t] += 1;
    }
    out.symbolPool.HP = f(tally.HP, 95, 'symbols');
    out.symbolPool.MP = f(tally.MP, 95, 'symbols');
    out.symbolPool.LP = f(tally.LP, 95, 'symbols');
    out.symbolPool.WILD = f(tally.WILD, 95, 'symbols');
    out.symbolPool.SCATTER = f(tally.SCATTER, 95, 'symbols');
    out.symbolPool.MULT = f(tally.MULT, 95, 'symbols');
    // PHASE 52 — ensure BONUS symbols (declared in JSON.symbols[] but
    // typically absent from paytable) make it into the IR symbol pool so
    // hold_and_win cross-validate finds a bonus-kind symbol.
    if (tally.BONUS > 0) {
      const existing = new Set(out.paytable.value.map((r) => r.symbol.toUpperCase()));
      for (const s of syms) {
        if (!s || typeof s !== 'object') continue;
        const sr = s as Record<string, unknown>;
        const kind = typeof sr.kind === 'string' ? sr.kind : '';
        const id = typeof sr.id === 'string' ? sr.id : '';
        const isBonus = kind === 'bonus' || tierOf(id) === 'BONUS';
        if (isBonus && id && !existing.has(id.toUpperCase())) {
          out.paytable.value.push({ symbol: id, x3: 0, x4: 0, x5: 0 });
          existing.add(id.toUpperCase());
        }
      }
    }
  } else if (out.paytable.value.length) {
    const tally = tallyPool(out.paytable.value);
    out.symbolPool.HP = f(tally.HP, 80, 'paytable-derived');
    out.symbolPool.MP = f(tally.MP, 80, 'paytable-derived');
    out.symbolPool.LP = f(tally.LP, 80, 'paytable-derived');
    out.symbolPool.WILD = f(tally.WILD, 80, 'paytable-derived');
    out.symbolPool.SCATTER = f(tally.SCATTER, 80, 'paytable-derived');
    out.symbolPool.MULT = f(tally.MULT, 80, 'paytable-derived');
  }

  const limits = (o.limits as Record<string, unknown> | undefined) || undefined;
  if (limits) {
    if (typeof limits.target_rtp === 'number') {
      out.targetRTP = f(limits.target_rtp <= 1 ? limits.target_rtp : limits.target_rtp / 100, 100, 'limits.target_rtp');
    }
    if (typeof limits.max_win_x === 'number') out.maxWin = f(limits.max_win_x, 100, 'limits.max_win_x');
    if (typeof limits.target_volatility === 'string') {
      const v = limits.target_volatility.toLowerCase();
      out.volatility = f(
        v === 'high' || v === 'ultra' ? 'HIGH' : v === 'low' ? 'LOW' : 'MID',
        100,
        'limits.target_volatility'
      );
    }
  } else {
    if (typeof o.targetRTP === 'number') out.targetRTP = f(o.targetRTP <= 1 ? o.targetRTP : o.targetRTP / 100, 90);
    if (typeof o.maxWin === 'number') out.maxWin = f(o.maxWin, 90);
  }

  // Features
  const feats = o.features;
  if (Array.isArray(feats)) {
    const tags: string[] = [];
    for (const ff of feats) {
      if (typeof ff === 'string') tags.push(ff);
      else if (ff && typeof ff === 'object') {
        const k = (ff as Record<string, unknown>).kind;
        if (typeof k === 'string') tags.push(k);
      }
    }
    if (tags.length) out.features = f(tags, 95, 'features');
  } else {
    const fr = extractFeatures(text);
    if (fr.features.length) out.features = f(fr.features, fr.confidence, 'text-scan');
  }

  // Jurisdictions
  const compliance = (o.compliance as Record<string, unknown> | undefined) || undefined;
  if (compliance && Array.isArray(compliance.jurisdictions)) {
    out.jurisdictions = f(compliance.jurisdictions as string[], 100, 'compliance.jurisdictions');
  } else {
    const jr = extractJurisdictions(text);
    if (jr.jurisdictions.length) out.jurisdictions = f(jr.jurisdictions, jr.confidence);
  }

  out.overallConfidence = overall(out);
  return out;
}

async function parseTXT(file: File): Promise<ExtractedGDD> {
  const text = await file.text();
  const out = emptyExtraction(file.name);

  const rtp = extractRTP(text);
  if (rtp) out.targetRTP = f(rtp.value, rtp.confidence, rtp.source);

  const mw = extractMaxWin(text);
  if (mw) out.maxWin = f(mw.value, mw.confidence);

  const topo = extractTopology(text);
  if (topo) {
    out.topology.reels = f(topo.reels, topo.confidence, 'NxM');
    out.topology.rows = f(topo.rows, topo.confidence, 'NxM');
  }

  const fr = extractFeatures(text);
  if (fr.features.length) out.features = f(fr.features, fr.confidence, 'text-scan');

  const jr = extractJurisdictions(text);
  if (jr.jurisdictions.length) out.jurisdictions = f(jr.jurisdictions, jr.confidence);

  const v = extractVolatility(text);
  out.volatility = f(v.value, v.confidence);

  // Title heuristic: first non-empty line
  const firstLine = text.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0);
  if (firstLine && firstLine.length < 80) {
    out.meta.name = f(firstLine.replace(/^#+\s*/, ''), 70, 'first-line');
  }

  // Paytable heuristic — lines like "HP1  50  150  500"
  const rows: PaytableRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Za-z][\w-]*)\s*[|,\t ]+\s*([0-9.]+)\s*[|,\t ]+\s*([0-9.]+)\s*[|,\t ]+\s*([0-9.]+)\s*$/);
    if (m) {
      const sym = m[1]!;
      const x3 = parseFloat(m[2]!);
      const x4 = parseFloat(m[3]!);
      const x5 = parseFloat(m[4]!);
      if (Number.isFinite(x3) && Number.isFinite(x4) && Number.isFinite(x5)) {
        rows.push({ symbol: sym, x3, x4, x5 });
      }
    }
  }
  if (rows.length) {
    out.paytable = f(rows, 70, 'heuristic-rows');
    const tally = tallyPool(rows);
    out.symbolPool.HP = f(tally.HP, 65);
    out.symbolPool.MP = f(tally.MP, 65);
    out.symbolPool.LP = f(tally.LP, 65);
    out.symbolPool.WILD = f(tally.WILD, 65);
    out.symbolPool.SCATTER = f(tally.SCATTER, 65);
    out.symbolPool.MULT = f(tally.MULT, 65);
  }

  out.overallConfidence = overall(out);
  return out;
}

async function parseCSV(file: File): Promise<ExtractedGDD> {
  const text = await file.text();
  const out = emptyExtraction(file.name);

  // Lightweight CSV split — we tolerate commas, semicolons, and tabs.
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) {
    out.overallConfidence = overall(out);
    return out;
  }
  const sep = lines[0]!.includes('\t') ? '\t' : lines[0]!.includes(';') ? ';' : ',';
  const header = lines[0]!.split(sep).map((c) => c.trim().toLowerCase());
  const symCol = header.findIndex((h) => /^(symbol|sym|id|name)$/i.test(h));
  const x3Col = header.findIndex((h) => /^(x?3|three|3x|pay3)$/i.test(h));
  const x4Col = header.findIndex((h) => /^(x?4|four|4x|pay4)$/i.test(h));
  const x5Col = header.findIndex((h) => /^(x?5|five|5x|pay5)$/i.test(h));

  const rows: PaytableRow[] = [];
  if (symCol >= 0 && x3Col >= 0 && x4Col >= 0 && x5Col >= 0) {
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]!.split(sep).map((c) => c.trim());
      const sym = cols[symCol];
      if (!sym) continue;
      const x3 = parseFloat(cols[x3Col] || '0');
      const x4 = parseFloat(cols[x4Col] || '0');
      const x5 = parseFloat(cols[x5Col] || '0');
      if (Number.isFinite(x3) && Number.isFinite(x4) && Number.isFinite(x5)) {
        rows.push({ symbol: sym, x3, x4, x5 });
      }
    }
  } else {
    // Headerless 4-column form
    for (const line of lines) {
      const cols = line.split(sep).map((c) => c.trim());
      if (cols.length >= 4) {
        const x3 = parseFloat(cols[1]!);
        const x4 = parseFloat(cols[2]!);
        const x5 = parseFloat(cols[3]!);
        if (Number.isFinite(x3) && Number.isFinite(x4) && Number.isFinite(x5)) {
          rows.push({ symbol: cols[0]!, x3, x4, x5 });
        }
      }
    }
  }

  if (rows.length) {
    out.paytable = f(rows, 90, 'csv-rows');
    const tally = tallyPool(rows);
    out.symbolPool.HP = f(tally.HP, 85);
    out.symbolPool.MP = f(tally.MP, 85);
    out.symbolPool.LP = f(tally.LP, 85);
    out.symbolPool.WILD = f(tally.WILD, 85);
    out.symbolPool.SCATTER = f(tally.SCATTER, 85);
    out.symbolPool.MULT = f(tally.MULT, 85);
  }

  // Scan full text for RTP / topology / features
  const rtp = extractRTP(text);
  if (rtp) out.targetRTP = f(rtp.value, rtp.confidence, rtp.source);
  const topo = extractTopology(text);
  if (topo) {
    out.topology.reels = f(topo.reels, topo.confidence);
    out.topology.rows = f(topo.rows, topo.confidence);
  }
  const fr = extractFeatures(text);
  if (fr.features.length) out.features = f(fr.features, fr.confidence);
  const jr = extractJurisdictions(text);
  if (jr.jurisdictions.length) out.jurisdictions = f(jr.jurisdictions, jr.confidence);
  const v = extractVolatility(text);
  out.volatility = f(v.value, v.confidence);

  out.overallConfidence = overall(out);
  return out;
}

async function parseMD(file: File): Promise<ExtractedGDD> {
  const raw = await file.text();
  // Strip Markdown emphasis so downstream regex extractors see plain prose.
  const text = raw.replace(/\*\*/g, '').replace(/[_`]+/g, '');
  const out = emptyExtraction(file.name);

  // Title from first heading
  const heading = raw.match(/^#\s+(.+)$/m);
  if (heading) out.meta.name = f(heading[1]!.trim(), 85, 'h1');

  // Paytable from a markdown table: rows beginning with `|`
  const tableLines = text.split(/\r?\n/).filter((l) => l.trim().startsWith('|') && l.includes('|'));
  const rows: PaytableRow[] = [];
  if (tableLines.length >= 2) {
    // Skip header + separator
    for (const line of tableLines.slice(2)) {
      const cols = line.split('|').map((c) => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1 || c.length > 0);
      const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
      const arr = cells.length ? cells : cols;
      if (arr.length >= 4) {
        const sym = arr[0]!;
        const x3 = parseFloat(arr[1]!);
        const x4 = parseFloat(arr[2]!);
        const x5 = parseFloat(arr[3]!);
        if (sym && Number.isFinite(x3) && Number.isFinite(x4) && Number.isFinite(x5)) {
          rows.push({ symbol: sym, x3, x4, x5 });
        }
      }
    }
  }
  if (rows.length) {
    out.paytable = f(rows, 90, 'md-table');
    const tally = tallyPool(rows);
    out.symbolPool.HP = f(tally.HP, 85);
    out.symbolPool.MP = f(tally.MP, 85);
    out.symbolPool.LP = f(tally.LP, 85);
    out.symbolPool.WILD = f(tally.WILD, 85);
    out.symbolPool.SCATTER = f(tally.SCATTER, 85);
    out.symbolPool.MULT = f(tally.MULT, 85);
  }

  const rtp = extractRTP(text);
  if (rtp) out.targetRTP = f(rtp.value, rtp.confidence, rtp.source);
  const mw = extractMaxWin(text);
  if (mw) out.maxWin = f(mw.value, mw.confidence);
  const topo = extractTopology(text);
  if (topo) {
    out.topology.reels = f(topo.reels, topo.confidence);
    out.topology.rows = f(topo.rows, topo.confidence);
  }
  const fr = extractFeatures(text);
  if (fr.features.length) out.features = f(fr.features, fr.confidence);
  const jr = extractJurisdictions(text);
  if (jr.jurisdictions.length) out.jurisdictions = f(jr.jurisdictions, jr.confidence);
  const v = extractVolatility(text);
  out.volatility = f(v.value, v.confidence);

  out.overallConfidence = overall(out);
  return out;
}

async function parsePDF(file: File): Promise<ExtractedGDD> {
  // PDF parsing requires a browser-y environment (pdfjs uses Worker /
  // DOM). In Node tests we fall back to a TXT-style heuristic on the
  // raw bytes. We only import pdfjs-dist lazily so the test runner does
  // not crash trying to spin up its worker.
  if (typeof window === 'undefined') {
    return parseTXT(file);
  }
  try {
    // Dynamic import is typed as `any` deliberately — pdfjs ships its
    // own .d.ts but the worker / loader paths vary across builds and
    // bundle modes; the studio only needs `getDocument()` + `getTextContent()`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs: any = await import(/* @vite-ignore */ 'pdfjs-dist/build/pdf.mjs' as string);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workerUrl: any = await import(/* @vite-ignore */ 'pdfjs-dist/build/pdf.worker.mjs?url' as string);
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
    } catch {
      // workerless fallback — pdfjs will use its inline worker
    }
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push((content.items as Array<{ str: string }>).map((it) => it.str).join(' '));
    }
    const fullText = pages.join('\n');
    // Reuse TXT extractor logic by stuffing the text into a synthetic File-like.
    const synthetic = new File([fullText], file.name, { type: 'text/plain' });
    const out = await parseTXT(synthetic);
    out.meta.id = f((file.name || 'imported').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'), 80, 'filename');
    // Bump confidence: structured PDF text is more reliable than blind TXT.
    out.targetRTP.confidence = Math.min(100, out.targetRTP.confidence + 5);
    out.overallConfidence = overall(out);
    return out;
  } catch (err) {
    void err;
    return parseTXT(file);
  }
}

async function parseDOCX(file: File): Promise<ExtractedGDD> {
  if (typeof window === 'undefined') {
    return parseTXT(file);
  }
  try {
    const mammoth = await import('mammoth');
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    const synthetic = new File([result.value], file.name, { type: 'text/plain' });
    return parseTXT(synthetic);
  } catch (err) {
    void err;
    return parseTXT(file);
  }
}

async function parseXLSX(file: File): Promise<ExtractedGDD> {
  try {
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const out = emptyExtraction(file.name);

    let combinedText = '';
    const rows: PaytableRow[] = [];

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false }) as unknown[][];
      const isPaytable = /paytable|pay\s*table|symbols?/i.test(sheetName);
      // Find header row for paytables
      let headerRowIdx = -1;
      for (let r = 0; r < Math.min(5, aoa.length); r++) {
        const row = aoa[r] || [];
        const flat = row.map((c) => String(c ?? '').toLowerCase()).join('|');
        if (/symbol|sym|name/.test(flat) && /3/.test(flat) && /5/.test(flat)) {
          headerRowIdx = r;
          break;
        }
      }
      if (isPaytable || headerRowIdx >= 0) {
        const header = (aoa[headerRowIdx >= 0 ? headerRowIdx : 0] || []).map((c) => String(c ?? '').trim().toLowerCase());
        const symCol = header.findIndex((h) => /^(symbol|sym|id|name)$/.test(h));
        const x3Col = header.findIndex((h) => /3/.test(h));
        const x4Col = header.findIndex((h) => /4/.test(h));
        const x5Col = header.findIndex((h) => /5/.test(h));
        if (symCol >= 0 && x3Col >= 0 && x4Col >= 0 && x5Col >= 0) {
          for (let i = (headerRowIdx >= 0 ? headerRowIdx : 0) + 1; i < aoa.length; i++) {
            const row = aoa[i] || [];
            const sym = String(row[symCol] ?? '').trim();
            if (!sym) continue;
            const x3 = parseFloat(String(row[x3Col] ?? '0'));
            const x4 = parseFloat(String(row[x4Col] ?? '0'));
            const x5 = parseFloat(String(row[x5Col] ?? '0'));
            if (Number.isFinite(x3) && Number.isFinite(x4) && Number.isFinite(x5)) {
              rows.push({ symbol: sym, x3, x4, x5 });
            }
          }
        }
      }
      // Flatten sheet for text scans
      for (const row of aoa) {
        combinedText += (row || []).map((c) => String(c ?? '')).join(' ') + '\n';
      }
    }

    if (rows.length) {
      out.paytable = f(rows, 92, 'xlsx-paytable');
      const tally = tallyPool(rows);
      out.symbolPool.HP = f(tally.HP, 88);
      out.symbolPool.MP = f(tally.MP, 88);
      out.symbolPool.LP = f(tally.LP, 88);
      out.symbolPool.WILD = f(tally.WILD, 88);
      out.symbolPool.SCATTER = f(tally.SCATTER, 88);
      out.symbolPool.MULT = f(tally.MULT, 88);
    }

    const rtp = extractRTP(combinedText);
    if (rtp) out.targetRTP = f(rtp.value, rtp.confidence, rtp.source);
    const mw = extractMaxWin(combinedText);
    if (mw) out.maxWin = f(mw.value, mw.confidence);
    const topo = extractTopology(combinedText);
    if (topo) {
      out.topology.reels = f(topo.reels, topo.confidence);
      out.topology.rows = f(topo.rows, topo.confidence);
    }
    const fr = extractFeatures(combinedText);
    if (fr.features.length) out.features = f(fr.features, fr.confidence);
    const jr = extractJurisdictions(combinedText);
    if (jr.jurisdictions.length) out.jurisdictions = f(jr.jurisdictions, jr.confidence);
    const v = extractVolatility(combinedText);
    out.volatility = f(v.value, v.confidence);

    out.overallConfidence = overall(out);
    return out;
  } catch (err) {
    void err;
    return parseTXT(file);
  }
}

// ───────────────────────────────────────────────────────────────────────
// Public entry — parseGDD()
// ───────────────────────────────────────────────────────────────────────

export async function parseGDD(file: File): Promise<ExtractedGDD> {
  const fmt = await detectFormat(file);
  switch (fmt) {
    case 'json':
      return parseJSON(file);
    case 'csv':
      return parseCSV(file);
    case 'md':
      return parseMD(file);
    case 'pdf':
      return parsePDF(file);
    case 'docx':
      return parseDOCX(file);
    case 'xlsx':
      return parseXLSX(file);
    case 'txt':
    default:
      return parseTXT(file);
  }
}

// ───────────────────────────────────────────────────────────────────────
// gddToIR — build a SlotGameIR from an ExtractedGDD
// ───────────────────────────────────────────────────────────────────────

function tierToIRKind(tier: 'HP' | 'MP' | 'LP' | 'WILD' | 'SCATTER' | 'MULT' | 'BONUS'): SymbolKind {
  switch (tier) {
    case 'HP':
      return 'hp';
    case 'MP':
      return 'hp';
    case 'LP':
      return 'lp';
    case 'WILD':
      return 'wild';
    case 'SCATTER':
      return 'scatter';
    case 'MULT':
      return 'multiplier';
    case 'BONUS':
      return 'bonus';
  }
}

export function gddToIR(gdd: ExtractedGDD): SlotGameIR {
  const reels = gdd.topology.reels.value || 5;
  const rows = gdd.topology.rows.value || 3;
  const targetRtp = gdd.targetRTP.value > 0 && gdd.targetRTP.value < 1 ? gdd.targetRTP.value : 0.955;
  const maxWin = Math.max(gdd.maxWin.value || 5000, 1);

  // Decide which symbols to include — prefer paytable rows when present
  // (their ids are authentic to the GDD), fall back to tier counts.
  const symbols: IRSymbol[] = [];
  const paytable: Record<string, Record<string, number>> = {};
  const ptRows = gdd.paytable.value;

  if (ptRows.length > 0) {
    for (const row of ptRows) {
      const tier = tierOf(row.symbol) ?? 'LP';
      symbols.push({
        id: row.symbol,
        name: row.symbol,
        kind: tierToIRKind(tier),
        ...(tier === 'WILD' ? { substitutes: '*' as const } : {}),
        weight_hint: tier === 'HP' ? 3.5 : tier === 'MP' ? 5.2 : tier === 'LP' ? 8.0 : tier === 'WILD' ? 1.5 : tier === 'SCATTER' ? 1.5 : 1.0,
      });
      paytable[row.symbol] = { '3': row.x3, '4': row.x4, '5': row.x5 };
    }
  } else {
    const tiers = ['HP', 'MP', 'LP', 'WILD', 'SCATTER', 'MULT'] as const;
    for (const tier of tiers) {
      const count = gdd.symbolPool[tier].value;
      for (let i = 1; i <= count; i++) {
        const id = `${tier}${i}`;
        symbols.push({
          id,
          name: id,
          kind: tierToIRKind(tier),
          ...(tier === 'WILD' ? { substitutes: '*' as const } : {}),
          weight_hint: tier === 'HP' ? 3.5 : tier === 'MP' ? 5.2 : tier === 'LP' ? 8.0 : 1.5,
        });
        const x3 = tier === 'HP' ? 50 : tier === 'MP' ? 20 : tier === 'LP' ? 5 : tier === 'SCATTER' ? 5 : 0;
        const x4 = tier === 'HP' ? 150 : tier === 'MP' ? 60 : tier === 'LP' ? 20 : tier === 'SCATTER' ? 20 : 0;
        const x5 = tier === 'HP' ? 500 : tier === 'MP' ? 200 : tier === 'LP' ? 75 : tier === 'SCATTER' ? 100 : 0;
        paytable[id] = { '3': x3, '4': x4, '5': x5 };
      }
    }
  }

  // Ensure at least one HP/LP exists or the IR rejects an empty paytable.
  if (symbols.length === 0) {
    for (let i = 1; i <= 3; i++) {
      const id = `HP${i}`;
      symbols.push({ id, name: id, kind: 'hp', weight_hint: 3.5 });
      paytable[id] = { '3': 50, '4': 150, '5': 500 };
    }
    for (let i = 1; i <= 3; i++) {
      const id = `LP${i}`;
      symbols.push({ id, name: id, kind: 'lp', weight_hint: 8.0 });
      paytable[id] = { '3': 5, '4': 20, '5': 75 };
    }
  }

  // Reels: per-reel weight map. If a symbol has 0 weight_hint use 1.
  const weightMap: Record<string, number> = {};
  for (const s of symbols) weightMap[s.id] = Math.max(0.01, s.weight_hint ?? 1);
  const reelSet: SlotGameIR['reels'] = {
    mode: 'weighted',
    base: Array.from({ length: reels }, () => ({ ...weightMap })),
  };

  const hasScatter = symbols.some((s) => s.kind === 'scatter');
  const featureTags = gdd.features.value;
  const features: SlotGameIR['features'] = [];

  // PHASE 52 — Emit IR.features[] for IR-Feature-schema-compliant kinds.
  // Non-IR runner kinds (multiplier, cluster_pays, ways, sticky_wild,
  // expanding_wild, walking_wild, bonus_pick, wheel_bonus, mystery_symbol
  // (non-schema), …) get appended later as runner extras in app.js
  // buildPlayTemplateBlob — see `gddRunnerExtrasFromTags` below.
  if (hasScatter || featureTags.includes('free_spins')) {
    features.push({
      kind: 'free_spins',
      trigger: { by: 'scatter_count', min: 3, thresholds: { '3': 10, '4': 15, '5': 20 } },
    });
  }
  if (featureTags.includes('hold_and_win')) {
    features.push({
      kind: 'hold_and_win',
      trigger: { by: 'bonus_count', min: 6 },
      respins_initial: 3,
      respin_reset_on_new: true,
      cash_value_distribution: [
        { value: 1, weight: 8 },
        { value: 2, weight: 4 },
        { value: 5, weight: 2 },
        { value: 10, weight: 1 },
      ],
      jackpot_tiers: [
        { id: 'mini', multiplier: 20 },
        { id: 'major', multiplier: 200 },
      ],
    });
  }
  if (featureTags.includes('cascade')) {
    features.push({ kind: 'cascade', replacement: 'drop', max_chain: 8 });
  }
  if (featureTags.includes('buy_feature') || featureTags.includes('bonus_buy')) {
    features.push({
      kind: 'buy_feature',
      offers: [{ id: 'free_spins', cost_x: 80, guaranteed: 'free_spins_entry' }],
    });
  }
  if (featureTags.includes('pick')) {
    features.push({
      kind: 'pick',
      prize_pool: [
        { id: 'small', weight: 5, pay_multiplier: 5 },
        { id: 'mid', weight: 2, pay_multiplier: 25 },
        { id: 'big', weight: 1, pay_multiplier: 100 },
      ],
    });
  }
  if (featureTags.includes('wheel')) {
    features.push({
      kind: 'wheel',
      segments: [
        { id: 'a', weight: 4, pay_multiplier: 5 },
        { id: 'b', weight: 3, pay_multiplier: 10 },
        { id: 'c', weight: 2, pay_multiplier: 25 },
        { id: 'd', weight: 1, pay_multiplier: 100 },
      ],
    });
  }
  if (featureTags.includes('gamble')) {
    features.push({ kind: 'gamble', type: 'red_black', max_steps: 5, tie_resolution: 'push' });
  }
  if (featureTags.includes('ante_bet')) {
    features.push({ kind: 'ante_bet', extra_multiplier: 1.25, enabled_by_default: false });
  }

  const volTag: 'low' | 'medium' | 'high' = gdd.volatility.value === 'LOW' ? 'low' : gdd.volatility.value === 'HIGH' ? 'high' : 'medium';
  const jurisdictions = gdd.jurisdictions.value.length ? gdd.jurisdictions.value : ['EU-MT'];

  const id = (gdd.meta.id.value || gdd.meta.name.value || 'imported-game').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const name = gdd.meta.name.value || 'Imported Game';
  const version: `${number}.${number}.${number}` =
    /^\d+\.\d+\.\d+$/.test(gdd.meta.version.value) ? (gdd.meta.version.value as `${number}.${number}.${number}`) : '0.1.0';

  const ir: SlotGameIR = {
    schema_version: '1.0.0',
    meta: {
      id,
      name,
      version,
      theme_tags: ['imported', 'gdd'],
      created_at_utc: new Date().toISOString(),
    },
    topology: { kind: 'rectangular', reels, rows },
    symbols,
    reels: reelSet,
    evaluation: {
      kind: 'lines',
      paylines: [Array(reels).fill(1), Array(reels).fill(0), Array(reels).fill(2)],
      direction: 'ltr',
      min_match: 3,
      pay_left_to_right_only: true,
    },
    paytable,
    features,
    rng: { kind: 'pcg64', default_seed: 0xc0ffee },
    bet: {
      currency: 'EUR',
      base_bet: 1,
      denominations: [0.01, 0.1, 1, 5],
    },
    limits: {
      target_rtp: targetRtp,
      rtp_tolerance: 0.005,
      max_win_x: maxWin,
      win_cap_apply: 'per_spin',
      target_volatility: volTag,
      hit_freq_target: 0.25,
    },
    compliance: {
      jurisdictions,
      rtp_range_required: [0.85, 0.98],
      max_win_cap_required: 100000,
      near_miss_rule: 'must_be_random',
      ldw_disclosure: true,
      session_time_display: true,
    },
    rtp_allocation: {
      base_game: targetRtp * (hasScatter ? 0.7 : 1.0),
      free_spins: hasScatter ? targetRtp * 0.3 : 0,
      hold_and_win: 0,
      jackpot: 0,
      tolerance: 0.05,
    },
  };

  return ir;
}

// ───────────────────────────────────────────────────────────────────────
// PHASE 52 — Runner extras (non-IR-schema feature kinds)
// ───────────────────────────────────────────────────────────────────────
//
// Some industry-standard slot mechanics (multiplier, sticky/expanding/
// walking wilds, cluster_pays, ways, mystery_symbol render-style,
// bonus_pick, wheel_bonus) aren't part of the strict IR Zod schema yet,
// but the runner's component-builder registers modules for them. We emit
// them as a separate flat array attached to the IR at blob-build time
// via app.js (see buildPlayTemplateBlob) — they bypass parseGameIR.
//
// Each entry mirrors the IR.features[] shape (object with `kind`), so the
// runner's component-builder can mount them identically.

export interface RunnerExtraFeature {
  kind: string;
  [k: string]: unknown;
}

export function gddRunnerExtrasFromTags(featureTags: string[]): RunnerExtraFeature[] {
  const out: RunnerExtraFeature[] = [];
  if (featureTags.includes('multiplier')) {
    out.push({
      kind: 'multiplier',
      distribution: [
        { value: 2, weight: 5 },
        { value: 3, weight: 3 },
        { value: 5, weight: 2 },
        { value: 10, weight: 1 },
      ],
      trigger: { probability: 0.18 },
      scope: 'base_game_only',
    });
  }
  if (featureTags.includes('cluster')) {
    out.push({ kind: 'cluster_pays', min_cluster: 5 });
  }
  if (featureTags.includes('megaways')) {
    out.push({ kind: 'ways' });
  }
  if (featureTags.includes('sticky_wilds') || featureTags.includes('sticky_wild')) {
    out.push({ kind: 'sticky_wild', lockSpins: 2, scope: 'fs' });
  }
  if (featureTags.includes('expanding_wilds') || featureTags.includes('expanding_wild')) {
    out.push({ kind: 'expanding_wild' });
  }
  if (featureTags.includes('walking_wild')) {
    out.push({ kind: 'walking_wild', direction: 'left' });
  }
  if (featureTags.includes('mystery_symbol')) {
    out.push({ kind: 'mystery_symbol', revealMs: 700 });
  }
  if (featureTags.includes('bonus_pick') || featureTags.includes('pick')) {
    // Note: 'pick' is also emitted into IR.features[] as the canonical
    // schema-valid pick game — but the runner reads bonus_pick from
    // runnerExtras for the overlay UI. Both can coexist.
    out.push({ kind: 'bonus_pick', picksAllowed: 3 });
  }
  if (featureTags.includes('wheel')) {
    out.push({ kind: 'wheel_bonus' });
  }
  if (featureTags.includes('buy_feature') || featureTags.includes('bonus_buy')) {
    out.push({
      kind: 'buy_feature',
      features: [{ id: 'free_spins', label: 'FREE SPINS', multiplier: 80 }],
    });
  }
  if (featureTags.includes('power_meter') || featureTags.includes('charge_meter')) {
    out.push({ kind: 'power_meter' });
  }
  return out;
}

// Convenience: extract raw tags from an ExtractedGDD so app.js can derive
// runner extras alongside the IR.
export function gddTagsFrom(gdd: ExtractedGDD): string[] {
  return Array.from(gdd.features.value || []);
}
