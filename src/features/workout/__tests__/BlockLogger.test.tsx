import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Profiler, type ProfilerOnRenderCallback } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { BlockLogger, type BlockLoggerProps } from '../BlockLogger'
import type { DbBlock, DbExercise, DbSession, DbSetLog } from '../../../data/db'

// ─── Minimal fixtures ────────────────────────────────────────────────────────

const mockBlock: DbBlock = {
  id: 'blk-bench-power',
  exerciseId: 'ex-bench',
  exerciseKey: 'bench',
  blockKey: 'power',
  orderIndex: 0,
  label: 'Power',
  targetSets: 3,
  reps: { kind: 'range', low: 3, high: 6 },
  load: { kind: 'increment', lb: 5 },
  restSeconds: 180,
  restLabel: '3 min',
  setNotes: [],
  updatedAt: 0,
  deletedAt: null,
}

const mockExercise: DbExercise = {
  id: 'ex-bench',
  day: 'push',
  orderIndex: 1,
  name: 'Flat Bench Press',
  incrementLb: 5,
  isBodyweight: false,
  mainMuscles: ['Chest'],
  synMuscles: ['Triceps'],
  stabMuscles: ['Rotator cuff'],
  formText: '',
  noteText: '',
  videoUrl: '',
  altVideoUrl: null,
  imageKey: 'bench',
  updatedAt: 0,
  deletedAt: null,
}

const mockSession: DbSession = {
  id: 'sess-1',
  date: '2026-07-26',
  day: 'push',
  startedAt: 0,
  endedAt: null,
  notes: '',
  updatedAt: 0,
  deletedAt: null,
}

const prevSet: DbSetLog = {
  id: 'set-prev-1',
  sessionId: 'sess-prev',
  blockId: 'blk-bench-power',
  setIndex: 0,
  weightLb: 135,
  reps: 5,
  rir: 2,
  loggedAt: 0,
  updatedAt: 0,
  deletedAt: null,
}

function makeProps(overrides: Partial<BlockLoggerProps> = {}): BlockLoggerProps {
  const todayByBlock = new Map<string, DbSetLog[]>()
  const prevSetsByBlock = new Map<string, DbSetLog[]>([['blk-bench-power', [prevSet]]])

  return {
    block: mockBlock,
    exercise: mockExercise,
    session: mockSession,
    allBlocks: [mockBlock],
    todayByBlock,
    prevSetsByBlock,
    inventory: [],
    onSetChanged: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BlockLogger — no render loop on typing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes weight from the suggestion', () => {
    render(<BlockLogger {...makeProps()} />)
    // Suggestion from prev session at 135 lb (not maxed) → repeat 135
    const weightInput = screen.getByRole('textbox', { name: /weight/i })
    expect(weightInput).toHaveValue('135')
  })

  it('typing 185 is not overwritten by the suggestion effect', async () => {
    render(<BlockLogger {...makeProps()} />)
    const weightInput = screen.getByRole('textbox', { name: /weight/i })

    // Simulate user selecting all and typing "185" progressively
    fireEvent.focus(weightInput)
    fireEvent.change(weightInput, { target: { value: '1' } })
    fireEvent.change(weightInput, { target: { value: '18' } })
    fireEvent.change(weightInput, { target: { value: '185' } })

    // Flush any pending effects (suggestion sync runs here — must not overwrite)
    await act(async () => {})

    expect(weightInput).toHaveValue('185')
  })

  it('waiting 5+ effect cycles after typing does not reset the value', async () => {
    render(<BlockLogger {...makeProps()} />)
    const weightInput = screen.getByRole('textbox', { name: /weight/i })

    fireEvent.focus(weightInput)
    fireEvent.change(weightInput, { target: { value: '185' } })

    // Flush multiple effect cycles
    for (let i = 0; i < 5; i++) {
      await act(async () => {})
    }

    expect(weightInput).toHaveValue('185')
  })

  it('typing five digits causes at most 15 renders total', async () => {
    let renderCount = 0
    const onRender: ProfilerOnRenderCallback = () => {
      renderCount++
    }

    render(
      <Profiler id="BlockLogger" onRender={onRender}>
        <BlockLogger {...makeProps()} />
      </Profiler>,
    )

    // Reset after initial mount renders settle
    await act(async () => {})
    renderCount = 0

    const weightInput = screen.getByRole('textbox', { name: /weight/i })
    fireEvent.change(weightInput, { target: { value: '1' } })
    fireEvent.change(weightInput, { target: { value: '18' } })
    fireEvent.change(weightInput, { target: { value: '185' } })
    fireEvent.change(weightInput, { target: { value: '1850' } })
    fireEvent.change(weightInput, { target: { value: '18500' } })

    await act(async () => {})

    // With no render loop, 5 keystrokes → at most ~10 renders (one per keystroke for Stepper+BlockLogger)
    expect(renderCount).toBeLessThan(15)
  })

  it('new suggestion data from parent does not overwrite a touched field', async () => {
    const props = makeProps()
    const { rerender } = render(<BlockLogger {...props} />)

    const weightInput = screen.getByRole('textbox', { name: /weight/i })
    fireEvent.focus(weightInput)
    fireEvent.change(weightInput, { target: { value: '185' } })

    // Parent passes updated maps (simulating refresh after another block's set logged)
    const newTodayByBlock = new Map<string, DbSetLog[]>()
    const newPrevSetsByBlock = new Map<string, DbSetLog[]>([
      ['blk-bench-power', [{ ...prevSet, weightLb: 140 }]],
    ])
    rerender(
      <BlockLogger
        {...props}
        todayByBlock={newTodayByBlock}
        prevSetsByBlock={newPrevSetsByBlock}
      />,
    )
    await act(async () => {})

    // Even though suggestion now says 140 lb, user's 185 must be preserved
    expect(weightInput).toHaveValue('185')
  })
})
