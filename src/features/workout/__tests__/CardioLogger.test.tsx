import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CardioLogger } from '../CardioLogger'
import type { DbCardioLog, DbSession } from '../../../data/db'

// Mock all repo functions that CardioLogger touches
vi.mock('../../../data/repo', () => ({
  getCardioForSession: vi.fn(),
  getLastPullSprintSets: vi.fn(),
  logCardio: vi.fn().mockResolvedValue(undefined),
  deleteCardio: vi.fn().mockResolvedValue(undefined),
}))

// Import mocked functions for per-test setup
import {
  getCardioForSession,
  getLastPullSprintSets,
  logCardio,
  deleteCardio,
} from '../../../data/repo'

const pullSession: DbSession = {
  id: 'sess-pull',
  date: '2026-07-26',
  day: 'pull',
  startedAt: 0,
  endedAt: null,
  notes: '',
  updatedAt: 0,
  deletedAt: null,
}

const pushSession: DbSession = {
  id: 'sess-push',
  date: '2026-07-26',
  day: 'push',
  startedAt: 0,
  endedAt: null,
  notes: '',
  updatedAt: 0,
  deletedAt: null,
}

const existingSprintLog: DbCardioLog = {
  id: 'clog-1',
  sessionId: 'sess-pull',
  kind: 'sprints',
  sets: 6,
  minutes: 25,
  distanceMi: 0,
  routeId: null,
  updatedAt: 0,
  deletedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Loading existing log ────────────────────────────────────────────────────

describe('CardioLogger — existing log on mount', () => {
  it('shows logged state when session already has cardio', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([existingSprintLog])

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    expect(screen.getByText(/cardio logged/i)).toBeInTheDocument()
    expect(screen.getByText('6 sprint sets · 25 min')).toBeInTheDocument()
  })

  it('shows the ✕ undo button in the logged state', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([existingSprintLog])

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    expect(screen.getByRole('button', { name: /undo cardio log/i })).toBeInTheDocument()
  })
})

// ─── Undo ─────────────────────────────────────────────────────────────────────

describe('CardioLogger — undo', () => {
  it('undo calls deleteCardio with the correct ID', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([existingSprintLog])
    vi.mocked(getLastPullSprintSets).mockResolvedValue(null)

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /undo cardio log/i }))
    await act(async () => {})

    expect(vi.mocked(deleteCardio)).toHaveBeenCalledWith('clog-1')
  })

  it('undo returns the card to the log form', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([existingSprintLog])
    vi.mocked(getLastPullSprintSets).mockResolvedValue(null)

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /undo cardio log/i }))
    await act(async () => {})

    // Back to the form — "Log Cardio" button should be visible
    expect(screen.getByText('Log Cardio')).toBeInTheDocument()
  })

  it('logging then immediately undoing removes the entry', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([])
    vi.mocked(getLastPullSprintSets).mockResolvedValue(5)

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    // Log cardio
    fireEvent.click(screen.getByText('Log Cardio'))
    await act(async () => {})

    expect(screen.getByText(/cardio logged/i)).toBeInTheDocument()
    expect(vi.mocked(logCardio)).toHaveBeenCalledTimes(1)

    // Undo
    fireEvent.click(screen.getByRole('button', { name: /undo cardio log/i }))
    await act(async () => {})

    expect(vi.mocked(deleteCardio)).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Log Cardio')).toBeInTheDocument()
  })
})

// ─── Sprint suggestion after undo ─────────────────────────────────────────────

describe('CardioLogger — sprint suggestion correctness after undo', () => {
  it('suggestion reflects last REAL session after undoing, not the undone one', async () => {
    // Scenario: last real session = 4 sets; today session already has 5 sets logged (about to undo)
    const loggedFiveSets: DbCardioLog = {
      ...existingSprintLog,
      id: 'clog-today',
      sets: 5,
      minutes: 0,
    }
    vi.mocked(getCardioForSession).mockResolvedValue([loggedFiveSets])
    // After undo, getLastPullSprintSets returns 4 (the soft-deleted 5-set entry is excluded)
    vi.mocked(getLastPullSprintSets).mockResolvedValue(4)

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    // Verify we're in logged state
    expect(screen.getByText(/cardio logged/i)).toBeInTheDocument()

    // Undo
    fireEvent.click(screen.getByRole('button', { name: /undo cardio log/i }))
    await act(async () => {})

    // Suggestion should be nextSprintSets(4) = 5, NOT nextSprintSets(5) = 6
    const setsInput = screen.getByRole('textbox', { name: /sets/i })
    expect(setsInput).toHaveValue('5')
  })

  it('getLastPullSprintSets is called again after undo to re-derive suggestion', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([existingSprintLog])
    vi.mocked(getLastPullSprintSets).mockResolvedValue(3)

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    const callsBefore = vi.mocked(getLastPullSprintSets).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: /undo cardio log/i }))
    await act(async () => {})

    const callsAfter = vi.mocked(getLastPullSprintSets).mock.calls.length
    expect(callsAfter).toBeGreaterThan(callsBefore)
  })

  it('push session form is shown (no sprint logic for push)', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([])

    render(<CardioLogger session={pushSession} />)
    await act(async () => {})

    expect(screen.getByText('Cardio (optional)')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /sets/i })).not.toBeInTheDocument()
  })
})
