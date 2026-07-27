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

describe('retroactive editing — PR demotion', () => {
  it('adding a heavier backdated set to the baseline date demotes all later PRs', () => {
    // Baseline: Jan 1 @ 135×5 (e1RM ≈ 157.5)
    // Session 2: Jan 8 @ 140×5 (e1RM ≈ 163.3) → PR
    // Session 3: Jan 15 @ 145×5 (e1RM ≈ 169.2) → PR
    // Retroactive add: Jan 1 @ 165×5 (e1RM ≈ 192.5) — now the baseline is heavier than both later sessions
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 165, reps: 5 }), // backdated heavy set
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 140, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-15', weightLb: 145, reps: 5 }),
    ]
    const prDates = computePRDates(sets)
    // Both later sessions are below the baseline — no PRs
    expect(prDates.has('2026-01-08')).toBe(false)
    expect(prDates.has('2026-01-15')).toBe(false)
    expect(prDates.size).toBe(0)
  })

  it('inserting a mid-history set heavier than everything after demotes all subsequent PRs', () => {
    // Baseline: Jan 1 @ 135×5
    // Session 2: Jan 15 @ 140×5 → PR
    // Retro insert: Jan 8 @ 175×5 (heavier than Jan 15)
    // After: Jan 8 is now a PR, Jan 15 is not (140 < 175 that was set on Jan 8)
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 175, reps: 5 }), // retro insert
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-15', weightLb: 140, reps: 5 }),
    ]
    const prDates = computePRDates(sets)
    expect(prDates.has('2026-01-08')).toBe(true)   // new retroactive PR
    expect(prDates.has('2026-01-15')).toBe(false)  // demoted — 140 < 175
    expect(prDates.size).toBe(1)
  })

  it('removing the set that caused a PR shifts the PR to the next better date', () => {
    // History: Jan 1 (baseline 135), Jan 8 (140 → PR), Jan 15 (145 → PR)
    // Simulate deleting Jan 8 set by excluding it
    const sets = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      // Jan 8 set intentionally omitted (soft-deleted)
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-15', weightLb: 145, reps: 5 }),
    ]
    const prDates = computePRDates(sets)
    // Jan 15 is still a PR against the baseline
    expect(prDates.has('2026-01-08')).toBe(false)
    expect(prDates.has('2026-01-15')).toBe(true)
  })

  it('PR history recomputes from scratch — no stale data from prior run', () => {
    // Without backdate: Jan 8 and Jan 15 are both PRs
    const beforeBackdate = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 140, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-15', weightLb: 145, reps: 5 }),
    ]
    expect(computePRDates(beforeBackdate).size).toBe(2)

    // After backdate: Jan 1 gains a 175lb set — should wipe out both later PRs
    const afterBackdate = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 175, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 140, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-15', weightLb: 145, reps: 5 }),
    ]
    // Each call is independent — no shared state
    expect(computePRDates(afterBackdate).size).toBe(0)
    // And the first call is unaffected
    expect(computePRDates(beforeBackdate).size).toBe(2)
  })

  it('backdating updates exercisePRHistory for the chart correctly', () => {
    // Simulates: chart shows PR dots at Jan 8 and Jan 15
    const before = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 140, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-15', weightLb: 145, reps: 5 }),
    ]
    const historyBefore = computeExercisePRHistory(before)
    expect(historyBefore.has('2026-01-08')).toBe(true)
    expect(historyBefore.has('2026-01-15')).toBe(true)

    // User adds a 165lb set backdated to Jan 1 — heavier than both later sessions
    const after = [
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 135, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-01', weightLb: 165, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-08', weightLb: 140, reps: 5 }),
      makeSet({ exerciseId: 'ex-bench', date: '2026-01-15', weightLb: 145, reps: 5 }),
    ]
    const historyAfter = computeExercisePRHistory(after)
    // Chart should show zero PR dots — both are demoted
    expect(historyAfter.size).toBe(0)
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
