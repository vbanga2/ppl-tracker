import { describe, it, expect } from 'vitest'
import { BLOCKS } from '../plan-prescriptions'
import { SEED_BLOCKS } from '../plan'

describe('plan conformance — every block in plan-prescriptions.ts is correctly seeded', () => {
  for (const spec of BLOCKS) {
    const key = `${spec.exerciseKey}.${spec.blockKey}`

    it(`${key}: sets, reps, load, rest match the prescription`, () => {
      const seeded = SEED_BLOCKS.find(
        b => b.exerciseKey === spec.exerciseKey && b.blockKey === spec.blockKey,
      )
      expect(seeded, `Block ${key} not found in SEED_BLOCKS`).toBeDefined()
      expect(seeded!.targetSets).toBe(spec.sets)
      expect(seeded!.reps).toEqual(spec.reps)
      expect(seeded!.load).toEqual(spec.load)
      expect(seeded!.restSeconds).toBe(spec.restSeconds)
      expect(seeded!.restLabel).toBe(spec.restLabel)
    })
  }
})

describe('plan conformance — specific assertions from task spec', () => {
  it('ohp.power is 3 × 3–6, not 3 × 5–8', () => {
    const b = SEED_BLOCKS.find(b => b.exerciseKey === 'ohp' && b.blockKey === 'power')!
    expect(b.reps).toEqual({ kind: 'range', low: 3, high: 6 })
    expect(b.targetSets).toBe(3)
  })

  it('bench.power is 3 × 3–6', () => {
    const b = SEED_BLOCKS.find(b => b.exerciseKey === 'bench' && b.blockKey === 'power')!
    expect(b.reps).toEqual({ kind: 'range', low: 3, high: 6 })
    expect(b.targetSets).toBe(3)
  })

  it('dips.power is 3 × 5–8', () => {
    const b = SEED_BLOCKS.find(b => b.exerciseKey === 'dips' && b.blockKey === 'power')!
    expect(b.reps).toEqual({ kind: 'range', low: 5, high: 8 })
    expect(b.targetSets).toBe(3)
  })

  it('ohp.hypertrophy is failure with no rep floor', () => {
    const b = SEED_BLOCKS.find(b => b.exerciseKey === 'ohp' && b.blockKey === 'hypertrophy')!
    expect(b.reps.kind).toBe('failure')
    expect('low' in b.reps).toBe(false)
  })

  it('dl.hypertrophy is minToFailure at 8', () => {
    const b = SEED_BLOCKS.find(b => b.exerciseKey === 'dl' && b.blockKey === 'hypertrophy')!
    expect(b.reps).toEqual({ kind: 'minToFailure', low: 8 })
  })

  it('incline.hypertrophy derives 0.65 from bench.power', () => {
    const b = SEED_BLOCKS.find(b => b.exerciseKey === 'incline' && b.blockKey === 'hypertrophy')!
    expect(b.load).toEqual({ kind: 'derived', fromBlock: 'bench.power', mult: 0.65 })
  })

  it('shrug.hypertrophy derives 1.0 from dl.strength', () => {
    const b = SEED_BLOCKS.find(b => b.exerciseKey === 'shrug' && b.blockKey === 'hypertrophy')!
    expect(b.load).toEqual({ kind: 'derived', fromBlock: 'dl.strength', mult: 1 })
  })
})
