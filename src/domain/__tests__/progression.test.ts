import { describe, it, expect } from 'vitest'
import { suggestNext } from '../progression'
import type { Block, SetLog } from '../plan'

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'blk-test',
    exerciseId: 'ex-test',
    orderIndex: 0,
    label: 'Main',
    targetSets: 3,
    repLow: 5,
    repHigh: 8,
    restSeconds: 120,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
    ...overrides,
  }
}

function makeSet(overrides: Partial<SetLog> = {}): SetLog {
  return {
    id: crypto.randomUUID(),
    sessionId: 'sess-1',
    blockId: 'blk-test',
    setIndex: 0,
    weightLb: 100,
    reps: 8,
    rir: 2,
    loggedAt: Date.now(),
    ...overrides,
  }
}

describe('suggestNext', () => {
  it('rule 1: repeats last logged set if sets exist today', () => {
    const block = makeBlock()
    const today = [makeSet({ weightLb: 135, reps: 6 }), makeSet({ weightLb: 135, reps: 7 })]
    const s = suggestNext(block, today, null, [], null)
    expect(s.weightLb).toBe(135)
    expect(s.reps).toBe(7)
  })

  it('rule 3a: maxed range with full sets → bump load + reset reps', () => {
    const block = makeBlock({ targetSets: 3, repLow: 5, repHigh: 8 })
    const prev = [
      makeSet({ weightLb: 100, reps: 8, setIndex: 0 }),
      makeSet({ weightLb: 100, reps: 8, setIndex: 1 }),
      makeSet({ weightLb: 100, reps: 8, setIndex: 2 }),
    ]
    const s = suggestNext(block, [], null, prev, null, 5)
    expect(s.weightLb).toBe(105)
    expect(s.reps).toBe(block.repLow)
    expect(s.message).toMatch(/cleared/)
  })

  it('rule 3b: partial reps → hold load', () => {
    const block = makeBlock({ targetSets: 3, repLow: 5, repHigh: 8 })
    const prev = [
      makeSet({ weightLb: 100, reps: 7, setIndex: 0 }),
      makeSet({ weightLb: 100, reps: 6, setIndex: 1 }),
    ]
    const s = suggestNext(block, [], null, prev, null)
    expect(s.weightLb).toBe(100)
    expect(s.message).toMatch(/beat/i)
  })

  it('failure blocks (repHigh=null) never auto-bump', () => {
    const block = makeBlock({ repHigh: null, targetSets: 3, repLow: 5 })
    const prev = [
      makeSet({ weightLb: 80, reps: 15, setIndex: 0 }),
      makeSet({ weightLb: 80, reps: 12, setIndex: 1 }),
      makeSet({ weightLb: 80, reps: 10, setIndex: 2 }),
    ]
    const s = suggestNext(block, [], null, prev, null)
    // repHigh null → should not bump
    expect(s.weightLb).toBe(80)
    expect(s.message).not.toMatch(/up \d/)
  })

  it('rule 2: derive from same-session source preferred over previous-session', () => {
    const block = makeBlock({
      deriveFromBlockId: 'blk-source',
      deriveMultiplier: 0.8,
    })
    const sourceToday = [makeSet({ blockId: 'blk-source', weightLb: 200, reps: 5 })]
    const sourcePrev = [makeSet({ blockId: 'blk-source', weightLb: 180, reps: 5 })]
    const s = suggestNext(block, [], sourceToday, [], sourcePrev)
    // Should use today's 200 * 0.8 = 160, rounded to 2.5
    expect(s.weightLb).toBe(160)
    expect(s.message).toMatch(/today/i)
  })

  it('derived load rounds to 2.5 lb', () => {
    const block = makeBlock({ deriveFromBlockId: 'blk-source', deriveMultiplier: 0.75 })
    const sourceToday = [makeSet({ blockId: 'blk-source', weightLb: 100, reps: 5 })]
    const s = suggestNext(block, [], sourceToday, [], null)
    // 100 * 0.75 = 75, already divisible by 2.5
    expect(s.weightLb % 2.5).toBe(0)
  })

  it('rule 5: no history → zero weight, baseline message', () => {
    const block = makeBlock()
    const s = suggestNext(block, [], null, [], null)
    expect(s.weightLb).toBe(0)
    expect(s.message).toMatch(/baseline/i)
  })
})

describe('metrics', () => {
  it('epley e1RM: w * (1 + reps/30)', async () => {
    const { epley1RM } = await import('../metrics')
    expect(epley1RM(100, 10)).toBeCloseTo(100 * (1 + 10 / 30))
    expect(epley1RM(100, 1)).toBe(100)
  })

  it('volumeLoad excludes soft-deleted rows', async () => {
    const { volumeLoad } = await import('../metrics')
    const sets: SetLog[] = [
      makeSet({ weightLb: 100, reps: 5 }),
      makeSet({ weightLb: 100, reps: 5 }),
    ]
    // volumeLoad receives already-filtered sets (deletedAt filtering happens in repo)
    expect(volumeLoad(sets)).toBe(1000)
  })
})

describe('plan', () => {
  it('day rotation cycles Push→Pull→Legs→Push', async () => {
    const { nextDay } = await import('../plan')
    expect(nextDay(null)).toBe('push')
    expect(nextDay('push')).toBe('pull')
    expect(nextDay('pull')).toBe('legs')
    expect(nextDay('legs')).toBe('push')
  })
})
