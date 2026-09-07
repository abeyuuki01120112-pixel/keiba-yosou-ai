import type { FutureLeakageAuditResult, FutureLeakageViolation, PriorHistoryEntry } from "./types";

/**
 * Future Leakage Guard（STEP5、最優先）。
 *
 * 対象レースより未来（同日含む、`>=`）のprior history行が1件でもあれば、
 * `ok: false`を返す。呼び出し側（`collectRace.ts`）はこの結果を見て
 * Collector Run全体のstatusを"FAIL"にする——単なるwarningではなく、
 * Runそのものを失敗させる（ユーザー指示のSTEP5を文字通り実装）。
 */
export function auditFutureLeakage(
  targetRaceDateIso: string,
  priorHistories: PriorHistoryEntry[],
): FutureLeakageAuditResult {
  const targetMs = Date.parse(targetRaceDateIso);
  const violations: FutureLeakageViolation[] = [];
  let checkedRowCount = 0;

  for (const entry of priorHistories) {
    for (const race of entry.races) {
      checkedRowCount++;
      if (Date.parse(race.raceDate) >= targetMs) {
        violations.push({
          horseId: entry.horseId,
          raceId: race.raceId,
          raceDate: race.raceDate,
          targetRaceDate: targetRaceDateIso,
        });
      }
    }
  }

  return { ok: violations.length === 0, checkedRowCount, violations };
}
