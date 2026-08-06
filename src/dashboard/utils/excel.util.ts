function escapeXml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return escapeXml(value.toISOString());
  if (typeof value === 'number') return String(value);
  return escapeXml(value);
}

/**
 * Generates an Excel 2003 SpreadsheetML workbook. The `.xls` output opens
 * natively in Microsoft Excel, LibreOffice and Google Sheets without requiring
 * any third-party binary library.
 */
export function toExcelSpreadsheet(
  sheetName: string,
  rows: Record<string, unknown>[],
  columns?: string[],
): string {
  const header = columns ?? (rows.length ? Object.keys(rows[0]) : []);
  const body = rows
    .map(
      (row) =>
        '        <Row>' +
        header
          .map((col) => `<Cell><Data>${cellValue(row[col])}</Data></Cell>`)
          .join('') +
        '</Row>',
    )
    .join('\n');

  const headerRow =
    '        <Row>' +
    header
      .map((col) => `<Cell><Data>${escapeXml(col)}</Data></Cell>`)
      .join('') +
    '</Row>';

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n' +
    '  <Worksheet ss:Name="' +
    escapeXml(sheetName.slice(0, 31)) +
    '">\n' +
    '    <Table>\n' +
    headerRow +
    '\n' +
    body +
    '\n    </Table>\n' +
    '  </Worksheet>\n' +
    '</Workbook>\n'
  );
}

export function excelBuffer(
  sheetName: string,
  rows: Record<string, unknown>[],
  columns?: string[],
): Buffer {
  return Buffer.from(toExcelSpreadsheet(sheetName, rows, columns), 'utf8');
}
