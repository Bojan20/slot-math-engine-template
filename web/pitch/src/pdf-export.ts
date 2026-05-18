/**
 * CORTI W205-PITCH — PDF export.
 *
 * Renders each slide as one A4-landscape PDF page using pdf-lib. The slide
 * layout is hand-drawn (we don't snapshot the DOM) so the PDF is crisp,
 * embeddable into investor data rooms, and reproducible from the
 * authoritative `SLIDES` array.
 *
 * Returns a `Uint8Array` so the same code path works both in the browser
 * (download via Blob) and in Node (write to disk for the CLI export).
 */

import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import type { Slide } from './types.js';

const SLATE = rgb(0x0b / 255, 0x12 / 255, 0x20 / 255);
const SLATE_2 = rgb(0x11 / 255, 0x19 / 255, 0x2a / 255);
const SLATE_LINE = rgb(0x1f / 255, 0x2a / 255, 0x40 / 255);
const GOLD = rgb(0xd4 / 255, 0xa7 / 255, 0x44 / 255);
const WARM = rgb(0xf4 / 255, 0xec / 255, 0xdc / 255);
const WARM_DIM = rgb(0x8d / 255, 0x86 / 255, 0x75 / 255);

// A4 landscape — pdf-lib PageSizes.A4 is portrait; we swap.
const PAGE_W = PageSizes.A4[1]; // ~841.89
const PAGE_H = PageSizes.A4[0]; // ~595.28
const MARGIN_X = 56;
const MARGIN_Y = 56;

interface DrawCursor {
  x: number;
  y: number;
}

/**
 * The Standard 14 PDF fonts (Helvetica, Times) use WinAnsi encoding, which
 * doesn't cover Latin Extended-A characters like ć / š / đ / ž. The deck
 * source intentionally uses Unicode glyphs (e.g. "Bojan Petković") so they
 * render correctly in the browser. For the PDF we transliterate to the
 * closest ASCII glyph so pdf-lib doesn't reject the page.
 *
 * Keeping the table small and explicit avoids pulling in a full diacritics
 * package while covering the ex-Yu Latin set used in author bylines.
 */
const ASCII_FOLD: Record<string, string> = {
  Č: 'C', č: 'c', Ć: 'C', ć: 'c', Š: 'S', š: 's', Ž: 'Z', ž: 'z',
  Đ: 'Dj', đ: 'dj', Á: 'A', á: 'a', É: 'E', é: 'e', Í: 'I', í: 'i',
  Ó: 'O', ó: 'o', Ú: 'U', ú: 'u', Ñ: 'N', ñ: 'n', Ü: 'U', ü: 'u',
  Ö: 'O', ö: 'o', Ä: 'A', ä: 'a', ß: 'ss',
  ' ': ' ', '‘': "'", '’': "'", '“': '"', '”': '"',
  '–': '-', '—': '--', '…': '...', '·': '·',
};

function foldAscii(s: string): string {
  let out = '';
  for (const ch of s) {
    if (ch.charCodeAt(0) < 0x80) {
      out += ch;
    } else if (ASCII_FOLD[ch]) {
      out += ASCII_FOLD[ch];
    } else {
      // Strip anything else WinAnsi cannot encode rather than throwing.
      const code = ch.charCodeAt(0);
      out += code < 0x100 ? ch : '?';
    }
  }
  return out;
}

function wrapText(text: string, maxWidth: number, font: import('pdf-lib').PDFFont, size: number): string[] {
  const safe = foldAscii(text);
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur.length === 0 ? w : `${cur} ${w}`;
    const width = font.widthOfTextAtSize(test, size);
    if (width > maxWidth && cur.length > 0) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

function drawPage(
  page: import('pdf-lib').PDFPage,
  slide: Slide,
  ui: import('pdf-lib').PDFFont,
  uiBold: import('pdf-lib').PDFFont,
  serif: import('pdf-lib').PDFFont,
  serifBold: import('pdf-lib').PDFFont,
  totalSlides: number,
): void {
  // Background panel
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: SLATE });
  page.drawRectangle({
    x: MARGIN_X - 12,
    y: MARGIN_Y - 12,
    width: PAGE_W - 2 * (MARGIN_X - 12),
    height: PAGE_H - 2 * (MARGIN_Y - 12),
    color: SLATE_2,
    borderColor: SLATE_LINE,
    borderWidth: 0.75,
  });

  // Gold accent rule
  page.drawRectangle({ x: MARGIN_X, y: PAGE_H - MARGIN_Y - 4, width: 32, height: 2, color: GOLD });

  const cursor: DrawCursor = { x: MARGIN_X, y: PAGE_H - MARGIN_Y - 24 };

  // Eyebrow
  const eyebrow = foldAscii(`${slide.section.toUpperCase()}  ·  ${String(slide.index).padStart(2, '0')} OF ${String(totalSlides).padStart(2, '0')}`);
  page.drawText(eyebrow, { x: cursor.x, y: cursor.y, size: 9, font: uiBold, color: GOLD });
  cursor.y -= 26;

  // Title (serif)
  const titleSize = slide.kind === 'cover' || slide.kind === 'close' ? 30 : 22;
  const titleLines = wrapText(slide.title, PAGE_W - 2 * MARGIN_X, serifBold, titleSize);
  for (const line of titleLines) {
    page.drawText(line, { x: cursor.x, y: cursor.y, size: titleSize, font: serifBold, color: WARM });
    cursor.y -= titleSize + 4;
  }
  cursor.y -= 4;

  // Subtitle (italic serif via plain serif)
  if (slide.subtitle) {
    const subLines = wrapText(slide.subtitle, PAGE_W - 2 * MARGIN_X - 60, serif, 12);
    for (const line of subLines) {
      page.drawText(line, { x: cursor.x, y: cursor.y, size: 12, font: serif, color: WARM_DIM });
      cursor.y -= 16;
    }
    cursor.y -= 6;
  }

  // Body paragraphs
  if (slide.body) {
    for (const para of slide.body) {
      const lines = wrapText(para, PAGE_W - 2 * MARGIN_X, ui, 10.5);
      for (const line of lines) {
        page.drawText(line, { x: cursor.x, y: cursor.y, size: 10.5, font: ui, color: WARM });
        cursor.y -= 14;
      }
      cursor.y -= 4;
    }
  }

  // Callout
  if (slide.callout) {
    const x = cursor.x;
    const w = PAGE_W - 2 * MARGIN_X;
    const calloutLines = wrapText(slide.callout, w - 24, serif, 11);
    const blockH = calloutLines.length * 15 + 16;
    page.drawRectangle({ x, y: cursor.y - blockH + 12, width: w, height: blockH, color: rgb(0.83, 0.65, 0.27), opacity: 0.10 });
    page.drawRectangle({ x, y: cursor.y - blockH + 12, width: 2, height: blockH, color: GOLD });
    let cy = cursor.y - 4;
    for (const line of calloutLines) {
      page.drawText(line, { x: x + 12, y: cy, size: 11, font: serif, color: WARM });
      cy -= 15;
    }
    cursor.y -= blockH + 8;
  }

  // Metrics row(s)
  if (slide.metrics && slide.metrics.length > 0) {
    const tiles = slide.metrics;
    const cols = tiles.length >= 4 ? 4 : tiles.length === 3 ? 3 : 2;
    const totalW = PAGE_W - 2 * MARGIN_X;
    const gap = 10;
    const tileW = (totalW - (cols - 1) * gap) / cols;
    const tileH = 60;
    let row = 0;
    let col = 0;
    let startY = cursor.y - 4;
    for (const m of tiles) {
      const tx = MARGIN_X + col * (tileW + gap);
      const ty = startY - row * (tileH + gap) - tileH;
      page.drawRectangle({ x: tx, y: ty, width: tileW, height: tileH, color: SLATE, borderColor: SLATE_LINE, borderWidth: 0.5 });
      page.drawText(foldAscii(m.label.toUpperCase()), { x: tx + 10, y: ty + tileH - 14, size: 7.5, font: uiBold, color: WARM_DIM });
      page.drawText(foldAscii(m.value), { x: tx + 10, y: ty + tileH - 36, size: 16, font: serifBold, color: GOLD });
      if (m.sub) {
        const sub = foldAscii(m.sub.length > 56 ? `${m.sub.slice(0, 53)}...` : m.sub);
        page.drawText(sub, { x: tx + 10, y: ty + 10, size: 8, font: ui, color: WARM_DIM });
      }
      col += 1;
      if (col >= cols) { col = 0; row += 1; }
    }
    const rows = Math.ceil(tiles.length / cols);
    cursor.y -= rows * (tileH + gap) + 8;
  }

  // Bullets
  if (slide.bullets && slide.bullets.length > 0) {
    for (const b of slide.bullets) {
      const wrap = wrapText(b, PAGE_W - 2 * MARGIN_X - 16, ui, 10);
      // Bullet marker
      page.drawCircle({ x: cursor.x + 3, y: cursor.y + 3, size: 2.4, color: GOLD });
      let first = true;
      for (const line of wrap) {
        page.drawText(line, { x: cursor.x + 12, y: cursor.y, size: 10, font: ui, color: WARM });
        cursor.y -= 13;
        first = false;
      }
      cursor.y -= 2;
      if (cursor.y < MARGIN_Y + 60) break;
    }
  }

  // Chart caption placeholder — SVGs are not embedded in PDF (would require
  // SVG-to-PDF rasterisation). Instead, we mark the chart slot and reference
  // the live deck for the interactive chart.
  if (slide.chart) {
    const w = PAGE_W - 2 * MARGIN_X;
    const h = 90;
    page.drawRectangle({ x: cursor.x, y: cursor.y - h, width: w, height: h, color: SLATE, borderColor: GOLD, borderWidth: 0.5 });
    page.drawText(foldAscii('LIVE CHART AVAILABLE IN INTERACTIVE DECK'), {
      x: cursor.x + 14,
      y: cursor.y - h / 2 - 2,
      size: 9,
      font: uiBold,
      color: GOLD,
    });
    if (slide.chartCaption) {
      page.drawText(foldAscii(slide.chartCaption), {
        x: cursor.x + 14,
        y: cursor.y - h + 12,
        size: 8,
        font: ui,
        color: WARM_DIM,
      });
    }
    cursor.y -= h + 6;
  }

  // Demo links
  if (slide.demoLinks && slide.demoLinks.length > 0) {
    let lx = cursor.x;
    for (const l of slide.demoLinks) {
      const label = foldAscii(`Demo · ${l.label}`);
      const w = ui.widthOfTextAtSize(label, 8.5) + 14;
      page.drawRectangle({ x: lx, y: cursor.y - 12, width: w, height: 16, color: SLATE_2, borderColor: GOLD, borderWidth: 0.5 });
      page.drawText(label, { x: lx + 7, y: cursor.y - 8, size: 8.5, font: uiBold, color: GOLD });
      lx += w + 8;
    }
    cursor.y -= 22;
  }

  // Footer
  page.drawLine({
    start: { x: MARGIN_X, y: MARGIN_Y - 4 },
    end:   { x: PAGE_W - MARGIN_X, y: MARGIN_Y - 4 },
    thickness: 0.5,
    color: SLATE_LINE,
  });
  page.drawText(foldAscii('Slot Math Engine · Confidential 2026'), {
    x: MARGIN_X,
    y: MARGIN_Y - 22,
    size: 8,
    font: ui,
    color: WARM_DIM,
  });
  const pageNumber = `${String(slide.index).padStart(2, '0')} / ${String(totalSlides).padStart(2, '0')}`;
  const pageW = ui.widthOfTextAtSize(pageNumber, 8);
  page.drawText(pageNumber, {
    x: PAGE_W - MARGIN_X - pageW,
    y: MARGIN_Y - 22,
    size: 8,
    font: ui,
    color: WARM_DIM,
  });
}

export interface ExportOptions {
  /** Optional override to include speaker notes as appendix pages. */
  includeNotes?: boolean;
}

export async function exportDeck(slides: Slide[], opts: ExportOptions = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Slot Math Engine - Investor Deck 2026');
  pdf.setAuthor('Bojan Petkovic');
  pdf.setSubject('L&W acquisition target / Series A pitch');
  pdf.setProducer('slot-math-engine-template - CORTI W205-PITCH');
  pdf.setCreator('slot-math-engine-template - CORTI W205-PITCH');

  const ui = await pdf.embedFont(StandardFonts.Helvetica);
  const uiBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  for (const slide of slides) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    drawPage(page, slide, ui, uiBold, serif, serifBold, slides.length);
  }

  if (opts.includeNotes) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: SLATE });
    page.drawText(foldAscii('SPEAKER NOTES'), { x: MARGIN_X, y: PAGE_H - MARGIN_Y, size: 9, font: uiBold, color: GOLD });
    let y = PAGE_H - MARGIN_Y - 24;
    for (const slide of slides) {
      const head = foldAscii(`${String(slide.index).padStart(2, '0')} — ${slide.title}`);
      page.drawText(head, { x: MARGIN_X, y, size: 9, font: uiBold, color: WARM });
      y -= 12;
      const lines = wrapText(slide.notes, PAGE_W - 2 * MARGIN_X, ui, 8);
      for (const line of lines) {
        page.drawText(line, { x: MARGIN_X, y, size: 8, font: ui, color: WARM_DIM });
        y -= 10;
        if (y < MARGIN_Y + 12) break;
      }
      y -= 6;
      if (y < MARGIN_Y + 12) break;
    }
  }

  return pdf.save();
}

/**
 * Browser helper — triggers a download of the rendered PDF.
 */
export function downloadDeck(bytes: Uint8Array, filename = 'SlotMathEngine-InvestorDeck-2026.pdf'): void {
  if (typeof document === 'undefined') return;
  // Use ArrayBuffer copy so Blob constructor accepts the typed array cleanly.
  const buf = bytes.slice().buffer;
  const blob = new Blob([buf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}
