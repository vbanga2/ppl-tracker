export interface PlateInventory {
  lb: number
  pairs: number
}

export interface PlateCount {
  lb: number
  count: number
}

export const DEFAULT_PLATES: PlateInventory[] = [
  { lb: 45, pairs: 2 },
  { lb: 35, pairs: 1 },
  { lb: 25, pairs: 2 },
  { lb: 10, pairs: 2 },
  { lb: 5, pairs: 2 },
  { lb: 2.5, pairs: 2 },
]

export const BAR_LB = 45

export function calculatePlates(
  targetLb: number,
  inventory: PlateInventory[] = DEFAULT_PLATES,
  barLb: number = BAR_LB,
): { perSide: PlateCount[]; achievable: boolean; nearestBelow: number } {
  if (targetLb <= barLb) {
    return { perSide: [], achievable: Math.abs(targetLb - barLb) < 0.01, nearestBelow: barLb }
  }

  const half = (targetLb - barLb) / 2
  const sorted = [...inventory].sort((a, b) => b.lb - a.lb)

  let remaining = Math.round(half * 100) / 100
  const perSide: PlateCount[] = []

  for (const plate of sorted) {
    if (remaining < plate.lb - 0.01) continue
    const count = Math.min(plate.pairs, Math.floor((remaining + 0.01) / plate.lb))
    if (count > 0) {
      perSide.push({ lb: plate.lb, count })
      remaining = Math.round((remaining - count * plate.lb) * 100) / 100
    }
  }

  const loaded = barLb + 2 * perSide.reduce((s, p) => s + p.lb * p.count, 0)
  const achievable = Math.abs(loaded - targetLb) < 0.01
  return { perSide, achievable, nearestBelow: loaded }
}

export function formatPlates(perSide: PlateCount[]): string {
  if (perSide.length === 0) return 'bar only'
  return perSide.map(p => (p.count > 1 ? `${p.count}×${p.lb}` : `${p.lb}`)).join(' + ')
}
