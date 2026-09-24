export type CsvRecord = { line: number; values: Record<string, string> };

export function parseCsv(text: string): { headers: string[]; records: CsvRecord[] } {
  if (text.length > 200_000) throw new Error("CSV input must be smaller than 200 KB");
  const source = text.replace(/^\uFEFF/, "");
  const rows: { line: number; cells: string[] }[] = [];
  let row: string[] = [], cell = "", quoted = false, line = 1, rowLine = 1;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else { if (char === "\n") line++; cell += char; }
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") { row.push(cell.trim()); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((value) => value.length > 0)) rows.push({ line: rowLine, cells: row });
      row = []; line++; rowLine = line;
    } else cell += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push({ line: rowLine, cells: row });
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].cells.map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("CSV headers cannot be blank");
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) throw new Error("CSV contains duplicate headers");
  const records = rows.slice(1).map(({ line: recordLine, cells }) => ({
    line: recordLine,
    values: Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  }));
  return { headers, records };
}
