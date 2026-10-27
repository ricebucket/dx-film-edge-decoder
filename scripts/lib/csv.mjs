// Minimal RFC 4180 CSV reader/writer (quoted fields, "" escapes, any delimiter).

export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // byte-order mark
  for (; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parse CSV text with a header row into objects keyed by column name. */
export function readCsvObjects(text, delimiter = ',') {
  const [header, ...rows] = parseCsv(text, delimiter);
  return rows.map((r, n) => {
    if (r.length !== header.length) {
      throw new Error(`CSV row ${n + 2} has ${r.length} fields, expected ${header.length}`);
    }
    return Object.fromEntries(header.map((h, i) => [h, r[i]]));
  });
}

export function formatCsv(rows, delimiter = ',') {
  const needsQuotes = new RegExp(`["\\r\\n${delimiter}]`);
  return rows
    .map((r) => r.map((v) => (needsQuotes.test(v) ? `"${v.replaceAll('"', '""')}"` : v)).join(delimiter))
    .join('\n') + '\n';
}
