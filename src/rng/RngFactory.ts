/**
 * RNG Factory — Faza 7
 *
 * Creates an RngBackend instance by kind and seed.
 */

import { RngBackend, RngKind } from './RngBackend.js';
import { Mulberry32 } from './backends/Mulberry32.js';
import { PCG64 } from './backends/PCG64.js';
import { Xoshiro256SS } from './backends/Xoshiro256SS.js';
import { Philox4x32 } from './backends/Philox4x32.js';

export function createRng(kind: RngKind, seed: number): RngBackend {
  switch (kind) {
    case 'mulberry32':
      return new Mulberry32(seed);
    case 'pcg64':
      return new PCG64(seed);
    case 'xoshiro256ss':
      return new Xoshiro256SS(seed);
    case 'philox4x32':
      return new Philox4x32(seed);
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unknown RNG kind: ${exhaustive}`);
    }
  }
}
