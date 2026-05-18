// W209 Agent B — Game template registry loader + filters.
//
// Templates are richer than listings — they pair a kernel (via P-IDs) +
// theme + paytable defaults + license model + preview SVG into one
// "buy + re-skin in 14 days" bundle.

export type TemplateLayout =
  | '5x3'
  | '5x4'
  | '6x3'
  | '6x4'
  | 'dual-grid'
  | 'megaways';

export type TemplateVolatility = 'low' | 'medium' | 'medium-high' | 'high';

export interface TemplateEntry {
  id: string;
  displayName: string;
  description: string;
  based_on_pids: string[];
  lw_gap_target: string;
  layout: TemplateLayout;
  rtp_target: number;
  volatility: TemplateVolatility;
  max_win_x: number;
  symbol_pack: string;
  audio_pack: string;
  price_usd: number;
  license_terms: string;
  preview_image: string;
  tags: string[];
  ready_to_ship_days: number;
}

export interface TemplatesFile {
  schema: string;
  generated: string;
  totalTemplates: number;
  currency: string;
  templates: TemplateEntry[];
}

export interface TemplateFilter {
  search?: string;
  lw_gap?: string;
  layout?: TemplateLayout;
  volatility?: TemplateVolatility;
  /** Inclusive [min, max] in USD. */
  priceRange?: [number, number];
  tag?: string;
}

export type TemplateSortKey = 'price-asc' | 'price-desc' | 'rtp' | 'name' | 'speed';

export async function loadTemplates(): Promise<TemplateEntry[]> {
  if (typeof fetch === 'undefined') return [];
  const res = await fetch('./data/templates.json');
  if (!res.ok) throw new Error(`failed to load templates: ${res.status}`);
  const data = (await res.json()) as TemplatesFile;
  return data.templates;
}

export function filterTemplates(items: TemplateEntry[], f: TemplateFilter): TemplateEntry[] {
  return items.filter((t) => {
    if (f.lw_gap && t.lw_gap_target !== f.lw_gap) return false;
    if (f.layout && t.layout !== f.layout) return false;
    if (f.volatility && t.volatility !== f.volatility) return false;
    if (f.priceRange) {
      const [lo, hi] = f.priceRange;
      if (t.price_usd < lo || t.price_usd > hi) return false;
    }
    if (f.tag && !t.tags.includes(f.tag)) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = `${t.displayName} ${t.description} ${t.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortTemplates(items: TemplateEntry[], key: TemplateSortKey): TemplateEntry[] {
  const copy = items.slice();
  switch (key) {
    case 'price-asc':
      copy.sort((a, b) => a.price_usd - b.price_usd);
      break;
    case 'price-desc':
      copy.sort((a, b) => b.price_usd - a.price_usd);
      break;
    case 'rtp':
      copy.sort((a, b) => b.rtp_target - a.rtp_target);
      break;
    case 'name':
      copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
      break;
    case 'speed':
      copy.sort((a, b) => a.ready_to_ship_days - b.ready_to_ship_days);
      break;
  }
  return copy;
}

/** Aggregate stats helper for the dashboard ribbon. */
export interface TemplateStats {
  totalTemplates: number;
  averagePriceUsd: number;
  averageRtpPct: number;
  uniqueLwGaps: number;
  fastestReadyDays: number;
}

export function templateStats(items: TemplateEntry[]): TemplateStats {
  if (items.length === 0) {
    return {
      totalTemplates: 0,
      averagePriceUsd: 0,
      averageRtpPct: 0,
      uniqueLwGaps: 0,
      fastestReadyDays: 0,
    };
  }
  const totalPrice = items.reduce((a, b) => a + b.price_usd, 0);
  const totalRtp = items.reduce((a, b) => a + b.rtp_target, 0);
  const gaps = new Set(items.map((i) => i.lw_gap_target));
  const fastest = items.reduce((a, b) => Math.min(a, b.ready_to_ship_days), items[0].ready_to_ship_days);
  return {
    totalTemplates: items.length,
    averagePriceUsd: Math.round(totalPrice / items.length),
    averageRtpPct: Math.round((totalRtp / items.length) * 10) / 10,
    uniqueLwGaps: gaps.size,
    fastestReadyDays: fastest,
  };
}

/** Reverse lookup — find template by id, throws when unknown. */
export function getTemplateById(items: TemplateEntry[], id: string): TemplateEntry {
  const t = items.find((x) => x.id === id);
  if (!t) throw new Error(`unknown template: ${id}`);
  return t;
}
