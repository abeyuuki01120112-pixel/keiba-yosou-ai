/**
 * ごく単純なCSVパーサ。
 * V0の割り切り: フィールド内にカンマ・改行を含む値には対応しない
 * （raceName・racecourse・going等はカンマを含まない短いテキストの前提）。
 * 空セルは空文字列として返す（normalize側でnull/欠損として扱う）。
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}
