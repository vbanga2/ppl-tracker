import type { SetLog } from './plan'

export function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export function effectiveLoad(
  weightLb: number,
  isBodyweight: boolean,
  bodyweightLb: number,
): number {
  return isBodyweight ? bodyweightLb + weightLb : weightLb
}

export function volumeLoad(sets: SetLog[]): number {
  return sets.reduce((sum, s) => sum + s.weightLb * s.reps, 0)
}

export function topSetWeight(sets: SetLog[]): number {
  return sets.reduce((max, s) => Math.max(max, s.weightLb), 0)
}

// Bodyweight-aware helpers for charts — fold bodyweight into effective load

export function sessionE1RM(
  sets: SetLog[],
  isBodyweight: boolean,
  bodyweightLb: number,
): number {
  if (sets.length === 0) return 0
  return sets.reduce((max, s) => {
    const eff = effectiveLoad(s.weightLb, isBodyweight, bodyweightLb)
    return Math.max(max, epley1RM(eff, s.reps))
  }, 0)
}

export function sessionVolume(
  sets: SetLog[],
  isBodyweight: boolean,
  bodyweightLb: number,
): number {
  return sets.reduce((sum, s) => {
    const eff = effectiveLoad(s.weightLb, isBodyweight, bodyweightLb)
    return sum + eff * s.reps
  }, 0)
}
