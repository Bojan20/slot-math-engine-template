// IR loader — typed view over ce-copy-test.<swid>.ir.json. Matches the Rust
// `ir.rs` structure 1:1 so both engines can be fed the same JSON file
// (the Excel parser owns the contract).

import { readFileSync } from "node:fs";

export interface Meta {
  name: string;
  based_on: string;
  swid: string;
  reels: number;
  rows: number;
  lines: number;
  left_to_right_only: boolean;
  hold: number;
  hit_frequency_all_line: number;
  win_frequency_all_line: number;
  rtp_breakdown: {
    base_game: number;
    cash_eruption_from_base: number;
    free_spins: number;
    cash_eruption_from_fs: number;
    total: number;
  };
  rtp_total: number;
  bet_multipliers: number[];
  total_bets: number[];
  max_liabilities: number[];
}

export interface PaytableEntry {
  marker: string;
  combo: string[];
  pays: number;
  pph: number | null;
  rtp_pct: number | null;
}

export interface ReelStop {
  symbol: string;
  weight: number;
}

export interface ReelSet {
  set: number;
  reels: ReelStop[][];
}

export interface ReelSetWeight {
  set: number;
  weight: number;
}

export interface ReelSetWeights {
  weights: ReelSetWeight[];
  total: number;
  initial_set?: number | null;
  initial_set_rtp?: number | null;
}

export interface FireballValue {
  coin_value: number;
  low: number | null;
  med: number | null;
  high: number | null;
}

export interface PotEntry {
  value: number;
  low: number | null;
  med: number | null;
  high: number | null;
}

export interface CashEruptionPage {
  bet_multiplier: number;
  fireballs_set_weights: {
    low: number | null;
    med: number | null;
    high: number | null;
    total: number | null;
  };
  small_fireball_values: FireballValue[];
  big_fireball_values: FireballValue[];
  mini_minor_major: {
    small?: Record<string, PotEntry>;
    big?: Record<string, PotEntry>;
  };
  // Map "6" → { "3": { "0": w, "1": w, …, "total": T }, "2": …, "1": … }
  respin_tables: Record<string, Record<string, Record<string, number>>>;
  ce_from_base_rtp: number | null;
  ce_from_fs_rtp: number | null;
  grand_prob_base: number | null;
  grand_prob_fs: number | null;
  top_award: number | null;
}

export interface Payline {
  line: number;
  rows: (number | null)[];
}

export interface Ir {
  meta: Meta;
  symbol_counts_per_reel: Record<string, number[]>;
  paytable: PaytableEntry[];
  bg_reel_set_weights: ReelSetWeights;
  bg_reel_sets: ReelSet[];
  fg_reel_set_weights: ReelSetWeights;
  fg_reel_sets: ReelSet[];
  fs_paytable: PaytableEntry[];
  bonus_summary: {
    avg_free_spins: number | null;
    single_spin_payback_pct: number | null;
    total_payback_pct: number | null;
  };
  cash_eruption_feature_pages: CashEruptionPage[];
  paylines: Payline[];
}

export function loadIr(path: string): Ir {
  return JSON.parse(readFileSync(path, "utf8")) as Ir;
}

export function ceaPageForBetMultiplier(
  ir: Ir,
  bm: number,
): CashEruptionPage | undefined {
  return ir.cash_eruption_feature_pages.find((p) => p.bet_multiplier === bm);
}
