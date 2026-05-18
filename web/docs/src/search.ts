/**
 * CORTI W207-DOCS - In-memory search index.
 *
 * Tiny pre-built index (no Lunr.js dep). On boot we load every markdown
 * page, strip code fences, then split into chunks per heading. The query
 * matches a case-insensitive substring of the chunk title or first 240
 * chars of body. Returns ranked results by `score = title-hits*5 + body-hits`.
 */

export interface SearchEntry {
  slug: string;
  page: string;
  section: string;
  body: string;
}

export interface SearchHit extends SearchEntry {
  score: number;
}

export function buildIndex(rawPages: Array<{ slug: string; title: string; raw: string }>): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const { slug, title, raw } of rawPages) {
    // strip fenced code blocks
    const stripped = raw.replace(/```[\s\S]*?```/g, ' ');
    const lines = stripped.split('\n');
    let currentSection = title;
    let buf: string[] = [];
    const flush = () => {
      const body = buf.join(' ').replace(/\s+/g, ' ').trim();
      if (body.length > 0) out.push({ slug, page: title, section: currentSection, body });
      buf = [];
    };
    for (const line of lines) {
      const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (h) {
        flush();
        currentSection = h[2];
        continue;
      }
      buf.push(line);
    }
    flush();
  }
  return out;
}

export function search(index: SearchEntry[], query: string, limit = 20): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  for (const entry of index) {
    const title = entry.section.toLowerCase();
    const body = entry.body.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const titleHits = title.split(t).length - 1;
      const bodyHits = body.split(t).length - 1;
      score += titleHits * 5 + bodyHits;
    }
    if (score > 0) hits.push({ ...entry, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

export function snippet(entry: SearchEntry, maxLen = 140): string {
  const body = entry.body;
  if (body.length <= maxLen) return body;
  return body.slice(0, maxLen).trimEnd() + '...';
}
