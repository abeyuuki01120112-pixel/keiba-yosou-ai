import { describe, expect, it } from "vitest";
import { parseCsv } from "../csvParser";

describe("parseCsv", () => {
  it("ヘッダー行を元にオブジェクト配列へ変換する", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n4,5,6");
    expect(rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("空セル（末尾の欠損含む）を空文字として保持する", () => {
    const rows = parseCsv("a,b,c\n1,,3\n4,5,");
    expect(rows[0]).toEqual({ a: "1", b: "", c: "3" });
    expect(rows[1]).toEqual({ a: "4", b: "5", c: "" });
  });

  it("空行・#コメント行を無視する", () => {
    const rows = parseCsv("a,b\n# comment\n1,2\n\n3,4");
    expect(rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("データ行が無ければ空配列を返す", () => {
    expect(parseCsv("a,b,c")).toEqual([]);
    expect(parseCsv("")).toEqual([]);
  });
});
