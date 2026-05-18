// Minimal CSV emitter for regulator audit exports. We avoid pulling in
// the root project's fast-csv dependency to keep these mini-apps zero-dep
// at runtime. Spec: RFC 4180-lite (quote fields containing comma, quote,
// or newline; double inner quotes).

export function toCsv<T>(rows: T[], columns: (keyof T)[]): string {
  const header = columns.map((c) => csvField(String(c))).join(',');
  const body = rows
    .map((r) => columns.map((c) => csvField(formatCell((r as Record<string, unknown>)[c as string]))).join(','))
    .join('\n');
  return rows.length === 0 ? header : `${header}\n${body}`;
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (Array.isArray(v)) return v.join('|');
  return String(v);
}

function csvField(raw: string): string {
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}
