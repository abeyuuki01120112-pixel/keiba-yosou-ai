# CHECKPOINT13.4J — Structural No-Prior MemberLevel V1 / Final Eligibility Repair

実装ラウンド。memberLevelがfallback値になった原因を「missing_data（データ欠損）」と
「structural_no_prior_history（対戦馬全員がsource-backedなcareer debutで、prior race
が構造的に存在し得ない）」の2種類に正しく分離し、structural側のみpredictionEligibleの
blockから解除した。**Base Ability formula・memberLevel formula・FALLBACK_MEMBER_LEVEL_SCORE=50
はいずれも無変更**。

## 1. Evidence Status設計

新規モジュール `src/ability/memberLevelEvidence.ts` を追加。

```typescript
type MemberLevelEvidenceStatus = "available" | "missing_data" | "structural_no_prior_history";
type MemberLevelDataCompleteness = "complete" | "incomplete" | "unknown";
type MemberLevelEvidenceStrength = "full" | "partial" | "none";
```

`resolveMemberLevelEvidence(race, fieldMemberPriorCounts)` が1走ぶんの評価を返す。

| memberLevelBreakdown | 判定 | evidenceStatus | dataCompleteness | evidenceStrength |
|---|---|---|---|---|
| ≠null（正式計算済み） | — | available | complete | full（参加5頭以上）/ partial |
| null（fallback） | 新馬戦かつ全対戦馬prior=0 | structural_no_prior_history | complete | none |
| null（fallback） | それ以外・判定不能 | missing_data | unknown | none |

`predictionSnapshot.ts` の `buildHorseSnapshotEntry()` は、baseAbility算出に使う直近
最大5走それぞれについて `resolveMemberLevelEvidence()` を呼び、優先順位
`missing_data > structural_no_prior_history > available` で1頭ぶんの
`memberLevelEvidenceStatus` に集約する（1走でもmissing_dataがあれば全体がmissing_data）。
Short Career Evidence（`abilityEvidence`）・Suitability confidenceとは完全に別フィールド
（`HorseSnapshotEntry.memberLevelEvidenceStatus`）として保持し、混同していない。

## 2. Structural判定条件

`resolveMemberLevelEvidence()` は以下の**両方**が揃った場合のみstructural判定する
（`priorRaceAvailableCount=0`単独では判定しない、というCHECKPOINT13.4Jの安全条件）。

1. **raceNameが「新馬」パターンに一致**（`/新馬/`）— JRA公式のレース区分名。
   出走資格そのものが「それまで一度も競走に出走したことのない馬」に制度上限定されている
   （CHECKPOINT13.4Iで確認済みの事実）。既存の実データフィールド（CSV取り込み時の値）を
   見るだけで、捏造ではない。
2. **対象走の対戦馬が `data/horses/` 内で1頭以上確認でき、かつ確認できた全員が
   対象走より前のprior race数=0**（`getRaceFieldPriorRaceCounts(raceId, raceDate)` で算出）。

いずれか一方でも欠ける場合（新馬戦でない／対戦馬が1頭も確認できない／一部の対戦馬に
矛盾するprior raceがある）は、判定不能として安全側の `missing_data` に倒す。

`getRaceFieldPriorRaceCounts()`（`horseAbilityData.ts` 新設）は既存の
`historyByHorseId`（module-load時に1回だけ計算済みの、data/horses全体を投入した
`buildRaceHistory()` の結果）を走査するだけで、`buildRaceHistory()` を部分データで
再実行しない。

## 3. Missing Dataとの分離（future leakage禁止の確認）

判定に使う情報は以下のみ：
- 対象走自身の `raceName`（対象走自身のレース区分名。未来のレースを参照しない）
- 対象走より**前**の日付の走の有無（`raceDate < 対象走のraceDate` で厳密にフィルタ）

対象馬自身の「後から分かった通算キャリア数」のような事後情報は一切使っていない
（Short Career EvidenceのcareerCountRecordとは別の、独立した仕組み）。

## 4. Rodeo Drive Before/After

```
Before: baseAbility=76.7, predictionEligible=false, shortCareer=true, memberLevelUnavailable=true
After:  baseAbility=76.7, predictionEligible=true,  shortCareer=true, historyConfidence=medium,
        memberLevelEvidenceStatus=structural_no_prior_history
```

実測（`buildHorseSnapshotEntry()` 直接呼び出し、production data経由）で完全一致を確認。
デビュー戦 `JRA-20251221-NAKAYAMA-05`（2歳新馬、2025-12-21）の対戦馬15頭全員が、
`data/horses/` 上で確認できる範囲で全員prior race=0（CHECKPOINT13.4Iの監査結果と整合）。

## 5. Base Ability Regression

- ロデオドライブ: **76.7 → 76.7（無変更）**。structural判定でも追加補正は一切行っていない
  （`Base Ability -2` のような補正はコード上どこにも存在しない）。
- 新潟記念11頭全員のbaseAbilityが、CHECKPOINT13.4H時点の値から**1つも変化していない**
  （このラウンドは `data/horses/` を一切変更していない、コードのみの変更のため）。
- Frozen Benchmark（`abilityModelV1.frozenBenchmark.test.ts`）: **70.3、無変更**。
- Production シェイクユアハート: **70.9、無変更**（CHECKPOINT13.4H時点と同じ）。

## 6. 新潟記念11頭 Eligibility Board

| 馬名 | baseAbility | predictionEligible | shortCareer | historyConfidence | memberLevelEvidenceStatus |
|---|---|---|---|---|---|
| アーバンシック | 72.1 | true | false | high | available |
| サヴォーナ | 70.2 | true | false | high | available |
| ジュンブロッサム | 72.7 | true | false | high | available |
| ステレンボッシュ | 69.4 | true | false | high | available |
| ゾロアストロ | 74.8 | true | false | high | available |
| ダノンシーマ | 78.3 | true | false | high | available |
| チェルヴィニア | 69.1 | true | false | high | available |
| ドゥレッツァ | 67.4 | true | false | high | available |
| バレエマスター | 72.3 | true | false | high | available |
| ボーンディスウェイ | 73.1 | true | false | high | available |
| ロデオドライブ | 76.7 | true | true | medium | structural_no_prior_history |

warnings: 全馬共通で「馬場状態が未確定のためgoing適性はevaluated=false」の注記のみ
（正式馬場発表待ち、CHECKPOINT13.3以来の既知事項）。ロデオドライブのみ追加で
Short Career注記とstructural注記（本文脚注参照、値の補正は無し）。

## 7. Prediction Eligible Count

**11 / 11**。

目標として11/11を無理に狙ったのではなく、(a) CHECKPOINT13.4Hのデータ整備で10/11まで
到達し、(b) 今回のEvidence区分導入によりロデオドライブの残り1頭が
「データ欠損ではなく構造的に存在し得ないケース」と正しく分類されたことの、両方の
積み重ねの結果として11/11になった。10頭は元々`available`（正式memberLevel計算）で
到達しており、structural判定によって`predictionEligible`に切り替わったのはロデオ
ドライブ1頭のみ。

## 8. Tests

- `npx tsc -b`: エラーなし。
- `npm test`: **664 / 664 pass**（新規追加: `memberLevelEvidence.test.ts` 7件 +
  既存テスト2件の新設置き換え + `provisionalRunnerDiagnostic.test.ts` 2件の期待値更新）。
- チェックリストTest A〜Hの対応:
  - **Test A**（正式memberLevelあり→available/eligible）: `memberLevelEvidence.test.ts`
  - **Test B**（本来prior raceあり・data未取得→missing_data/ineligible）:
    `memberLevelEvidence.test.ts` + `predictionSnapshot.test.ts`（`MISSING_DATA_HORSE_ID`）
  - **Test C**（全対戦馬source-backed debut→structural/eligible）:
    `memberLevelEvidence.test.ts` + `predictionSnapshot.test.ts` +
    `shortCareerEligibility.integration.test.ts`（ロデオドライブ）
  - **Test D**（priorRaceCount=0だがdebut確認不能→structural禁止/ineligible）:
    `memberLevelEvidence.test.ts` の Test D-1〜D-3（新馬戦でない／対戦馬0頭／矛盾するprior）
  - **Test E**（Structural でも memberLevel fallback=50維持）: `memberLevelEvidence.test.ts`
  - **Test F**（Structural でも Base Ability追加補正なし）:
    `shortCareerEligibility.integration.test.ts`（`baseAbility===76.7`確認）
  - **Test G**（ロデオドライブ76.7不変）: 同上
  - **Test H**（Frozen Benchmark 70.3）: `abilityModelV1.frozenBenchmark.test.ts`
- `npm run lint`: エラーなし。
- `npm run build`: エラーなし。
- `npm run validate:data`: 検証成功（エラーなし）。既存の警告（courseTimeBaselines/
  courseFinal3FBaselines不足、simulation未登録horseId等）は本ラウンド無関係の既存事項。

## 9. 判定

**A**。

理由:
- チェックポイントで指定された仕様（3値区分、両条件AND判定、fallback=50維持、
  Base Ability無補正、Evidence分離）を過不足なく実装。
- Rodeo Driveの指定Before/After値と完全一致。
- 8つのテストケース要件（A〜H）すべてに対応するテストを配置。
- 11/11は結果であり、目標達成のために閾値やロジックを歪めていない
  （structural判定はロデオドライブの1ケースにのみ適用され、他の10頭は元々available）。
- 全既存フリーズ制約（Base Ability/memberLevel/final3F/raceTime/timeGap/weightScore/
  Suitability V1/Short Career V1）を数式レベルで無変更のまま確認。
- 回帰: Frozen Benchmark 70.3・Production シェイクユアハート 70.9、両方無変更。

無理にAを出していない根拠として明記しておく: もしTest Dのケース
（新馬戦でない場合や対戦馬が1頭も確認できない場合）で誤ってstructural判定してしまう
実装だったら、この判定はB-SPECまたはCに下げていた。今回は3パターン
（D-1: 新馬戦でない、D-2: 対戦馬0頭、D-3: 矛盾するprior）を明示的にテストし、
いずれも安全側（missing_data維持）に倒ることを確認済み。

## 10. 次にChatGPTと決める必要がある項目

優先順位順:

1. **Suitability（適性）・展開・トラックバイアス等、次フェーズの着手可否。**
   CLAUDE.mdの絶対原則6により、ユーザーの明示的な指示が出るまで着手しないが、
   Base Ability V1・memberLevel V1・Short Career V1・MemberLevel Evidence V1が
   出揃った現時点で、正式Stage A（本番Prediction Snapshot運用）への移行を
   検討するタイミングかどうか。
2. **`memberLevelEvidenceStrength`（full/partial/none）の下流活用方針。**
   現状は`predictionSnapshot.ts`内で計算のみ行い、`HorseSnapshotEntry`には
   `memberLevelEvidenceStatus`のみ公開している。`memberLevelEvidenceStrength`
   自体をUI/診断出力に露出するかどうかは未決定。
3. **`structural_no_prior_history`のUI表示方針。**
   現在はwarningsに文章として出るのみ。ユーザー向けUI（馬詳細画面等）で
   「初戦のため参考データなし」等の専用バッジ表示にするかどうかは未着手。
4. **新潟記念以外のレースへの本Evidence機構の展開。**
   今回は新潟記念11頭のみで検証したが、他レースでも同様の新馬戦パターンが
   発生し得るため、本番運用前に他レースでも動作確認するかどうか。

以上、CHECKPOINT13.4J完了。正式Stage A・CHECKPOINT14へは進まず、ここでSTOPする。
