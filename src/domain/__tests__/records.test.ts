import { describe, it, expect } from 'vitest'
import { computePRDates, computeExercisePRHistory } from '../records'
import type { SetWithMeta } from '../records'

function makeSet(overrides: Partial<SetWithMeta> & { exerciseId: string; date: string }): SetWithMeta {
  return {
    id: crypto.randomUUID(),
    blockId: 'blk-1',
    sessionId: 'sess-1',
    weightLb: 100,
    reps: 5,
    isBodyweight: false,
    bodyweightLb: 0,
    ...overrides,
  }
}

describe('computePRDates', () => {
  it('returns empty set when only one session exists (baseline)', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
    ]
    expect(computePRDates(sets).size).toBe(0)
  })

  it('marks second session as PR when heavier', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 140, reps: 5 }),
    ]
    const prDates = computePRDates(sets)
    expect(prDates.has('2026-01-08')).toBe(true)
    expect(prDates.has('2026-01-01')).toBe(false)
  })

  it('does not mark PR when values are identical (tie)', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 135, reps: 5 }),
    ]
    expect(computePRDates(sets).size).toBe(0)
  })

  it('does not mark PR when values are lower', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 155, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 135, reps: 5 }),
    ]
    expect(computePRDates(sets).size).toBe(0)
  })

  it('marks PR via e1RM improvement (more reps at same weight)', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 135, reps: 8 }),
    ]
    const prDates = computePRDates(sets)
    expect(prDates.has('2026-01-08')).toBe(true)
  })

  it('PR from one exercise does not bleed to another', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 145, reps: 5 }),
      makeSet({ exerciseId: 'ex-squat', date: '2026-01-01', weightLb: 200, reps: 5 }),
      makeSet({ exerciseId: 'ex-squat', date: '2026-01-08', weightLb: 195, reps: 5 }),
    ]
    const prDates = computePRDates(sets)
    expect(prDates.has('2026-01-08')).toBe(true)  // bench PR
    // squat went down — still same date marked due to bench; but the date should be in there
    // both exercises share the date; date is marked only once
    expect(prDates.size).toBe(1)
  })

  it('handles bodyweight exercises correctly (folds bodyweight into effective lb)', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-pullup', date: '2026-01-01', weightLb: 0, reps: 8, isBodyweight: true, bodyweightLb: 180 }),
      makeSet({ exerciseId: 'ex-pullup', date: '2026-01-08', weightLb: 10, reps: 8, isBodyweight: true, bodyweightLb: 180 }),
    ]
    const prDates = computePRDates(sets)
    expect(prDates.has('2026-01-08')).toBe(true)
  })

  it('ignores sets with empty exerciseId gracefully', () => {
    const sets = [
      makeSet({ exerciseId: '', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: '', date: '2026-01-08', weightLb: 145, reps: 5 }),
    ]
    expect(() => computePRDates(sets)).not.toThrow()
    expect(computePRDates(sets).size).toBe(0)
  })

  it('handles multiple PR dates across time', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 140, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-15', weightLb: 145, reps: 5 }),
    ]
    const prDates = computePRDates(sets)
    expect(prDates.has('2026-01-08')).toBe(true)
    expect(prDates.has('2026-01-15')).toBe(true)
    expect(prDates.has('2026-01-01')).toBe(false)
  })
})

describe('computeExercisePRHistory', () => {
  it('returns empty map for single session', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
    ]
    expect(computeExercisePRHistory(sets).size).toBe(0)
  })

  it('returns PR record for date with new best', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 145, reps: 5 }),
    ]
    const history = computeExercisePRHistory(sets)
    expect(history.has('2026-01-08')).toBe(true)
    const pr = history.get('2026-01-08')!
    expect(pr.heaviestWeight).toBe(145)
    expect(pr.bestSetVolume).toBe(145 * 5)
  })

  it('does not return date when tied', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 135, reps: 5 }),
    ]
    expect(computeExercisePRHistory(sets).size).toBe(0)
  })

  it('tracks progressive records correctly', () => {
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 140, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-15', weightLb: 138, reps: 5 }), // no PR
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-22', weightLb: 145, reps: 5 }),
    ]
    const history = computeExercisePRHistory(sets)
    expect(history.has('2026-01-08')).toBe(true)
    expect(history.has('2026-01-15')).toBe(false)
    expect(history.has('2026-01-22')).toBe(true)
  })
})
