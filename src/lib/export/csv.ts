/**
 * CSV cells, safe to open in a spreadsheet.
 *
 * Applicants type some of these values. A cell that begins with = + - @ (or
 * a tab or carriage return) is run as a formula by Excel, Sheets and Numbers,
 * which is enough to exfiltrate the rest of the sheet. Such cells are
 * prefixed with an apostrophe, which spreadsheets show as plain text.
 * Numbers and dates the app produced itself are left alone.
 */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return String(value);
  let s = String(value);
  // A plain negative number ("-120.50") is data, not a formula.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join("\r\n");
}
