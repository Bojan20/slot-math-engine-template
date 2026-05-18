/**
 * CORTI W207-DOCS - Sidebar / TOC definition.
 *
 * Single source of truth for the doc-site navigation. Each section has a
 * title + array of links. Each link has a slug (= URL fragment + content
 * filename without .md) and a label. The router converts #/<slug> into
 * a fetch of /content/<slug>.md.
 */

export interface SidebarLink {
  slug: string;
  label: string;
}

export interface SidebarSection {
  title: string;
  links: SidebarLink[];
}

export const SIDEBAR: SidebarSection[] = [
  {
    title: 'Getting Started',
    links: [
      { slug: '01-overview', label: 'Overview' },
      { slug: '02-quickstart', label: 'Quickstart' },
    ],
  },
  {
    title: 'Studio Guide',
    links: [
      { slug: '03-studio-workflow', label: 'Designer / Math / Producer' },
    ],
  },
  {
    title: 'API Reference',
    links: [
      { slug: '05-rest-api', label: 'REST API' },
      { slug: '06-gaas-websocket', label: 'GaaS WebSocket' },
      { slug: '07-sdk-typescript', label: 'TypeScript SDK' },
      { slug: 'generated/api-routes', label: 'Auto-generated routes' },
      { slug: 'generated/sdk-reference', label: 'Auto-generated SDK ref' },
    ],
  },
  {
    title: 'IR Schema',
    links: [
      { slug: '04-ir-schema', label: 'IR Document Spec' },
    ],
  },
  {
    title: 'Integration Guide',
    links: [
      { slug: '08-cert-pipeline', label: 'Cert Pipeline' },
      { slug: '09-deployment', label: 'Deployment' },
      { slug: '10-cabinet-integration', label: 'Cabinet Integration' },
      { slug: '11-jurisdictions', label: 'Jurisdictions' },
    ],
  },
  {
    title: 'FAQ + Troubleshooting',
    links: [
      { slug: '12-faq', label: 'FAQ' },
      { slug: '13-glossary', label: 'Glossary' },
    ],
  },
];

/** Flat list of every link in sidebar order. */
export function flattenSidebar(sidebar: SidebarSection[] = SIDEBAR): SidebarLink[] {
  const out: SidebarLink[] = [];
  for (const s of sidebar) for (const l of s.links) out.push(l);
  return out;
}

/** Default slug to navigate to when no fragment is present. */
export const DEFAULT_SLUG = '01-overview';

/** Render the sidebar HTML as a string. */
export function renderSidebar(activeSlug: string, sidebar: SidebarSection[] = SIDEBAR): string {
  const parts: string[] = [];
  for (const section of sidebar) {
    parts.push(`<div class="sidebar-section">`);
    parts.push(`<div class="sidebar-section-title">${escapeHtml(section.title)}</div>`);
    for (const link of section.links) {
      const cls = link.slug === activeSlug ? 'sidebar-link active' : 'sidebar-link';
      parts.push(
        `<a class="${cls}" href="#/${link.slug}" data-slug="${escapeHtml(link.slug)}">${escapeHtml(link.label)}</a>`
      );
    }
    parts.push(`</div>`);
  }
  return parts.join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
