/**
 * W211 Agent B — L&W Pilot Deck registry.
 *
 * Aggregates all 12 slide modules so tests + the HTML composer can
 * iterate over a single ordered array.
 */

import { slide as s1 } from './slide-1.js';
import { slide as s2 } from './slide-2.js';
import { slide as s3 } from './slide-3.js';
import { slide as s4 } from './slide-4.js';
import { slide as s5 } from './slide-5.js';
import { slide as s6 } from './slide-6.js';
import { slide as s7 } from './slide-7.js';
import { slide as s8 } from './slide-8.js';
import { slide as s9 } from './slide-9.js';
import { slide as s10 } from './slide-10.js';
import { slide as s11 } from './slide-11.js';
import { slide as s12 } from './slide-12.js';
import { renderLwSlide, type LwSlide } from './deck-types.js';

export const LW_SLIDES: readonly LwSlide[] = [
  s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12,
] as const;

/**
 * Compose the full deck HTML by concatenating each slide's rendered
 * markup. The composer keeps slides in stable order and asserts each
 * slide has a sequential index 1..12.
 */
export function renderLwDeck(slides: readonly LwSlide[] = LW_SLIDES): string {
  for (let i = 0; i < slides.length; i++) {
    if (slides[i].index !== i + 1) {
      throw new Error(
        `L&W deck slide index mismatch at position ${i}: expected ${i + 1}, got ${slides[i].index}`,
      );
    }
  }
  return slides.map(renderLwSlide).join('\n');
}

export { renderLwSlide };
export type { LwSlide };
