/**
 * Faza 13.7 — Main converter entry point.
 *
 * Dispatches to the correct dialect normalizer then runs the generic
 * IR builder.
 */

import { normalizeMicrogaming, normalizeNetEnt, normalizePlaytech } from './dialects.js';
import { genericToIR } from './framework.js';
import type { ConversionResult, DialectId } from './types.js';

/**
 * Convert a raw proprietary game config to a USIF-compatible SlotGameIR.
 *
 * @param raw     The raw config object from the source system.
 * @param dialect One of 'microgaming' | 'playtech' | 'netent' | 'generic'.
 */
export function convertToUSIF(raw: Record<string, unknown>, dialect: DialectId): ConversionResult {
  switch (dialect) {
    case 'microgaming': {
      const generic = normalizeMicrogaming(raw);
      return genericToIR(generic, dialect);
    }
    case 'playtech': {
      const generic = normalizePlaytech(raw);
      return genericToIR(generic, dialect);
    }
    case 'netent': {
      const generic = normalizeNetEnt(raw);
      return genericToIR(generic, dialect);
    }
    default: {
      // Generic: pass raw through directly as GenericGameConfig
      return genericToIR(raw, dialect);
    }
  }
}
