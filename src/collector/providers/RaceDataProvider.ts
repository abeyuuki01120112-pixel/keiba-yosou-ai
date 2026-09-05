import type { RawRaceBundle } from "../types";

/**
 * Source Adapter方式（STEP2）。将来どのレース種別・どの取得手段でも
 * `collectRace()`側のロジックを変更せずにProviderだけ差し替えられるようにする
 * 最小限のインターフェース。V0時点の実装は`ManualRawFileProvider`のみ（V0では
 * 過剰設計を避けるため、Provider登録レジストリ等は作らない）。
 */
export interface RaceDataProvider {
  readonly id: string;
  readonly version: string;
  /** 対象raceIdの生データが取得できない場合はnull（推測で埋めない）。 */
  fetchRace(raceId: string): Promise<RawRaceBundle | null>;
}
