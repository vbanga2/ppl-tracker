import type { Block, SetLog } from './plan'
import type { RepSpec, LoadSpec } from './plan'
import { round } from './units'

export interface Suggestion {
  weightLb: number
  reps: number
  message: string
}

function startReps(reps: RepSpec, prevSets: SetLog[]): number {
  switch (reps.kind) {
    case 'range': return reps.low
    case 'fixed': return reps.reps
    case 'failure':
      // Pre-fill with the first set's reps from the previous session (no fabricated floor).
      return prevSets.length > 0 ? prevSets[0].reps : 1
    case 'minToFailure': return reps.low
    default: throw new Error(`Unhandled reps kind: ${(reps as RepSpec).kind}`)
  }
}

function isMaxed(reps: RepSpec, sets: SetLog[], targetSets: number): boolean {
  if (sets.length < targetSets) return false
  switch (reps.kind) {
    case 'range': return sets.every(s => s.reps >= reps.high)
    case 'fixed': return sets.every(s => s.reps >= reps.reps)
    case 'failure': return false      // never auto-bump
    case 'minToFailure': return false // never auto-bump — progress by beating rep count
    default: throw new Error(`Unhandled reps kind: ${(reps as RepSpec).kind}`)
  }
}

function getIncrement(load: LoadSpec, heavyIncrementLb: number): number {
  if (load.kind === 'increment') return load.lb
  if (load.kind === 'heavy') return heavyIncrementLb
  return 0
}

export function suggestNext(
  block: Block,
  todaySets: SetLog[],
  sourceBlockTodaySets: SetLog[] | null,
  prevSets: SetLog[],
  sourceBlockPrevSets: SetLog[] | null,
  heavyIncrementLb: number,
): Suggestion {
  const { reps, load } = block

  // Rule 1: already have sets today → repeat last set
  if (todaySets.length > 0) {
    const last = todaySets[todaySets.length - 1]
    return { weightLb: last.weightLb, reps: last.reps, message: 'Repeat last set.' }
  }

  // Rep-progression blocks (crunch burnout): +N reps each session, no load change
  if (load.kind === 'repProgression') {
    if (prevSets.length > 0) {
      const prevReps = Math.max(...prevSets.map(s => s.reps))
      const nextReps = prevReps + load.repsPerSession
      return { weightLb: 0, reps: nextReps, message: `+${load.repsPerSession} rep from last session.` }
    }
    const initReps = reps.kind === 'fixed' ? reps.reps : 1
    return { weightLb: 0, reps: initReps, message: 'First time — set a baseline.' }
  }

  // Rule 2: derived from source block logged today
  if (load.kind === 'derived' && sourceBlockTodaySets && sourceBlockTodaySets.length > 0) {
    const top = Math.max(...sourceBlockTodaySets.map(s => s.weightLb))
    const weight = round(top * load.mult, 2.5)
    return { weightLb: weight, reps: startReps(reps, prevSets), message: "Derived from today's top set." }
  }

  // Rule 3: previous session data exists
  if (prevSets.length > 0) {
    const top = Math.max(...prevSets.map(s => s.weightLb))

    if (load.kind === 'bodyweight') {
      const minReps = Math.min(...prevSets.map(s => s.reps))
      const maxReps = Math.max(...prevSets.map(s => s.reps))
      return {
        weightLb: 0,
        reps: startReps(reps, prevSets),
        message: `Last session: ${minReps}–${maxReps} reps. Beat it.`,
      }
    }

    const increment = getIncrement(load, heavyIncrementLb)

    if (isMaxed(reps, prevSets, block.targetSets)) {
      const next = top + increment
      let targetStr = ''
      if (reps.kind === 'range') targetStr = String(reps.high)
      else if (reps.kind === 'fixed') targetStr = String(reps.reps)
      return {
        weightLb: next,
        reps: startReps(reps, []),
        message: `You cleared ${targetStr} on every set — up ${increment} lb, restart at ${startReps(reps, [])} reps.`,
      }
    }

    const minReps = Math.min(...prevSets.map(s => s.reps))
    const maxReps = Math.max(...prevSets.map(s => s.reps))
    return {
      weightLb: top,
      reps: startReps(reps, prevSets),
      message: `Last session: ${top} lb × ${minReps}–${maxReps} reps. Beat it.`,
    }
  }

  // Rule 4: derived from source block logged in a previous session
  if (load.kind === 'derived' && sourceBlockPrevSets && sourceBlockPrevSets.length > 0) {
    const top = Math.max(...sourceBlockPrevSets.map(s => s.weightLb))
    const weight = round(top * load.mult, 2.5)
    return { weightLb: weight, reps: startReps(reps, []), message: 'Derived from previous session.' }
  }

  // Rule 5: no history
  return { weightLb: 0, reps: startReps(reps, []), message: 'First time — set a baseline.' }
}

export function nextSprintSets(lastPullSprintSets: number | null): number {
  if (lastPullSprintSets === null) return 4
  return Math.min(lastPullSprintSets + 1, 10)
}
