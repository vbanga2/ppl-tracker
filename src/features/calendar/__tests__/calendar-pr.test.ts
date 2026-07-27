import { describe, it, expect } from 'vitest'
import { computePRDates } from '../../../domain/records'
import type { SetWithMeta } from '../../../domain/records'

// Verifies the full pipeline from exercise sets → PR date detection → calendar cell keying.
// The existing records.ts tests verify the domain function in isolation.
// These tests additionally verify:
//   1. The date key format (YYYY-MM-DD) is consistent end-to-end.
//   2. The bodyweightLb=0 bug (CalendarView regression) is covered.

const BASE_SET: Omit<SetWithMeta, 'id' | 'date' | 'sessionId' | 'weightLb' | 'reps'> = {
  blockId: 'b1',
  exerciseId: 'ex1',
  isBodyweight: false,
  bodyweightLb: 0,
}

describe('calendar PR star — date keying', () => {
  it('prDates key format matches YYYY-MM-DD used by calendar cells', () => {
    const sets: SetWithMeta[] = [
      { ...BASE_SET, id: 'sl1', date: '2026-01-01', sessionId: 's1', weightLb: 185, reps: 5 },
      { ...BASE_SET, id: 'sl2', date: '2026-01-08', sessionId: 's2', weightLb: 190, reps: 5 },
    ]
    const prDates = computePRDates(sets)

    // Calendar cells are keyed as `${year}-${mm}-${dd}` (zero-padded)
    const cellKey = '2026-01-08'
    expect(prDates.has(cellKey)).toBe(true)
    expect(prDates.has('2026-01-01')).toBe(false) // first session is baseline
  })

  it('first session is never a PR regardless of weight', () => {
    const sets: SetWithMeta[] = [
      { ...BASE_SET, id: 'sl1', date: '2026-03-01', sessionId: 's1', weightLb: 315, reps: 5 },
    ]
    const prDates = computePRDates(sets)
    expect(prDates.size).toBe(0)
  })
})

describe('calendar PR star — bodyweight exercise regression', () => {
  it('bodyweightLb=0 suppresses PR detection for bodyweight exercises (the bug)', () => {
    // When CalendarView passed bodyweightLb=0, pull-up reps increasing was invisible.
    const sets: SetWithMeta[] = [
      { ...BASE_SET, id: 'sl1', date: '2026-01-01', sessionId: 's1',
        weightLb: 0, reps: 8, isBodyweight: true, bodyweightLb: 0 },
      { ...BASE_SET, id: 'sl2', date: '2026-01-08', sessionId: 's2',
        weightLb: 0, reps: 10, isBodyweight: true, bodyweightLb: 0 },
    ]
    const prDates = computePRDates(sets)
    expect(prDates.has('2026-01-08')).toBe(false) // bug: no PR detected with bw=0
  })

  it('bodyweightLb from body metrics enables PR detection for bodyweight exercises (the fix)', () => {
    // CalendarView now passes actual bodyweight from metrics for bodyweight exercises.
    const sets: SetWithMeta[] = [
      { ...BASE_SET, id: 'sl1', date: '2026-01-01', sessionId: 's1',
        weightLb: 0, reps: 8, isBodyweight: true, bodyweightLb: 185 },
      { ...BASE_SET, id: 'sl2', date: '2026-01-08', sessionId: 's2',
        weightLb: 0, reps: 10, isBodyweight: true, bodyweightLb: 185 },
    ]
    const prDates = computePRDates(sets)
    expect(prDates.has('2026-01-08')).toBe(true) // fix: PR detected
  })

  it('barbell PRs are unaffected by bodyweightLb (non-bodyweight exercises)', () => {
    const sets: SetWithMeta[] = [
      { ...BASE_SET, id: 'sl1', date: '2026-01-01', sessionId: 's1', weightLb: 185, reps: 5 },
      { ...BASE_SET, id: 'sl2', date: '2026-01-08', sessionId: 's2', weightLb: 195, reps: 5 },
    ]
    const prDates = computePRDates(sets)
    expect(prDates.has('2026-01-08')).toBe(true)
  })
})
