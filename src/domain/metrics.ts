import type { SetLog } from './plan'

export function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export function effectiveLoad(
  weightLb: number,
  isBodyweight: boolean,
  bodweightLb: number,
): number {
  return isBodyweight ? bodweightLb + weightLb : weightLb
}

export function volumeLoad(sets: SetLog[]): number {
  return sets.reduce((sum, s) => sum + s.weightLb * s.reps, 0)
}

export function topSetWeight(sets: SetLog[]): number {
  return sets.reduce((max, s) => Math.max(max, s.weightLb), 0)
}
