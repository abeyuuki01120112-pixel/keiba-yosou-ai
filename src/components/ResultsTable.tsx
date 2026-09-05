import { useMemo, useState } from "react";
import type { SimulationHorseStats } from "../simulation/types";
import { expectedValue, fairOdds, isPositiveExpectedValue } from "../simulation/expectedValue";

interface Props {
  stats: SimulationHorseStats[];
  oddsByHorseId: Record<string, number | undefined>;
  onOddsChange: (horseId: string, value: number | undefined) => void;
  onSelectHorse: (horseId: string) => void;
}

type SortKey =
  | "number"
  | "winRate"
  | "top2Rate"
  | "top3Rate"
  | "fairOdds"
  | "actualOdds"
  | "expectedValue";

interface Row extends SimulationHorseStats {
  fairOddsValue: number;
  actualOdds: number | undefined;
  expectedValueValue: number | undefined;
}

export function ResultsTable({ stats, oddsByHorseId, onOddsChange, onSelectHorse }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("expectedValue");
  const [sortDesc, setSortDesc] = useState(true);

  const rows: Row[] = useMemo(
    () =>
      stats.map((s) => {
        const actualOdds = oddsByHorseId[s.horseId];
        return {
          ...s,
          fairOddsValue: fairOdds(s.winRate),
          actualOdds,
          expectedValueValue:
            actualOdds !== undefined ? expectedValue(s.winRate, actualOdds) : undefined,
        };
      }),
    [stats, oddsByHorseId],
  );

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va === vb) return a.number - b.number;
      // undefinedな期待値は常に末尾に
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      return sortDesc ? vb - va : va - vb;
    });
    return copy;
  }, [rows, sortKey, sortDesc]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  if (stats.length === 0) {
    return <p className="empty-hint">まだシミュレーション結果がありません。実行してください。</p>;
  }

  return (
    <div className="table-wrapper">
      <table className="results-table">
        <thead>
          <tr>
            <SortableHeader label="馬番" sortKey="number" current={sortKey} desc={sortDesc} onSort={handleSort} />
            <th>馬名</th>
            <SortableHeader label="勝率" sortKey="winRate" current={sortKey} desc={sortDesc} onSort={handleSort} />
            <SortableHeader label="連対率" sortKey="top2Rate" current={sortKey} desc={sortDesc} onSort={handleSort} />
            <SortableHeader label="複勝率" sortKey="top3Rate" current={sortKey} desc={sortDesc} onSort={handleSort} />
            <SortableHeader label="適正オッズ" sortKey="fairOdds" current={sortKey} desc={sortDesc} onSort={handleSort} />
            <th>実オッズ</th>
            <SortableHeader label="期待値" sortKey="expectedValue" current={sortKey} desc={sortDesc} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={row.horseId}
              className={
                row.expectedValueValue !== undefined && isPositiveExpectedValue(row.expectedValueValue)
                  ? "ev-positive"
                  : undefined
              }
            >
              <td>{row.number}</td>
              <td>
                <button
                  type="button"
                  className="horse-name-btn"
                  onClick={() => onSelectHorse(row.horseId)}
                >
                  {row.horseName}
                </button>
              </td>
              <td>{row.winRate.toFixed(2)}%</td>
              <td>{row.top2Rate.toFixed(2)}%</td>
              <td>{row.top3Rate.toFixed(2)}%</td>
              <td>{Number.isFinite(row.fairOddsValue) ? row.fairOddsValue.toFixed(2) : "-"}</td>
              <td>
                <input
                  className="odds-input"
                  type="number"
                  step="0.1"
                  min="1"
                  value={row.actualOdds ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onOddsChange(row.horseId, v === "" ? undefined : Number(v));
                  }}
                  placeholder="—"
                />
              </td>
              <td className="ev-cell">
                {row.expectedValueValue !== undefined ? `${row.expectedValueValue.toFixed(1)}%` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function sortValue(row: Row, key: SortKey): number | undefined {
  switch (key) {
    case "number":
      return row.number;
    case "winRate":
      return row.winRate;
    case "top2Rate":
      return row.top2Rate;
    case "top3Rate":
      return row.top3Rate;
    case "fairOdds":
      return Number.isFinite(row.fairOddsValue) ? row.fairOddsValue : undefined;
    case "actualOdds":
      return row.actualOdds;
    case "expectedValue":
      return row.expectedValueValue;
    default:
      return undefined;
  }
}

function SortableHeader({
  label,
  sortKey,
  current,
  desc,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  desc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th className="sortable-header" onClick={() => onSort(sortKey)}>
      {label}
      {active ? (desc ? " ▼" : " ▲") : ""}
    </th>
  );
}
