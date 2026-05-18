/**
 * CORTI W205-PITCH — type definitions for the investor deck mini-app.
 */

export type SlideKind = 'cover' | 'hero' | 'content' | 'close';

export type SlideLayout =
  | 'title-subtitle'
  | 'bullets'
  | 'metric-grid'
  | 'callout'
  | 'chart'
  | 'cover'
  | 'two-column';

export interface DemoLink {
  /** Visible label on the pill button. */
  label: string;
  /** Where the live mini-app or doc lives (relative or absolute URL). */
  url: string;
}

export interface Slide {
  /** 1-indexed slide number. */
  index: number;
  /** Top-of-frame eyebrow tag (small caps). */
  section: string;
  /** Slide layout hint. */
  layout: SlideLayout;
  /** Optional cover/hero kind switch. */
  kind?: SlideKind;
  /** Primary slide title. */
  title: string;
  /** Optional subtitle / lede. */
  subtitle?: string;
  /** Body content blocks (plain prose strings). */
  body?: string[];
  /** Optional list of bullets. */
  bullets?: string[];
  /** Optional metric tiles. */
  metrics?: Array<{ label: string; value: string; sub?: string }>;
  /** Optional inline callout quote. */
  callout?: string;
  /** Optional inline SVG chart markup. */
  chart?: string;
  /** Optional caption rendered under a chart. */
  chartCaption?: string;
  /** Optional clickable demo links. */
  demoLinks?: DemoLink[];
  /** Speaker notes shown in presenter mode (and PDF appendix). */
  notes: string;
}

export interface DeckState {
  slides: Slide[];
  current: number;
  presenter: boolean;
  overview: boolean;
  autoplay: boolean;
  autoplayMs: number;
}

export type ToastKind = 'ok' | 'warn' | 'err';
