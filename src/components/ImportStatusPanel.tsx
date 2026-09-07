import { useMemo, useState } from "react";
import sampleImportCsv from "../ability/data/import/race-performances.csv?raw";
import { buildImportResult } from "../ability/import/buildImportResult";

/**
 * データ取り込み状況の最小限の確認パネル。
 * 巨大な管理画面は作らず、読み込み件数・正常データ件数・除外データ件数・エラー件数だけを
 * 確認できるようにする。表示対象は src/ability/data/import/race-performances.csv
 * （実データ投入のサンプル・雛形）。同じ判定ロジック（normalize層）を
 * scripts/importRacePerformancesCsv.ts のCLIと共有している。
 */
export function ImportStatusPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const result = useMemo(() => buildImportResult(sampleImportCsv), []);

  return (
    <div className="import-status-panel">
      <button type="button" className="import-status-toggle" onClick={() => setIsOpen((v) => !v)}>
        データ取り込み状況（サンプルCSV） {isOpen ? "▲" : "▼"}
      </button>
      {isOpen && (
        <div className="import-status-body">
          <div className="import-status-counts">
            <span>読み込み件数 {result.totalRows}</span>
            <span>正常データ件数 {result.normalizedCount}</span>
            <span>除外データ件数 {result.excludedFromScoringCount}</span>
            <span className={result.errorCount > 0 ? "import-status-error-count" : undefined}>
              エラー件数 {result.errorCount}
            </span>
          </div>
          {result.errors.length > 0 && (
            <ul className="import-status-error-list">
              {result.errors.map((e, idx) => (
                <li key={idx}>
                  行{e.rowIndex}（raceId={e.raceId ?? "?"} / horseId={e.horseId ?? "?"}）: {e.message}
                </li>
              ))}
            </ul>
          )}
          <p className="import-status-hint">
            実データ投入手順は docs/data-input-guide.md を参照。CSVは`npm run import:csv`で
            data/horses/へ取り込めます。
          </p>
        </div>
      )}
    </div>
  );
}
