/**
 * ごく単純なCSVパーサ。
 * V0の割り切り: フィールド内にカンマ・改行を含む値には対応しない
 * （競馬場名・馬場状態・レース名などカンマを含まない前提の短いテキストのみ扱う）。
 * 複雑なCSV（Excel由来の引用符付きなど）を扱う必要が出てきたら、
 * その時に専用ライブラリの導入を検討する。
 */

export function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

/** CSVの文字列セルを数値に変換する。空文字や非数値はエラーを投げる */
export function toNumber(value, fieldName, rowIndex) {
  const n = Number(value);
  if (value === "" || Number.isNaN(n)) {
    throw new Error(`行${rowIndex + 2}: "${fieldName}" を数値に変換できません（値: "${value}"）`);
  }
  return n;
}
