# Race Card Input V1

CHECKPOINT13.2Bで追加。実際の1レースの出走表を、Runner Resolver → Stage A
Snapshot（診断用）へ橋渡しするための入力形式。過去走データ（`data/horses/`）
とは別種のデータであり、これを読み込んでも`data/horses/`は一切書き換わらない。

## JSON形式

```json
{
  "raceId": "202609060911",
  "raceDate": "2026-09-06",
  "raceNumber": 11,
  "racecourse": "阪神",
  "surface": "turf",
  "distance": 2200,
  "scheduledStartTime": "2026-09-06T15:45:00+09:00",
  "going": null,
  "runners": [
    {
      "horseId": "shakeyourheart",
      "horseName": "シェイクユアハート",
      "frame": 1,
      "horseNumber": 1,
      "assignedWeight": 58,
      "scratched": false
    },
    {
      "horseName": "馬名だけ分かっている馬",
      "frame": 2,
      "horseNumber": 2,
      "scratched": false
    }
  ]
}
```

- `raceNumber`は必須（CHECKPOINT13の正式対象＝毎週土日各場11Rに合わせる）。
- `going`はStage A時点で未確定なら`null`（省略可）。推測で「良」等を埋めない。
  `null`のまま`racecard:check`に渡すと、Suitability V1のgoing componentが
  構造的に`evaluated=false`になる（`predictionSnapshot.ts`の
  `GOING_UNKNOWN_SENTINEL`機構をそのまま利用、無変更）。
- `horseId`は分かっていれば指定する（Runner ResolverのPriority 1）。無ければ
  `horseName`の完全一致（NFKC正規化のみ、ファジーマッチなし）でresolveを試みる。
- `sourceHorseId`（任意）: 外部Source側のID。`sourceHorseIdRegistry`に対応が
  登録されていればPriority 2でresolveされる。今回は正式Sourceが未決定のため、
  空のまま使うことがほとんど。

## CSV形式

1行=1出走馬。レース単位の列（raceId/raceDate/raceNumber/racecourse/surface/
distance/scheduledStartTime/going）は全行で同一値にすること（異なるとエラー
になる＝raceIdMismatchの取り込み時点での予防）。

```csv
raceId,raceDate,raceNumber,racecourse,surface,distance,scheduledStartTime,going,horseId,horseName,frame,horseNumber,assignedWeight,scratched
202609060911,2026-09-06,11,阪神,turf,2200,2026-09-06T15:45:00+09:00,,shakeyourheart,シェイクユアハート,1,1,58,false
202609060911,2026-09-06,11,阪神,turf,2200,2026-09-06T15:45:00+09:00,,,馬名だけ分かっている馬,2,2,,false
```

## 使い方

```bash
npm run racecard:check -- path/to/racecard.json
npm run racecard:check -- path/to/racecard.csv --board   # Ability Boardも表示
```

このCLIは読み取り専用（`data/horses/`を一切書き込まない）。出力される
Snapshotは常に「診断用（diagnostic）」であり、`gate.formal`が`true`の場合
のみ「正式（formal）」として扱ってよい。1頭でも`unresolved`/`ambiguous`/
`predictionIneligible`（placeholder/fixtureデータ・過去走不足等）があれば
`gate.formal=false`になる。
