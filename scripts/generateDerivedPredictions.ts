/**
 * UI V0（PRE-WINDOWS INTEGRATION + UI V0、PHASE D）が読み込む
 * derived prediction JSONを生成するスクリプト。
 *
 * 対象:
 *  1. 2026新潟記念（既存の永続化済みFormal Prediction Snapshot、CHECKPOINT13.5B〜）
 *     — 実際のレース結果（ユーザー提供、docs/2026-niigata-kinen-race-retrospective-20260830.md
 *     で既に使用済みの実データ）をhorseName完全一致でのみ付与する（一致しない場合は
 *     付与しない、推測しない）。
 *  2. Collector V0で取り込み済みの既存5レース（新潟大賞典/新潟記念、実データ）
 *
 * 使い方: npm run generate:derived
 */
import fs from "node:fs";
import path from "node:path";
import { listPredictionSnapshots } from "../src/ability/import/predictionSnapshotStore";
import { runPredictionPipelineFromFormalSnapshot } from "../src/integration/formalSnapshotPipeline";
import { collectRace } from "../src/collector/collectRace";
import { buildDerivedFromCollector } from "../src/integration/derivedFromCollector";
import type { DerivedRacePrediction } from "../src/integration/uiTypes";

const OUT_DIR = path.join(__dirname, "..", "src", "integration", "data", "derived");

/**
 * 2026新潟記念の実際の着順（ユーザー提供、2026-08-30）。
 * docs/2026-niigata-kinen-race-retrospective-20260830.md で既に使用済みの実データを
 * そのまま再利用する（本スクリプトで新規に収集・推測したものではない）。
 * horseNameが完全一致した場合のみ付与する。
 */
const NIIGATA_KINEN_2026_ACTUAL_RESULT: Record<string, number> = {
  ゾロアストロ: 1,
  ロデオドライブ: 2,
  ダノンシーマ: 3,
  サヴォーナ: 4,
  アーバンシック: 5,
  ドゥレッツァ: 6,
  ボーンディスウェイ: 7,
  チェルヴィニア: 8,
  ジュンブロッサム: 9,
  バレエマスター: 10,
  ステレンボッシュ: 11,
};

const COLLECTOR_RACE_IDS = [
  "JRA-20230507-NIIGATA-11",
  "JRA-20250517-NIIGATA-11",
  "JRA-20250831-NIIGATA-11",
  "JRA-20240505-NIIGATA-11",
  "JRA-20240901-NIIGATA-11",
];

function write(derived: DerivedRacePrediction) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const filePath = path.join(OUT_DIR, `${derived.race.raceId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(derived, null, 2) + "\n", "utf-8");
  console.log(`wrote ${filePath} (horses=${derived.horses.length}, predicted=${derived.predicted}, hasResult=${derived.hasResult})`);
}

async function main() {
  // 1. 2026新潟記念
  const formalSnapshots = listPredictionSnapshots({ raceId: "JRA-20260830-NIIGATA-08" });
  if (formalSnapshots.length === 0) {
    console.warn("2026新潟記念のFormal Prediction Snapshotが見つかりませんでした。スキップします。");
  } else {
    const derived = runPredictionPipelineFromFormalSnapshot(formalSnapshots[0]);
    // FormalPredictionSnapshotRecordはraceName自体を保持していない（データ構造上のギャップ、
    // formalSnapshotPipeline.tsのコメント参照）。このレースが「新潟記念」であることは
    // このプロジェクト全体で既に確定・多数のdocsで使用済みの事実であり、ここでのみ上書きする。
    derived.race.raceName = "新潟記念";
    let matchedResultCount = 0;
    for (const h of derived.horses) {
      const actual = NIIGATA_KINEN_2026_ACTUAL_RESULT[h.horseName];
      if (actual !== undefined) {
        h.actualFinishPosition = actual;
        matchedResultCount++;
      }
    }
    derived.hasResult = matchedResultCount > 0;
    console.log(`2026新潟記念: 実着順を${matchedResultCount}/${derived.horses.length}頭でhorseName完全一致により付与`);
    write(derived);
  }

  // 2. Collector V0既存5レース
  for (const raceId of COLLECTOR_RACE_IDS) {
    const collected = await collectRace(raceId);
    if (collected.status !== "OK" || collected.race === null) {
      console.warn(`${raceId}: collectRace failed (${collected.failureReason}), skip`);
      continue;
    }
    const derived = buildDerivedFromCollector(collected.race, collected.runners, collected.priorHistories);
    write(derived);
  }
}

main();
