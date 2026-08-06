function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  const raw = String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/**
 * Serializes an array of flat objects into a CSV document (RFC 4180-ish).
 * The first row is the header derived from the row keys in insertion order.
 */
export function toCsv(
  rows: Record<string, unknown>[],
  columns?: string[],
): string {
  if (!rows.length) return columns ? columns.join(',') + '\n' : '';
  const header = columns ?? Object.keys(rows[0]);
  const lines = [header.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(header.map((col) => escapeCell(row[col])).join(','));
  }
  return lines.join('\r\n');
}

export function csvBuffer(
  rows: Record<string, unknown>[],
  columns?: string[],
): Buffer {
  return Buffer.from('\uFEFF' + toCsv(rows, columns), 'utf8');
}
