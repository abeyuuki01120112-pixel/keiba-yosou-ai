/**
 * 既存ロスター（simulation/data/sapporoKinen.json）の馬名 -> 内部horseId マップを作る。
 * 実データCSVが外部ID（JRA公式IDなど）を使っていても、馬名が一致すれば
 * 既存の馬詳細画面・data/horses/<horseId>.json へ正しく接続できるようにするため。
 */
export function buildHorseIdAliasesByName(
  rosterHorses: { horseId: string; horseName: string }[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of rosterHorses) {
    map[h.horseName] = h.horseId;
  }
  return map;
}
