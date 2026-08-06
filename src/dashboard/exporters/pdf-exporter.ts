import { ExportTable } from './types';

/**
 * Dependency-free PDF writer (PDF 1.4, base-14 Helvetica fonts).
 *
 * Produces a multi-page text report with a title, subtitle, styled header row
 * and pagination. Byte offsets for the cross-reference table are computed at
 * build time, so the output is fully valid and opens in any PDF viewer.
 */
export class PdfExporter {
  private static readonly PAGE_WIDTH = 612;
  private static readonly PAGE_HEIGHT = 792;
  private static readonly MARGIN = 40;
  private static readonly LINE_HEIGHT = 14;
  private static readonly BOTTOM_LIMIT = 50;

  static export(table: ExportTable): Buffer {
    const pages = this.layout(table);

    const objects: string[] = [];
    const pageIds: number[] = [];

    // 1: Catalog, 2: Pages, 3: Helvetica, 4: Helvetica-Bold
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

    for (let i = 0; i < pages.length; i++) {
      const pageId = 5 + i * 2;
      const contentId = 6 + i * 2;
      pageIds.push(pageId);
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.PAGE_WIDTH} ${this.PAGE_HEIGHT}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
      objects.push(
        `<< /Length ${this.byteLength(pages[i])} >>\nstream\n${pages[i]}endstream`,
      );
    }

    objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    return this.assemble(objects);
  }

  /** Splits the table into per-page content stream strings. */
  private static layout(table: ExportTable): string[] {
    const pages: string[] = [];
    let lines: string[] = [];
    let y = this.PAGE_HEIGHT - 22;

    const title = table.title || 'Report';
    const subtitle = [
      table.subtitle,
      table.generatedAt ? `Generated ${table.generatedAt}` : '',
    ]
      .filter(Boolean)
      .join(' • ');

    // Title
    lines.push(this.textOp(this.F2, 16, title, y, '0 0 0 rg'));
    y -= 18;
    if (subtitle) {
      lines.push(this.textOp(this.F1, 9, subtitle, y, '0.45 0.45 0.45 rg'));
      y -= 16;
    }
    y -= 6;

    // Column headers
    lines.push(
      this.textOp(this.F2, 9, this.headerLine(table), y, '0.23 0.51 0.96 rg'),
    );
    y -= this.LINE_HEIGHT + 2;

    // Data rows
    for (const row of table.rows) {
      if (y < this.BOTTOM_LIMIT) {
        pages.push(this.render(lines));
        lines = [];
        y = this.PAGE_HEIGHT - this.MARGIN;
      }
      lines.push(
        this.textOp(this.F1, 9, this.rowLine(table, row), y, '0 0 0 rg'),
      );
      y -= this.LINE_HEIGHT;
    }

    pages.push(this.render(lines));
    return pages;
  }

  private static render(lines: string[]): string {
    return lines.join('\n') + '\n';
  }

  private static textOp(
    font: 'F1' | 'F2',
    size: number,
    text: string,
    y: number,
    fill: string,
  ): string {
    return `BT ${fill} /${font} ${size} Tf ${this.MARGIN} ${Math.round(y * 100) / 100} Td (${this.escape(
      text,
    )}) Tj ET`;
  }

  private static headerLine(table: ExportTable): string {
    return table.columns.map((col) => col.label).join('   ');
  }

  private static rowLine(
    table: ExportTable,
    row: Record<string, unknown>,
  ): string {
    return table.columns
      .map((col) => this.truncate(this.stringify(row[col.key]), 95))
      .join('   ');
  }

  private static stringify(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private static truncate(value: string, max: number): string {
    if (value.length <= max) return value;
    return value.slice(0, max - 3) + '...';
  }

  private static escape(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  /** Byte length of a JS string (UTF-8 aware). */
  private static byteLength(value: string): number {
    return Buffer.byteLength(value, 'utf8');
  }

  /** Assembles objects + xref table with correct byte offsets. */
  private static assemble(objects: string[]): Buffer {
    const chunks: Buffer[] = [];
    const offsets: number[] = [];

    chunks.push(Buffer.from('%PDF-1.4\n'));

    for (let i = 0; i < objects.length; i++) {
      const objNum = i + 1;
      const header = `${objNum} 0 obj\n`;
      const body = `${objects[i]}\nendobj\n`;
      offsets[i] = this.totalLength(chunks);
      chunks.push(Buffer.from(header + body, 'utf8'));
    }

    const xrefStart = this.totalLength(chunks);

    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    chunks.push(Buffer.from(xref + trailer, 'utf8'));

    return Buffer.concat(chunks);
  }

  private static totalLength(chunks: Buffer[]): number {
    return chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  private static readonly F1 = 'F1';
  private static readonly F2 = 'F2';
}
