import { epley1RM } from './metrics'

export interface SetWithMeta {
  id: string
  blockId: string
  exerciseId: string
  date: string
  sessionId: string
  weightLb: number
  reps: number
  isBodyweight: boolean
  bodyweightLb: number
}

export interface ExercisePR {
  bestE1RM: number
  bestSetVolume: number
  heaviestWeight: number
  bestSessionVolume: number
}

function effectiveLb(s: { weightLb: number; isBodyweight: boolean; bodyweightLb: number }): number {
  return s.isBodyweight ? s.bodyweightLb + s.weightLb : s.weightLb
}

/**
 * Returns set of dates on which at least one exercise set a new personal record.
 * First session per exercise is the baseline — never a PR.
 * Ties do not count.
 */
export function computePRDates(sets: SetWithMeta[]): Set<string> {
  const byExercise = new Map<string, SetWithMeta[]>()
  for (const s of sets) {
    if (!s.exerciseId) continue
    const arr = byExercise.get(s.exerciseId) ?? []
    arr.push(s)
    byExercise.set(s.exerciseId, arr)
  }

  const prDates = new Set<string>()

  for (const exerciseSets of byExercise.values()) {
    const byDate = new Map<string, SetWithMeta[]>()
    for (const s of exerciseSets) {
      const arr = byDate.get(s.date) ?? []
      arr.push(s)
      byDate.set(s.date, arr)
    }

    const sortedDates = [...byDate.keys()].sort()
    if (sortedDates.length <= 1) continue

    let prevE1RM = 0
    let prevSetVol = 0
    let prevWeight = 0
    let prevSessionVol = 0

    for (const s of byDate.get(sortedDates[0])!) {
      const eff = effectiveLb(s)
      prevE1RM = Math.max(prevE1RM, epley1RM(eff, s.reps))
      prevSetVol = Math.max(prevSetVol, eff * s.reps)
      prevWeight = Math.max(prevWeight, eff)
      prevSessionVol += eff * s.reps
    }

    for (let i = 1; i < sortedDates.length; i++) {
      const date = sortedDates[i]
      const daySets = byDate.get(date)!

      let dayE1RM = 0
      let daySetVol = 0
      let dayWeight = 0
      let daySessionVol = 0

      for (const s of daySets) {
        const eff = effectiveLb(s)
        dayE1RM = Math.max(dayE1RM, epley1RM(eff, s.reps))
        daySetVol = Math.max(daySetVol, eff * s.reps)
        dayWeight = Math.max(dayWeight, eff)
        daySessionVol += eff * s.reps
      }

      if (
        dayE1RM > prevE1RM ||
        daySetVol > prevSetVol ||
        dayWeight > prevWeight ||
        daySessionVol > prevSessionVol
      ) {
        prDates.add(date)
      }

      prevE1RM = Math.max(prevE1RM, dayE1RM)
      prevSetVol = Math.max(prevSetVol, daySetVol)
      prevWeight = Math.max(prevWeight, dayWeight)
      prevSessionVol = Math.max(prevSessionVol, daySessionVol)
    }
  }

  return prDates
}

/**
 * Computes PR history for sets belonging to a single exercise.
 * Returns a map of date → PR metrics for dates that set a new record.
 * First session is baseline and never appears in the result.
 */
export function computeExercisePRHistory(sets: SetWithMeta[]): Map<string, ExercisePR> {
  const byDate = new Map<string, SetWithMeta[]>()
  for (const s of sets) {
    const arr = byDate.get(s.date) ?? []
    arr.push(s)
    byDate.set(s.date, arr)
  }

  const sortedDates = [...byDate.keys()].sort()
  const prHistory = new Map<string, ExercisePR>()

  if (sortedDates.length <= 1) return prHistory

  let prevE1RM = 0
  let prevSetVol = 0
  let prevWeight = 0
  let prevSessionVol = 0

  for (const s of byDate.get(sortedDates[0])!) {
    const eff = effectiveLb(s)
    prevE1RM = Math.max(prevE1RM, epley1RM(eff, s.reps))
    prevSetVol = Math.max(prevSetVol, eff * s.reps)
    prevWeight = Math.max(prevWeight, eff)
    prevSessionVol += eff * s.reps
  }

  for (let i = 1; i < sortedDates.length; i++) {
    const date = sortedDates[i]
    const daySets = byDate.get(date)!

    let dayE1RM = 0
    let daySetVol = 0
    let dayWeight = 0
    let daySessionVol = 0

    for (const s of daySets) {
      const eff = effectiveLb(s)
      dayE1RM = Math.max(dayE1RM, epley1RM(eff, s.reps))
      daySetVol = Math.max(daySetVol, eff * s.reps)
      dayWeight = Math.max(dayWeight, eff)
      daySessionVol += eff * s.reps
    }

    if (
      dayE1RM > prevE1RM ||
      daySetVol > prevSetVol ||
      dayWeight > prevWeight ||
      daySessionVol > prevSessionVol
    ) {
      prHistory.set(date, {
        bestE1RM: dayE1RM,
        bestSetVolume: daySetVol,
        heaviestWeight: dayWeight,
        bestSessionVolume: daySessionVol,
      })
    }

    prevE1RM = Math.max(prevE1RM, dayE1RM)
    prevSetVol = Math.max(prevSetVol, daySetVol)
    prevWeight = Math.max(prevWeight, dayWeight)
    prevSessionVol = Math.max(prevSessionVol, daySessionVol)
  }

  return prHistory
}
