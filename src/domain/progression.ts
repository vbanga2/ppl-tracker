import type { Block, SetLog } from './plan'
import { round } from './units'

export interface Suggestion {
  weightLb: number
  reps: number
  message: string
}

export function suggestNext(
  block: Block,
  todaySets: SetLog[],
  sourceBlockTodaySets: SetLog[] | null,
  prevSets: SetLog[],
  sourceBlockPrevSets: SetLog[] | null,
  incrementLb = 5,
): Suggestion {
  // Rule 1: already have sets today → repeat last set
  if (todaySets.length > 0) {
    const last = todaySets[todaySets.length - 1]
    return { weightLb: last.weightLb, reps: last.reps, message: 'Repeat last set.' }
  }

  // Rule 2: deriveFrom logged today
  if (block.deriveFromBlockId && sourceBlockTodaySets && sourceBlockTodaySets.length > 0) {
    const top = Math.max(...sourceBlockTodaySets.map(s => s.weightLb))
    const weight = round(top * (block.deriveMultiplier ?? 1), 2.5)
    return { weightLb: weight, reps: block.repLow, message: 'Derived from today\'s top set.' }
  }

  // Rule 3: previous session data exists
  if (prevSets.length > 0) {
    const top = Math.max(...prevSets.map(s => s.weightLb))

    if (block.repHigh !== null) {
      const allMaxed = prevSets.every(s => s.reps >= block.repHigh!)
      const metTarget = prevSets.length >= block.targetSets
      if (allMaxed && metTarget) {
        const next = top + incrementLb
        return {
          weightLb: next,
          reps: block.repLow,
          message: `You cleared ${block.repHigh} on every set — up ${incrementLb} lb, restart at ${block.repLow} reps.`,
        }
      }
    }
    // Hold load
    return {
      weightLb: top,
      reps: block.repLow,
      message: `Last session: ${top} lb × ${Math.min(...prevSets.map(s => s.reps))}–${Math.max(...prevSets.map(s => s.reps))} reps. Beat it.`,
    }
  }

  // Rule 4: deriveFrom logged in a previous session
  if (block.deriveFromBlockId && sourceBlockPrevSets && sourceBlockPrevSets.length > 0) {
    const top = Math.max(...sourceBlockPrevSets.map(s => s.weightLb))
    const weight = round(top * (block.deriveMultiplier ?? 1), 2.5)
    return { weightLb: weight, reps: block.repLow, message: 'Derived from previous session.' }
  }

  // Rule 5: no history
  return { weightLb: 0, reps: block.repLow, message: 'First time — set a baseline.' }
}

export function nextSprintSets(lastPullSprintSets: number | null): number {
  if (lastPullSprintSets === null) return 4
  return Math.min(lastPullSprintSets + 1, 10)
}
