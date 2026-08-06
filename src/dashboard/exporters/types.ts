/** Shape consumed by every export engine (CSV / Excel / PDF). */
export interface ExportColumn {
  key: string;
  label: string;
}

export type ExportRow = Record<string, unknown>;

export interface ExportTable {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  generatedAt?: string;
}
