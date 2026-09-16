# Post-Race Update Input Contract V1

**Status:** Contract・Gate・Final Result mapper・Prior/Baseline resolver・決定的serialization/fingerprint・
fixture全頭E2Eまで実装。Post-Race Update Engine、RacePerformance生成、rolling history更新、
Base Ability更新、永続化は未実装。

## 1. 責務の結論

**B: Resultとは独立したPost-Race Update Inputを採用する。**

Race Result Artifact v2は、公式結果として取得した事実の正本である。既存Artifactはappend-onlyであり、
新しい派生情報を後付けしない。Post-Race Update Input V1は次を読み取り上で結合する一時的・検証可能な入力契約である。

- Race Result Artifact v2の公式結果
- Result v2に無いレース条件
- 対象レースより前の確定済みraceScore履歴
- 任意のbody weight情報
- 任意のtime/final3F baselineと同日客観結果
- 全入力のevidence/provenance

MemberLevel、baseline lookup、当日補正、raceScoreは派生値であり、公式Resultには混ぜない。
V1ではPost-Race Update Inputの永続化storeも作らない。まずGateを通過する入力候補を純粋関数で構築する。

## 2. Ability V1が本当に必要とする入力

正常完走馬を`RaceHistoryRawInput`へ変換するための必須値は、既存
`raceHistoryPipeline.ts`と`buildImportResult.ts`に基づき次のとおり。

- raceId / raceDate / raceName
- racecourse / surface / distance / going
- canonicalHorseId（RaceHistoryの外側のgroup key）
- finishPosition
- actualRaceTime
- timeGap
- final3F
- carriedWeight
- 対象レース出走馬ごとの、対象レースより前の確定済みraceScore履歴状態

`NO_PRIOR`は正常な状態であり、候補0頭なら既存仕様どおりMemberLevel 50へfallbackできる。
取得失敗の`UNAVAILABLE`を`NO_PRIOR`へ読み替えることは禁止し、Gateで拒否する。

取消・除外・競走中止・失格はResultから削除しない。V1ではRacePerformanceへ変換せず、
`INELIGIBLE_NON_START`または`INELIGIBLE_UNSETTLED_RESULT`として保持する。

## 3. Optional項目

- passingPosition / final3FRank / raceNumber / frameNumber / horseNumber
- bodyWeight / bodyWeightChange
- Course Time Baseline
- Course Final3F Baseline
- 同日他レースのtime/final3F資料

passingPositionと馬体重は現行raceScoreに使われない。基準値が無い場合、raceTimeScoreは70、
final3FScoreはレース内相対評価100%へ既存コードが明示的にfallbackする。同日資料不足時の補正は0かつ
`isReliable=false`となる。このためoptionalであり、欠損状態と理由・Evidenceを明示すればGateを通過できる。

## 4. Field Fulfillment Matrix

凡例: `R`=能力更新入力で必須、`O`=optional、`D`=派生値、`—`=非対象。

| field | RacePerformance/計算 | Result v2 | Final Result Adapter | JV-Link raw | 別source | 欠損時 | provenance |
|---|---|---:|---:|---:|---|---|---|
| raceId | R | あり | あり | RAから構築 | 不要 | reject | Result + RA evidence |
| canonicalHorseId | R | あり | あり | SE horseId | 不要 | reject | Result + SE evidence |
| raceDate | R | あり | あり | RA | 不要 | reject | Result + RA evidence |
| raceName | R | あり | あり | RA | 不要 | reject | Result + RA evidence |
| racecourse | R | なし | あり | RA | 不要 | reject | RACE_METADATA evidence |
| surface | R | なし | あり | RA | 不要 | reject | RACE_METADATA evidence |
| distance | R | なし | あり | RA | 不要 | reject | RACE_METADATA evidence |
| going | R | あり(nullable) | あり(nullable) | RA | 不要 | reject | Result/RA evidence |
| raceNumber | O | なし | なし | RA race key/field | 不要 | null、安全側 | RACE_METADATA evidence |
| finishPosition | R（正常完走馬） | あり | あり | SE | 不要 | eligibleならreject | Result evidence |
| actualRaceTime | R（正常完走馬） | あり | あり | SE field 339 | 不要 | eligibleならreject | Result evidence |
| timeGap | R（正常完走馬） | あり | あり | SE field 532 | 不要 | eligibleならreject | Result evidence |
| final3F | R（正常完走馬） | あり | あり | SE field 391 | 不要 | eligibleならreject | Result evidence |
| carriedWeight | R（正常完走馬） | あり | あり | SE field 289 | 不要 | eligibleならreject | Result evidence |
| passingPosition | O | あり | あり | SE fields 352/354/356/358 | 不要 | null | Result evidence |
| final3FRank | O/D | あり | adapter算出 | final3Fから算出 | 不要 | null | Result evidence |
| bodyWeight | O（現行raceScore未使用） | なし | なし | 現行parser未対応 | JRA/JV別record等、未確定 | UNAVAILABLE可 | BODY_WEIGHT evidence |
| bodyWeightChange | O（現行raceScore未使用） | なし | なし | 現行parser未対応 | JRA/JV別record等、未確定 | UNAVAILABLE可 | BODY_WEIGHT evidence |
| prior raceScore群 | R（MemberLevel） | なし | なし | 過去RA/SEから既存Ability pipelineが算出 | repository ability history | NO_PRIOR可、取得不能はreject | PRIOR_RACE_PERFORMANCE evidence |
| memberLevelScoreAtRace | D | なし | なし | 直接値なし | prior raceScore群から算出 | 全馬NO_PRIORなら既存50 fallback | 入力Evidence + breakdown |
| Course Time Baseline | O | なし | なし | 対象結果rawとは別 | baseline dataset | 無ければ既存70 fallback | COURSE_TIME_BASELINE evidence |
| Course Final3F Baseline | O | なし | なし | 対象結果rawとは別 | baseline dataset | 無ければ相対評価100% | COURSE_FINAL3F_BASELINE evidence |
| raceMedianWeight | D | なし | なし | 全正常完走馬の斤量から算出可能 | RaceFieldAggregateも可 | 全件不足なら既存70 fallback | runner Result evidence |
| raceMedianFinal3F | D | なし | adapterはrankのみ | 全正常完走馬から算出可能 | RaceFieldAggregateも可 | final3F必須Gateで防止 | runner Result evidence |
| same-day time context | O | なし | なし | 別レースRA/SE | 同日正式Result | 補正0/isReliable=false | SAME_DAY_RESULT evidence |
| same-day final3F context | O | なし | なし | 別レースRA/SE | 同日正式Result | 補正0/isReliable=false | SAME_DAY_RESULT evidence |
| source/evidence/provenance | R（監査） | 一部あり | あり | envelope | 各source | 不足ならreject | Contract evidence registry |

## 5. Gate

Gateは次を拒否する。

- ResultがFINAL/CORRECTEDでない、または正式sourceでない
- ResultとObjective DataのraceId/raceDate/raceName/going不一致
- canonicalHorseId集合の不一致・重複
- 正常完走馬のAbility V1必須実測値欠損
- sourceIdentifier、availableAt、retrievedAt、Evidence参照の不足
- Prediction Artifact由来Evidence
- EvidenceのtargetRaceId不一致
- prior raceに対象レース自身、同日、未来レースが含まれる
- prior履歴が`UNAVAILABLE`（確認済み`NO_PRIOR`とは区別）
- baselineまたは同日資料のレース条件不一致

値の0埋め、平均埋め、推定補完は行わない。既存Ability V1が明示的に定義しているfallbackは、
将来のUpdate EngineがGate通過後に既存関数を呼ぶ段階でのみ適用する。

## 6. 未実装境界

- Post-Race Update Inputの永続化
- InputからRaceHistoryRawInput/RacePerformanceへの変換
- MemberLevel/raceScore計算
- rolling windowへの追加
- Base Ability再計算・保存
- Race ReviewのAI/Human評価

これらは本Contractの実データE2E確認後に別段階として実装する。

## 7. Objective resolverの確定ルール

- Final Result Adapterの`going=null`は補完せずrejectする。
- `raceNumber`は現行Adapter中間表現に無いため`null`のまま保持する。raceId文字列から推測しない。
- Result Artifactに登録された取消・除外を削除せず、`NOT_APPLICABLE`かつ
  `INELIGIBLE_NON_START`として保持する。
- priorの`NO_PRIOR`は、履歴が空かつ`careerStartCountAsOf=0`を明示できる場合だけ採用する。
  履歴未取得、status不正、空履歴だが通算0走を証明できない場合は`UNAVAILABLE`とする。
- 対象レース自身、同日、未来のRacePerformanceが1件でもprior候補に含まれればresolverでrejectする。
- baselineはracecourse / surface / distance / going完全一致の既存recordだけを`AVAILABLE`にする。
  既存Ability lookupのdistance/default fallbackはこの層で注入しない。
- bodyWeight/bodyWeightChangeとsame-day recordsは現経路に値がないため、Evidence付き`UNAVAILABLE`とする。

## 8. Serialization / fingerprint

`inputContentFingerprint`はContractの内容をcanonical JSON化し、既存FNV-1a実装で算出する。
object key順、runner/evidence/Evidence参照の入力順、処理時刻`builtAt`はfingerprintへ影響しない。
`builtAt`は監査用にserialized Contract本体へ保持する。

deserialize時は次を順に検証する。

1. JSONとして解析可能
2. `post-race-update-input-v1`かつ`POST_RACE_UPDATE_INPUT`
3. 内容から再計算したfingerprintとの一致
4. Post-Race Update Input Gateがissue 0件

serializationはメモリ上の純粋変換だけであり、ProductionやArtifact storeへ保存しない。
