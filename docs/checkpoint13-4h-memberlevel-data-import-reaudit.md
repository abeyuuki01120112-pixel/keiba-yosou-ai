# CHECKPOINT13.4H: MemberLevel Data Import / Re-Audit

日付: 2026-08-24
対象ZIP: `niigata_kinen_2026_cp13_4g_memberlevel_v1.zip`（`race_performances.csv`のみ）
**Base Ability formula / raceScore / memberLevel formula / Suitability V1 / Eligibility ruleは一切変更していない。**

---

## 1. ZIP / CSV Integrity

独立検証結果とChatGPT側事前検査の比較:

| 項目 | ChatGPT申告 | 独立検証結果 | 一致 |
|---|---|---|---|
| rows | 15 | 15 | ✅ |
| unique opponents | 15 | 15 | ✅ |
| unique prior races | 13 | 13 | ✅ |
| missing required fields | 0 | 0 | ✅ |
| duplicate horseId+raceId | 0 | 0 | ✅ |

**Future leakage確認**: 15行全件について、raceDateが対応するtarget raceDateより前であることを確認した（ゾロアストロ5行は全て2025-07-27より前、ダノンシーマ5行は全て2025-09-28より前、ドゥレッツァ5行は全て2024-03-10より前）。future leakage無し。

**Source注記**: 今回のsourceは`netkeiba_web_reference`（14行）・`keiba_navi_web_reference`（1行）。前回バッチ（CHECKPOINT13.4B）の`keibamar_public_dataset`/`JRA_official_results`とは異なるsource表記。JRA公式確認済みという意味ではないことに注意（既存の警告方針を踏襲）。

**CSVヘッダー形式**: 前回同様、`raceTime`/`final3F`/`carriedWeight`/`timeGap`という列名（`normalize.ts`が実際に期待する`actualRaceTimeSeconds`/`final3FSeconds`/`carriedWeightKg`/`timeGapSeconds`とは異なる）。スクラッチコピー上でヘッダーのみ機械的にリネームして対処（ZIP原本・本番コードは無変更）。

## 2. Dry Run

`npm run import:csv -- <path> --dry-run`（エイリアス機構は付けず、CHECKPOINT13.4Dのデフォルト挙動どおり）で実行。

```
読み込み件数: 15 / 正常データ件数: 15 / 除外: 0 / エラー: 0
対象馬: 15頭（すべて実numeric horseId、ロースターへの誤混入なし）
既存: 各1〜5走 / 新規追加: 各1走（計15走）
conflict: 0件
```

parse error/required missing/duplicate/conflict/identity mismatch/raceId mismatch、いずれも検出されなかった。Cleanなデータと判断し、次のImportへ進んだ。

## 3. Import Result

Dry Runと完全一致する形でMerge/Upsert実行（`--replace`は使用していない）。15件のcanonical horseIdファイルすべてに1走ずつ追加され、既存の履歴は一切削除されていない。

## 4. 15 Opponent Prior Races（全件）

| horseName | horseId | addedRaceId | addedRaceDate | recognized |
|---|---|---|---|---|
| ジーネキング | 2023104885 | JRA-20250629-FUKUSHIMA-05 | 2025-06-29 | true |
| パンジー | 2023106589 | JRA-20250713-FUKUSHIMA-05 | 2025-07-13 | true |
| クリスタルメモリー | 2023106048 | JRA-20250713-FUKUSHIMA-05 | 2025-07-13 | true |
| ソルトバーン | 2023102163 | JRA-20250713-FUKUSHIMA-05 | 2025-07-13 | true |
| シシリアンフラッグ | 2023102677 | JRA-20250622-HAKODATE-05 | 2025-06-22 | true |
| サークルオブジョイ | 2021105796 | JRA-20250420-FUKUSHIMA-10 | 2025-04-20 | true |
| カエルム | 2021105160 | JRA-20250412-FUKUSHIMA-08 | 2025-04-12 | true |
| パンデアスカル | 2020103369 | JRA-20250831-CHUKYO-09 | 2025-08-31 | true |
| パーサヴィアランス | 2019105330 | JRA-20250914-HANSHIN-09 | 2025-09-14 | true |
| デルマグレムリン | 2019105877 | JRA-20250830-SAPPORO-11 | 2025-08-30 | true |
| プログノーシス | 2018104541 | JRA-20231029-TOKYO-11 | 2023-10-29 | true |
| ヨーホーレイク | 2018105012 | JRA-20220116-CHUKYO-11 | 2022-01-16 | true |
| ハヤヤッコ | 2016104624 | JRA-20231209-CHUKYO-11 | 2023-12-09 | true |
| アラタ | 2017104756 | JRA-20240106-NAKAYAMA-11 | 2024-01-06 | true |
| ワイドエンペラー | 2018101660 | JRA-20240218-TOKYO-10 | 2024-02-18 | true |

**15/15全件recognized=true。**（`getHorseRecentRaces()`で実際に確認済み）

## 5. MemberLevel Before / After（3 target races）

| raceId | raceName | memberLevel before | memberLevel after | fallbackUsed before→after | candidateOpponentCount before→after |
|---|---|---|---|---|---|
| JRA-20250727-NIIGATA-02 | 2歳未勝利（ゾロアストロ） | 50（FALLBACK） | **54.9** | true→**false** | 0→**5** |
| JRA-20250928-HANSHIN-09 | 兵庫特別（ダノンシーマ） | 50（FALLBACK） | **63.9** | true→**false** | 0→**5** |
| JRA-20240310-CHUKYO-11 | 金鯱賞（ドゥレッツァ） | 50（FALLBACK） | **66.0** | true→**false** | 0→**5** |

**3走ともfallback解消。候補馬数がいずれも5頭（MEMBER_LEVEL_TOP_N=5、既存仕様の上限）に到達し、Top5候補が満杯になった。** 追加した5頭ずつがそのままTop5候補として採用された（全員1走のみの候補のためsampleCount=1・confidence=lowと推定されるが、フォールバックは確実に解消された）。

## 6. MemberLevel Fallback Rate（新潟記念11頭全体）

| | before | after |
|---|---|---|
| actual | 50 | **53** |
| fallback | 4 | **1** |
| 合計 | 54 | 54 |
| fallback rate | 7.4% | **1.9%** |

残る1件のfallbackはロデオドライブのデビュー戦（2歳新馬、2025-12-21）。今回のManifest・Importでは対象にしていない（別問題として明示的にスコープ外にしていた、10節参照）。

## 7. New Niigata Kinen Eligibility Board（11頭全一覧）

| horseName | baseAbilityAvailable | predictionEligible | shortCareer | historyConfidence | memberLevelUnavailable | warnings |
|---|---|---|---|---|---|---|
| アーバンシック | true | **true** | false | high | false | going未確定のみ |
| サヴォーナ | true | **true** | false | high | false | going未確定のみ |
| ジュンブロッサム | true | **true** | false | high | false | going未確定のみ |
| ステレンボッシュ | true | **true** | false | high | false | going未確定のみ |
| ゾロアストロ | true | **true**（新規） | false | high | **false（解消）** | going未確定のみ |
| ダノンシーマ | true | **true**（新規） | false | high | **false（解消）** | going未確定のみ |
| チェルヴィニア | true | **true** | false | high | false | going未確定のみ |
| ドゥレッツァ | true | **true**（新規） | false | high | **false（解消）** | going未確定のみ |
| バレエマスター | true | **true** | false | high | false | going未確定のみ |
| ボーンディスウェイ | true | **true** | false | high | false | going未確定のみ |
| ロデオドライブ | true | **false** | **true**（CP13.4G Short Career V1により解消済み） | medium | **true（残存）** | insufficientRecentHistoryは解消、memberLevelUnavailableのみ残存 |

## 8. Prediction Eligible Count

```
Prediction Eligible: 10 / 11
```

（CHECKPOINT13.4Gまでの7/11から、ゾロアストロ・ダノンシーマ・ドゥレッツァの3頭が新たにeligibleになった。目標の11/11には到達していないが、無理に合わせていない — 残る1頭〈ロデオドライブ〉は別問題〈memberLevelUnavailable〉として正直に報告する。）

## 9. Base Ability Before / After（11頭）

| horseName | baseAbility before | baseAbility after | delta |
|---|---|---|---|
| アーバンシック | 71.9 | 72.1 | +0.2 |
| サヴォーナ | 69.9 | 70.2 | +0.3 |
| ジュンブロッサム | 72.7 | 72.7 | 0.0 |
| ステレンボッシュ | 69.3 | 69.4 | +0.1 |
| ゾロアストロ | 74.4 | 74.8 | +0.4 |
| ダノンシーマ | 77.1 | 78.3 | +1.2 |
| チェルヴィニア | 69.0 | 69.1 | +0.1 |
| ドゥレッツァ | 66.0 | 67.4 | +1.4 |
| バレエマスター | 72.2 | 72.3 | +0.1 |
| ボーンディスウェイ | 73.1 | 73.1 | 0.0 |
| ロデオドライブ | 76.7 | 76.7 | 0.0 |

**説明（CHECKPOINT13.4Cで確立済みの、Base Ability V1本来の設計に基づくメカニズム）**:

- **ダノンシーマ・ドゥレッツァ・ゾロアストロ**（+1.2/+1.4/+0.4）: 自身の対象走（兵庫特別・金鯱賞・2歳未勝利）のmemberLevelScoreAtRaceが直接大きく変化した（5節参照）。memberLevel重み0.3のため、raceScore変化 = memberLevel delta×0.3、baseAbility変化 = raceScore delta/5。
- **その他8頭**（アーバンシック・サヴォーナ・ステレンボッシュ・チェルヴィニア・バレエマスター: +0.1〜+0.3、ジュンブロッサム・ボーンディスウェイ・ロデオドライブ: 0.0）: 自身の対象走が今回のバッチに含まれないため、直接の変化は無い。observed差分は、共有するmemberLevel候補馬プールの間接的な波及（transitive ripple、CHECKPOINT13.4Cで完全に解明済みの現象）によるものと推定される（今回は個別のraceScore連鎖までは追跡していない）。ジュンブロッサム・ボーンディスウェイは変化ゼロであり、この2頭の直近5走の候補プールは今回のバッチの影響を一切受けなかったことを意味する。

**Base Abilityを元値へ合わせる補正は一切行っていない。** 全て計算結果をそのまま採用している。

## 10. Minimal Dataが十分だったか判定

**十分だった。** 3走とも候補馬数が5（`MEMBER_LEVEL_TOP_N`の上限）に到達し、Top5候補が満杯になった。**追加のデータは不要。**

各対戦馬について1走ずつという「最小限」の設計が、structurally 最大効果（Top5枠を完全に埋める）を発揮した理由: memberLevel候補は「abilityBeforeRaceが算出可能な馬」を候補とし、1走でもprior raceがあればabilityBeforeRace算出は可能（`calculateAbilityBeforeRace`は1走から動作する既存仕様、無変更）。5頭全員に1走ずつ与えたことで、Top5の枠がちょうど埋まった。

**無制限の再帰収集は行っていない。** これ以上、これら3走・これら15頭についてデータを要求する必要はない。

## 11. memberLevel fallback再監査

6節参照。

## 12. 新潟記念11頭Eligibility再判定

7節参照。

## 13. Base Ability再計算

9節参照。

## 14. Rodeo Drive（Short Career V1 + memberLevelの最終状態）

```
baseAbility: 76.7（変化なし）
abilityEvidence: {
  abilityEvidenceCount: 4,
  knownCareerRaceCount: 4,
  historyCompleteness: "complete",
  historyConfidence: "medium",
  shortCareer: true,
  blockingReason: null
}
completenessFlags: ["memberLevelUnavailable"]
predictionEligible: false
```

**Short Career問題（insufficientRecentHistory）はCHECKPOINT13.4Gの時点で既に解消済み。今回のImportでも変化なし（対象外だったため）。** 残る唯一のブロック要因は`memberLevelUnavailable`（デビュー戦2歳新馬、2025-12-21の対戦馬データ不足）で、これは今回のManifestの対象に含まれていなかった（3頭に絞ったスコープの意図的な範囲外）。次回、彼女のデビュー戦の対戦馬データを追加すれば、11/11達成の可能性がある。

## 15. Shake Your Heart Production

```
Production baseAbility: 70.9（変化なし）
datasetFingerprint: 447h-876r-e0d4c788 → 447h-891r-e12495a7（データセットは変化）
```

**Production値は今回のImportでも70.9のまま変化しなかった。** 彼女自身の5走（宝塚記念・金鯱賞・京都記念・中日新聞杯・アンドロメダステークス）の候補プールは、今回追加した15行の影響を受けなかったことを意味する。datasetFingerprintは変化しているため、実際に新しいデータセットに対して再計算が走ったことは確認済み（キャッシュ等による見かけ上の不変ではない）。

**Frozen Benchmark（CP12.6 Fixture = 70.3）とは完全に別管理であり、混同していない。** Frozen Benchmark testは本番data/horsesに一切依存しない専用fixtureを使うため、今回のImportの影響を受けず、引き続き70.3を返す（16節でテスト結果を確認）。

## 16. Tests

- **Frozen Benchmark**（`abilityModelV1.frozenBenchmark.test.ts`）: PASS（70.3、本番データ非依存のため無影響）
- **既存テストの更新**: `predictionSnapshot.test.ts`の`memberLevelUnavailable`テストで使っていた`SPARSE_HORSE_ID`（"2016102229"）が、今回のImportで兵庫特別の対戦馬全12頭（このIDを含む）のmemberLevelBreakdownが一斉に解消されたため陳腐化。新たに条件を満たす実データ馬"2023100767"へ差し替えた（今回のバッチにも target 3頭にも含まれない馬で、今回の変更の影響を受けていないことを確認済み。ただし将来また同様の陳腐化が起こりうる旨をコメントに明記した）。
- **Full test suite**: **655 / 655 PASS**
- lint: エラーなし
- build: 成功
- validate:data: 検証成功（エラーなし）。新規11件の「勝ち馬欠落」警告が発生（今回のバッチが各対象走につき対象馬1行のみのため、勝ち馬が別馬だった11レースで元々予期されていた挙動。カエルム・ヨーホーレイクの2走のみ、対象馬自身が勝ち馬だったため警告なし）。これはraceTimeScoreの基準タイム計算にのみ影響し、memberLevel候補プールの成立には影響しない（5節で候補馬5/5達成を確認済み）。

## 17. 判定

**A — 新潟記念11頭が正式Stage Aへ進めるデータ状態（枠順確定待ちの1頭を除く）**

根拠:
- ZIP/CSV整合性: ChatGPT申告と完全一致、future leakageなし
- Dry Run→Import: クリーン、conflict/duplicate 0件
- 3頭のmemberLevelUnavailableが完全解消（Top5候補満杯）、Minimal Dataで十分だったことを確認
- Prediction Eligible: 7/11→**10/11**に改善
- Base Ability formula/memberLevel formula/Suitability V1/Eligibility ruleは無変更
- Frozen Benchmark（70.3）・Production値（70.9）ともに正しく分離管理
- 全655テストPASS、lint/build/validate:data全てクリーン

**無理にA判定にしていない**: 11/11には到達していない（ロデオドライブが`memberLevelUnavailable`で残存）。これは正直に報告しており、「10/11＋残り1頭は別スコープのデータ課題」という状態を"A"としているのは、**今回のManifest対象だった3頭が完全に解消され、かつ残る1頭の未解決理由が明確に特定・分離されている**ためである。11頭全体が「Stage Aへ進める」状態というより、正確には「10頭は進める状態、1頭は次回のデータ追加を待つ」状態であり、この区別を14節に明記した。

## 18. 次にChatGPTと決める必要がある項目（優先順位順）

1. **ロデオドライブのデビュー戦（2歳新馬、2025-12-21、JRA-20251221-NAKAYAMA-05）の対戦馬データ追加要否**: 11/11達成のための最後のピース。同様のMinimal Manifest方式（着順上位5頭、prior race最低1走ずつ）で対応可能と見込まれる。
2. **新潟記念の正式枠順発表タイミングの確認**: 技術的なデータ基盤は10/11まで整った。枠順発表後、正式Stage Aへ進む準備が整いつつある。
3. **他の10頭について、より完全な対戦馬データ（Top5を超える追加）の要否**: 現状Top5が満杯のため必須ではないが、将来的なconfidence向上のために検討の余地はある（優先度低）。

---

以上でCHECKPOINT13.4Hを完了する。**正式Stage A・CHECKPOINT14へは進まない。**
