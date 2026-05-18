// Studio-local types — kept intentionally small so the UI state stays
// decoupled from the engine IR (which we BUILD from this state in engine.ts).
// The UI tracks "user intent" (tier counts, names, weights), the engine
// consumes a full SlotGameIR derived from it.

export type Tier = 'HP' | 'MP' | 'LP' | 'WILD' | 'SCATTER' | 'MULT';

export interface StudioSymbol {
  tier: Tier;
  id: string; // stable: e.g. "HP1", "WILD1"
  name: string;
  icon: string;
  weight: number;
  pay: { x3: number; x4: number; x5: number };
}

export interface TierCounts {
  HP: number;
  MP: number;
  LP: number;
  WILD: number;
  SCATTER: number;
  MULT: number;
}

export interface StudioVariant {
  id: string;
  name: string;
  tierCounts: TierCounts;
  symbols: StudioSymbol[];
  reels: string[][]; // [reel][row] of symbol id
  rtp: number;
  rtpTarget: number;
  hit: number;
  sigma: number;
  maxWin: number;
  vola: 'LOW' | 'MID' | 'HIGH';
  activePreset: 'compact' | 'standard' | 'rich' | 'custom';
  activity: Array<{ at: number; msg: string }>;
  lastSavedAt: number;
}

export interface StudioWorkspace {
  id: string;
  name: string;
  theme: string;
  layout: string;
  irName: string;
  activeVariantId: string;
  variantOrder: string[];
  variants: Record<string, StudioVariant>;
}

export interface StudioPersistedState {
  workspaces: Record<string, StudioWorkspace>;
  wsOrder: string[];
  activeWorkspaceId: string;
  lastSavedAt: number;
  schemaVersion: 1;
}
