// CORTI 200.8 — Cabinet profile registry.
//
// Loads 4 starter profiles (Bally Pro Series / IGT Crystal Curve /
// Konami Synkros / Aristocrat Helix) and exposes lookup helpers.

import BALLY from '../profiles/bally-pro-series.json';
import IGT from '../profiles/igt-crystal-curve.json';
import KONAMI from '../profiles/konami-synkros.json';
import ARISTOCRAT from '../profiles/aristocrat-helix.json';
import type { CabinetProfile } from './cabinet-driver.js';

export const PROFILES: Record<string, CabinetProfile> = {
  'bally-pro-series': BALLY as CabinetProfile,
  'igt-crystal-curve': IGT as CabinetProfile,
  'konami-synkros': KONAMI as CabinetProfile,
  'aristocrat-helix': ARISTOCRAT as CabinetProfile,
};

export function listProfiles(): CabinetProfile[] {
  return Object.values(PROFILES);
}

export function getProfile(id: string): CabinetProfile | null {
  return PROFILES[id] ?? null;
}
