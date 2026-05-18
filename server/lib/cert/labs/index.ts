/**
 * CORTI W210 Faza 600.0 — Lab adapter registry.
 *
 * Single import point for the 4 lab adapters + their common types.
 */

export * from './types.js';
export { gliAdapter, GliAdapter, GLI_REQUIRED_DOCS, GLI_JURISDICTIONS } from './gli.js';
export { bmmAdapter, BmmAdapter, BMM_REQUIRED_DOCS, BMM_JURISDICTIONS } from './bmm.js';
export { ecograAdapter, EcograAdapter, ECOGRA_REQUIRED_DOCS, ECOGRA_JURISDICTIONS } from './ecogra.js';
export { nmiAdapter, NmiAdapter, NMI_REQUIRED_DOCS, NMI_JURISDICTIONS } from './nmi.js';

import { gliAdapter } from './gli.js';
import { bmmAdapter } from './bmm.js';
import { ecograAdapter } from './ecogra.js';
import { nmiAdapter } from './nmi.js';
import type { LabAdapter, LabName } from './types.js';

export const ALL_LAB_ADAPTERS: readonly LabAdapter[] = [
  gliAdapter,
  bmmAdapter,
  ecograAdapter,
  nmiAdapter,
];

export function getLabAdapter(name: LabName): LabAdapter {
  const found = ALL_LAB_ADAPTERS.find((a) => a.labName === name);
  if (!found) throw new Error(`unknown_lab_adapter:${name}`);
  return found;
}
