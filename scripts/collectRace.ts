/**
 * Automated Race Data Collector V0 — CLI wrapper。
 *
 * 使い方: npm run collect:race -- <raceId>
 *
 * `ManualRawFileProvider`が`src/collector/data/raw/<raceId>.json`を読み込み、
 * normalize → validate → Future Leakage監査 → `src/collector/data/normalized/`
 * への保存、まで実行する。production Ability計算へは一切接続しない。
 */
import { collectRace } from "../src/collector/collectRace";

async function main() {
  const raceId = process.argv[2];
  if (!raceId) {
    console.error("使い方: npm run collect:race -- <raceId>");
    process.exit(1);
  }

  const result = await collectRace(raceId);

  console.log(`raceId: ${result.raceId}`);
  console.log(`status: ${result.status}`);
  if (result.failureReason) console.log(`failureReason: ${result.failureReason}`);
  if (result.race) {
    console.log(`race: ${result.race.raceName} (${result.race.raceDate} ${result.race.racecourse} ${result.race.surface}${result.race.distance}m)`);
  }
  console.log(`runners: ${result.runners.length}`);
  const available = result.priorHistories.filter((p) => p.status === "available").length;
  console.log(`priorHistory available: ${available}/${result.priorHistories.length}`);
  console.log(`leakage: ok=${result.leakage.ok} checked=${result.leakage.checkedRowCount} violations=${result.leakage.violations.length}`);
  console.log(`validation: ok=${result.validation.ok} errors=${result.validation.errors.length} warnings=${result.validation.warnings.length}`);
  if (result.validation.errors.length > 0) console.log("errors:", result.validation.errors);
  if (result.validation.warnings.length > 0) console.log("warnings:", result.validation.warnings);
  console.log(`cache: wasCached=${result.cache.wasCached} writtenPath=${result.cache.writtenPath ?? "(none)"}`);

  process.exit(result.status === "OK" ? 0 : 1);
}

main();
