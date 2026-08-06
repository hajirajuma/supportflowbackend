import { ExportTable } from './types';

/**
 * Dependency-free Excel (SpreadsheetML 2003, `.xls`) writer.
 *
 * Produces a single-sheet workbook as plain XML. Excel/WPS/LibreOffice open
 * this natively; it avoids a ZIP dependency (which `.xlsx` requires) while
 * still delivering a genuine Excel file with correct column widths and a
 * styled header row.
 */
export class ExcelExporter {
  static export(table: ExportTable): string {
    const headerRow = table.columns
      .map(
        (col) =>
          `<Cell ss:StyleID="Header"><Data ss:Type="String">${this.escape(
            col.label,
          )}</Data></Cell>`,
      )
      .join('');

    const bodyRows = table.rows
      .map((row) => {
        const cells = table.columns
          .map((col) => {
            const value = row[col.key];
            const { type, text } = this.cell(value);
            return `<Cell><Data ss:Type="${type}">${text}</Data></Cell>`;
          })
          .join('');
        return `<Row>${cells}</Row>`;
      })
      .join('');

    const widths = table.columns
      .map(
        (col, i) =>
          `<Column ss:Index="${i + 1}" ss:AutoFitWidth="1" ss:Width="${Math.max(
            col.label.length * 10,
            90,
          )}"/>`,
      )
      .join('');

    const generated = table.generatedAt ? `Generated ${table.generatedAt}` : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${this.escape(table.title)}</Title>
  <Author>SupportFlow</Author>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Vertical="Bottom" ss:Horizontal="Left"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#3B82F6" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="Title">
   <Alignment ss:Vertical="Bottom" ss:Horizontal="Left"/>
   <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${this.escape(table.title.slice(0, 31))}">
  <Table>
   ${widths}
   <Row><Cell ss:StyleID="Title"><Data ss:Type="String">${this.escape(
     table.title,
   )}</Data></Cell></Row>
   ${
     table.subtitle || generated
       ? `<Row><Cell><Data ss:Type="String">${this.escape(
           [table.subtitle, generated].filter(Boolean).join(' • '),
         )}</Data></Cell></Row>`
       : ''
   }
   <Row></Row>
   <Row>${headerRow}</Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;
  }

  private static cell(value: unknown): { type: string; text: string } {
    if (value === null || value === undefined) {
      return { type: 'String', text: '' };
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { type: 'Number', text: String(value) };
    }
    if (value instanceof Date) {
      return { type: 'DateTime', text: value.toISOString() };
    }
    if (typeof value === 'object') {
      return { type: 'String', text: this.escape(JSON.stringify(value)) };
    }
    return { type: 'String', text: this.escape(String(value)) };
  }

  private static escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
