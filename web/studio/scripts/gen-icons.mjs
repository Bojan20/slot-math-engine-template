// Generate PWA icons (any + maskable) from a single canvas paint.
// Uses @napi-rs/canvas (already pulled in by pdfjs-dist). Run once,
// committed PNGs live under web/studio/public/icons/.
//
//   node scripts/gen-icons.mjs
//
// Brand: rounded-rect mark, cyan→deep-cyan gradient, monogram "S".
// Maskable variant inflates the safe area to 80% per Android spec.

import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/icons');
mkdirSync(OUT, { recursive: true });

const CYAN = '#22D3EE';
const CYAN_DEEP = '#0E7490';
const BG = '#0A0D11';

function drawIcon(size, { maskable = false } = {}) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');

  // Background — full bleed for maskable (Android may crop edges).
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size, size);

  // Safe inset: 10% for "any", 18% for "maskable" (per W3C maskable spec).
  const inset = Math.round(size * (maskable ? 0.18 : 0.08));
  const inner = size - inset * 2;
  const r = Math.round(inner * 0.18);

  // Cyan gradient rounded rect.
  const grad = ctx.createLinearGradient(inset, inset, inset + inner, inset + inner);
  grad.addColorStop(0, CYAN);
  grad.addColorStop(1, CYAN_DEEP);
  ctx.fillStyle = grad;
  roundRect(ctx, inset, inset, inner, inner, r);
  ctx.fill();

  // Monogram "S" — heavy weight, centered.
  ctx.fillStyle = BG;
  const fontPx = Math.round(inner * 0.62);
  ctx.font = `700 ${fontPx}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', size / 2, size / 2 + Math.round(inner * 0.04));

  return c.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-256.png', size: 256, maskable: false },
  { name: 'icon-384.png', size: 384, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
];

for (const t of targets) {
  const buf = drawIcon(t.size, { maskable: t.maskable });
  writeFileSync(resolve(OUT, t.name), buf);
  console.log(`✓ ${t.name} (${buf.length} bytes)`);
}
