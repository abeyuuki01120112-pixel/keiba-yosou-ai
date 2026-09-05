/**
 * CHECKPOINT14A.2 14節: CHECKPOINT14A.1で発見済みの実データ
 * （data/import/samples/takarazuka_kinen_2026_18horses.csv、fieldSizeが正しく入っている）と、
 * その馬の実際のdata/horses/<horseId>.jsonの内容をfixtureとして読み込み、
 * Non-destructive Enrichment Mergeが機能することを実証する。
 *
 * 【重要】production data（src/ability/data/horses/）は読み取り専用でのみ参照し、
 * 一切書き込まない。このテストはdry-run相当（mergeHorseRaceHistory()の呼び出し結果を
 * 検証するだけ）。npm run import:csv は実行しない。
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../csvParser";
import { buildImportResult } from "../buildImportResult";
import { mergeHorseRaceHistory } from "../mergeHorseHistory";
import type { RaceHistoryRawInput } from "../../raceHistoryPipeline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const SAMPLE_CSV_PATH = path.join(
  ROOT,
  "src/ability/data/import/samples/takarazuka_kinen_2026_18horses.csv",
);
const HORSES_DIR = path.join(ROOT, "src/ability/data/horses");

const MEISHO_TABARU_ID = "2021103272";
const TAKARAZUKA_KINEN_RACE_ID = "JRA-20260614-HANSHIN-11";

describe("CHECKPOINT14A.2 実データ実証: メイショウタバル（CHECKPOINT14A.1で特定済み）", () => {
  it("既存のdisk上のbare recordと、fieldSize=18を含む既存CSVをmergeすると、fieldSizeがenrichment候補になる", () => {
    const existingRaw = fs.readFileSync(path.join(HORSES_DIR, `${MEISHO_TABARU_ID}.json`), "utf-8");
    const existingRaces: RaceHistoryRawInput[] = JSON.parse(existingRaw);
    const targetExisting = existingRaces.find((r) => r.raceId === TAKARAZUKA_KINEN_RACE_ID);
    expect(targetExisting).toBeDefined();
    // CHECKPOINT14A.1で確認済みの事実: fieldSize/gate/horseNumberとも無い素のrecord
    expect(targetExisting?.fieldSize ?? null).toBeNull();
    expect(targetExisting?.gate ?? null).toBeNull();

    const csvText = fs.readFileSync(SAMPLE_CSV_PATH, "utf-8");
    const rows = parseCsv(csvText);
    expect(rows.some((r) => r.horseId === MEISHO_TABARU_ID)).toBe(true);

    const importResult = buildImportResult(csvText);
    const incomingRaces = importResult.byHorseId[MEISHO_TABARU_ID];
    expect(incomingRaces).toBeDefined();
    const incomingTarget = incomingRaces.find((r) => r.raceId === TAKARAZUKA_KINEN_RACE_ID);
    expect(incomingTarget?.fieldSize).toBe(18);

    const mergeResult = mergeHorseRaceHistory(existingRaces, incomingRaces);

    // fieldSizeはenrichment field。ただしCHECKPOINT14A.2ではgate/horseNumberを
    // enrichment field化していない（6節: 今回最低限はpassingPosition/fieldSizeのみ）ため、
    // このCSV行はgate/horseNumberという別のcore fieldも同時に持っており、
    // 「fieldSizeだけ安全に補完できる」わけではなく、gate/horseNumberの食い違いにより
    // record全体がconflict扱いになる（=このCSVをそのまま再投入しても、この馬のファイルは
    // 書き込まれない）ことを、実データで直接確認する。これは正直な結果であり、
    // 「今回の実装だけで全ての既知ケースが自動的に解消する」という誇張をしないための検証。
    const conflict = mergeResult.conflicts.find((c) => c.raceId === TAKARAZUKA_KINEN_RACE_ID);
    expect(conflict).toBeDefined();
    const conflictFields = conflict?.differences.map((d) => d.field).sort() ?? [];
    // gate/horseNumberに加え、CHECKPOINT13.2以降のraceNumber/source系metadataも
    // この馬の当該recordには一切無いため、それらも食い違いとして検出される。
    // このCSVをそのまま再投入しても、この馬のファイルはCHECKPOINT14A.2時点では
    // まだ書き込まれない（gate/horseNumber/metadataはenrichment field化していないため）。
    expect(conflictFields).toContain("gate");
    expect(conflictFields).toContain("horseNumber");
    expect(conflictFields).not.toContain("fieldSize"); // fieldSize自体はenrichment field扱いなのでconflict一覧には出ない
    expect(conflictFields).not.toContain("raceTime"); // core dataは実際に一致している（同じ実レースのため）
    expect(mergeResult.enriched).toHaveLength(0);
  });

  it("fieldSize以外の全fieldが既に一致している想定（将来、gate/horseNumber/metadataが別途揃った後）では、実際のfieldSize=18が正しく安全に補完される", () => {
    const csvText = fs.readFileSync(SAMPLE_CSV_PATH, "utf-8");
    const importResult = buildImportResult(csvText);
    const incomingTarget = importResult.byHorseId[MEISHO_TABARU_ID].find(
      (r) => r.raceId === TAKARAZUKA_KINEN_RACE_ID,
    )!;
    expect(incomingTarget.fieldSize).toBe(18); // CHECKPOINT14A.1で確認済みの実データ値

    // 「fieldSize以外は既に一致済み」という想定のfixture（実際のincoming値をベースに、
    // fieldSize/passingPositionだけ未取得＝nullに戻した状態を「既存record」とみなす）。
    // production dataは書き換えない、mergeロジック単体の実証。
    const existingWithOnlyFieldSizeMissing: RaceHistoryRawInput = {
      ...incomingTarget,
      fieldSize: null,
      passingPosition: null,
    };

    const mergeResult = mergeHorseRaceHistory([existingWithOnlyFieldSizeMissing], [incomingTarget]);
    expect(mergeResult.conflicts).toHaveLength(0);
    expect(mergeResult.enriched).toEqual([{ raceId: TAKARAZUKA_KINEN_RACE_ID, enrichedFields: ["fieldSize"] }]);
    const enrichedRecord = mergeResult.merged.find((r) => r.raceId === TAKARAZUKA_KINEN_RACE_ID);
    expect(enrichedRecord?.fieldSize).toBe(18);
    // core fieldは無変更（実際の宝塚記念2026の実データ値のまま）
    expect(enrichedRecord?.finishPosition).toBe(1);
    expect(enrichedRecord?.raceTime).toBe(132.1);
  });
});
