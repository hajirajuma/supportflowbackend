// Minimal, dependency-free PDF writer for report exports.
// Produces a valid PDF 1.4 document (single-column text with automatic page
// breaks and a title header) using the standard Helvetica fonts.

const PAGE_WIDTH = 612; // US Letter (points)
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Standard 14 font AFM widths for Helvetica (per 1000-unit em). Missing codes
// fall back to the average width of 500.
const HELVETICA_WIDTHS: Record<string, number> = {
  '32': 278,
  '33': 278,
  '34': 355,
  '35': 556,
  '36': 556,
  '37': 889,
  '38': 667,
  '39': 191,
  '40': 333,
  '41': 333,
  '42': 389,
  '43': 584,
  '44': 278,
  '45': 333,
  '46': 278,
  '47': 278,
  '48': 556,
  '49': 556,
  '50': 556,
  '51': 556,
  '52': 556,
  '53': 556,
  '54': 556,
  '55': 556,
  '56': 556,
  '57': 556,
  '58': 278,
  '59': 278,
  '60': 584,
  '61': 584,
  '62': 584,
  '63': 556,
  '64': 1015,
  '65': 667,
  '66': 667,
  '67': 722,
  '68': 722,
  '69': 667,
  '70': 611,
  '71': 778,
  '72': 722,
  '73': 278,
  '74': 500,
  '75': 667,
  '76': 556,
  '77': 833,
  '78': 722,
  '79': 778,
  '80': 667,
  '81': 778,
  '82': 722,
  '83': 667,
  '84': 611,
  '85': 722,
  '86': 667,
  '87': 944,
  '88': 667,
  '89': 667,
  '90': 611,
  '91': 278,
  '92': 278,
  '93': 278,
  '94': 469,
  '95': 556,
  '96': 333,
  '97': 556,
  '98': 556,
  '99': 500,
  '100': 556,
  '101': 556,
  '102': 278,
  '103': 556,
  '104': 556,
  '105': 222,
  '106': 222,
  '107': 500,
  '108': 222,
  '109': 833,
  '110': 556,
  '111': 556,
  '112': 556,
  '113': 556,
  '114': 333,
  '115': 500,
  '116': 278,
  '117': 556,
  '118': 500,
  '119': 722,
  '120': 500,
  '121': 500,
  '122': 500,
  '123': 334,
  '124': 260,
  '125': 334,
  '126': 584,
};

const HELVETICA_BOLD_WIDTHS: Record<string, number> = {
  '32': 278,
  '33': 333,
  '34': 474,
  '35': 556,
  '36': 556,
  '37': 889,
  '38': 722,
  '39': 238,
  '40': 333,
  '41': 333,
  '42': 389,
  '43': 584,
  '44': 278,
  '45': 333,
  '46': 278,
  '47': 278,
  '48': 556,
  '49': 556,
  '50': 556,
  '51': 556,
  '52': 556,
  '53': 556,
  '54': 556,
  '55': 556,
  '56': 556,
  '57': 556,
  '58': 333,
  '59': 333,
  '60': 584,
  '61': 584,
  '62': 584,
  '63': 611,
  '64': 975,
  '65': 722,
  '66': 722,
  '67': 722,
  '68': 722,
  '69': 667,
  '70': 611,
  '71': 778,
  '72': 722,
  '73': 278,
  '74': 556,
  '75': 722,
  '76': 611,
  '77': 833,
  '78': 722,
  '79': 778,
  '80': 667,
  '81': 778,
  '82': 722,
  '83': 667,
  '84': 611,
  '85': 722,
  '86': 667,
  '87': 944,
  '88': 667,
  '89': 667,
  '90': 611,
  '91': 333,
  '92': 278,
  '93': 333,
  '94': 584,
  '95': 556,
  '96': 333,
  '97': 556,
  '98': 611,
  '99': 556,
  '100': 611,
  '101': 556,
  '102': 333,
  '103': 611,
  '104': 611,
  '105': 278,
  '106': 278,
  '107': 556,
  '108': 278,
  '109': 889,
  '110': 611,
  '111': 611,
  '112': 611,
  '113': 611,
  '114': 389,
  '115': 556,
  '116': 333,
  '117': 611,
  '118': 556,
  '119': 778,
  '120': 556,
  '121': 556,
  '122': 500,
  '123': 389,
  '124': 280,
  '125': 389,
  '126': 584,
};

function charWidth(ch: string, bold: boolean): number {
  const widths = bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  const code = ch.charCodeAt(0);
  return widths[String(code)] ?? 500;
}

function textWidth(text: string, size: number, bold: boolean): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, bold);
  return (w / 1000) * size;
}

function wrap(text: string, size: number, bold: boolean): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [' '];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, bold) <= CONTENT_WIDTH || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function toLatin1(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    out += code <= 0xff ? ch : '?';
  }
  return out;
}

export interface PdfSection {
  title: string;
  lines: string[];
}

export interface PdfDocumentOptions {
  title: string;
  subtitle?: string;
  sections?: PdfSection[];
  generatedAt?: Date;
}

export function toPdf(options: PdfDocumentOptions): Buffer {
  const parts: Buffer[] = [];
  const objectOffsets: Record<number, number> = {};

  const append = (buf: Buffer) => {
    parts.push(buf);
    return parts.reduce((sum, b) => sum + b.length, 0);
  };

  const text = (s: string) => Buffer.from(s, 'latin1');

  // ---- Object model (1=Catalog, 2=Pages, 3=Helvetica, 4=Helvetica-Bold) ----
  const objects: Record<number, string> = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [] /Count 0 >>',
    3: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    4: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  };

  // ---- Build page content streams ----
  const pages: string[] = [];

  let stream = '';
  let y = PAGE_HEIGHT - 70;

  const flushPage = () => {
    stream += 'ET\n';
    pages.push(stream);
    stream = 'BT\n';
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) flushPage();
  };

  const emitLine = (font: string, size: number, line: string) => {
    ensureSpace(size + 4);
    stream += `/${font} ${size} Tf\n${MARGIN} ${y} Td\n(${escapePdfText(toLatin1(line))}) Tj\n`;
    y -= size + 4;
  };

  const headerText =
    options.title +
    (options.subtitle ? `\n${options.subtitle}` : '') +
    `\nGenerated ${options.generatedAt?.toISOString() ?? new Date().toISOString()}\n`;

  stream = 'BT\n';
  for (const line of wrap(headerText, 9, false)) {
    ensureSpace(13);
    stream += `/F1 9 Tf\n${MARGIN} ${y} Td\n(${escapePdfText(toLatin1(line))}) Tj\n`;
    y -= 13;
  }
  y -= 6;

  for (const section of options.sections ?? []) {
    y -= 8;
    for (const line of wrap(section.title, 12, true)) {
      emitLine('F2', 12, line);
    }
    y -= 2;
    for (const line of section.lines) {
      for (const wrapped of wrap(line, 9, false)) {
        emitLine('F1', 9, wrapped);
      }
    }
    y -= 4;
  }
  flushPage();

  // Pages tree
  const kidRefs = pages.map((_, idx) => `${5 + idx * 2} 0 R`);
  objects[2] = `<< /Type /Pages /Kids [${kidRefs.join(' ')}] /Count ${pages.length} >>`;

  // Page + content objects
  let nextId = 5;
  pages.forEach((contentStream, _idx) => {
    const pageId = nextId;
    const contentId = nextId + 1;
    nextId += 2;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = contentStream;
  });

  // ---- Serialize ----
  append(text('%PDF-1.4\n'));
  append(text('%\u00e2\u00e3\u00cf\u00d3\n'));

  const keys = Object.keys(objects)
    .map(Number)
    .sort((a, b) => a - b);

  for (const key of keys) {
    objectOffsets[key] = append(text(`${key} 0 obj\n`));
    append(text(objects[key] + '\n'));
    append(text('endobj\n'));
  }

  const xrefStart = append(Buffer.alloc(0));
  append(text(`xref\n0 ${keys.length + 1}\n`));
  append(text('0000000000 65535 f \n'));
  for (const key of keys) {
    append(text(`${String(objectOffsets[key]).padStart(10, '0')} 00000 n \n`));
  }
  append(
    text(
      `trailer\n<< /Size ${keys.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
    ),
  );

  return Buffer.concat(parts);
}

export function pdfBuffer(options: PdfDocumentOptions): Buffer {
  return toPdf(options);
}
