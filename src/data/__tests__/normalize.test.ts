import { describe, it, expect } from 'vitest'
import { normalizeBlock } from '../repo'
import { formatRepSpec } from '../../domain/plan'
import type { DbBlock } from '../db'

function makeLegacyBlock(overrides: Record<string, unknown>): DbBlock {
  return {
    id: 'blk-test',
    exerciseId: 'ex-bench',
    exerciseKey: undefined as unknown as string,
    blockKey: undefined as unknown as string,
    orderIndex: 0,
    label: 'Power',
    targetSets: 3,
    reps: undefined as unknown as DbBlock['reps'],
    load: undefined as unknown as DbBlock['load'],
    restSeconds: 180,
    restLabel: undefined as unknown as string,
    setNotes: undefined as unknown as string[],
    updatedAt: 0,
    deletedAt: null,
    ...overrides,
  }
}

describe('normalizeBlock', () => {
  it('fast-paths a fully migrated block unchanged', () => {
    const block = makeLegacyBlock({
      exerciseKey: 'bench',
      blockKey: 'power',
      reps: { kind: 'range', low: 3, high: 6 },
      load: { kind: 'increment', lb: 5 },
      restLabel: '3 min',
      setNotes: [],
    })
    expect(normalizeBlock(block)).toBe(block)
  })

  it('converts repLow/repHigh range to RepSpec', () => {
    const block = makeLegacyBlock({ repLow: 5, repHigh: 8 })
    const result = normalizeBlock(block)
    expect(result.reps).toEqual({ kind: 'range', low: 5, high: 8 })
    expect(result.load).toEqual({ kind: 'increment', lb: 5 })
    expect(() => formatRepSpec(result.reps)).not.toThrow()
    expect(formatRepSpec(result.reps)).toBe('5 - 8')
  })

  it('converts repHigh: null to failure RepSpec', () => {
    const block = makeLegacyBlock({ repLow: 1, repHigh: null })
    const result = normalizeBlock(block)
    expect(result.reps).toEqual({ kind: 'failure' })
    expect(formatRepSpec(result.reps)).toBe('F')
  })

  it('derives exerciseKey from exerciseId when missing', () => {
    const block = makeLegacyBlock({ repLow: 5, repHigh: 8 })
    const result = normalizeBlock(block)
    expect(result.exerciseKey).toBe('bench')
  })

  it('defaults blockKey to "main" when missing', () => {
    const block = makeLegacyBlock({ repLow: 5, repHigh: 8 })
    const result = normalizeBlock(block)
    expect(result.blockKey).toBe('main')
  })

  it('computes restLabel from restSeconds when missing', () => {
    const b180 = makeLegacyBlock({ repLow: 5, repHigh: 8, restSeconds: 180 })
    expect(normalizeBlock(b180).restLabel).toBe('3 min')

    const b90 = makeLegacyBlock({ repLow: 5, repHigh: 8, restSeconds: 90 })
    expect(normalizeBlock(b90).restLabel).toBe('1 m 30 s')

    const b60 = makeLegacyBlock({ repLow: 5, repHigh: 8, restSeconds: 60 })
    expect(normalizeBlock(b60).restLabel).toBe('1 min')

    const b30 = makeLegacyBlock({ repLow: 5, repHigh: 8, restSeconds: 30 })
    expect(normalizeBlock(b30).restLabel).toBe('30 s')
  })

  it('defaults setNotes to [] when missing', () => {
    const block = makeLegacyBlock({ repLow: 5, repHigh: 8 })
    expect(normalizeBlock(block).setNotes).toEqual([])
  })
})
