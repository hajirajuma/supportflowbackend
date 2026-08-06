import { ExportTable } from './types';

/** Dependency-free RFC-4180 CSV serialiser. */
export class CsvExporter {
  static export(table: ExportTable): string {
    const header = table.columns.map((col) => this.escape(col.label));
    const lines = [header.join(',')];

    for (const row of table.rows) {
      const values = table.columns.map((col) =>
        this.escape(this.stringify(row[col.key])),
      );
      lines.push(values.join(','));
    }

    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  private static stringify(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private static escape(value: string): string {
    const needsQuoting =
      value.includes(',') ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r');
    if (!needsQuoting) return value;
    return `"${value.replace(/"/g, '""')}"`;
  }
}
