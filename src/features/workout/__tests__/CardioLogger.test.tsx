import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CardioLogger } from '../CardioLogger'
import type { DbCardioLog, DbSession } from '../../../data/db'

vi.mock('../../../data/repo', () => ({
  getCardioForSession: vi.fn(),
  getLastPullSprintSets: vi.fn(),
  logCardio: vi.fn().mockResolvedValue(undefined),
  deleteCardio: vi.fn().mockResolvedValue(undefined),
}))

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

const sprintLog: DbCardioLog = {
  id: 'clog-1',
  sessionId: 'sess-pull',
  kind: 'sprints',
  activityType: 'sprints',
  sets: 6,
  minutes: 25,
  distanceMi: 0,
  caloriesBurned: null,
  notes: null,
  routeId: null,
  updatedAt: 0,
  deletedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Collapsed by default ────────────────────────────────────────────────────

describe('CardioLogger — collapsed by default', () => {
  it('starts collapsed', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([])
    vi.mocked(getLastPullSprintSets).mockResolvedValue(null)

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    const toggle = screen.getByRole('button', { name: /toggle cardio section/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows summary when collapsed with a logged entry', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([sprintLog])
    vi.mocked(getLastPullSprintSets).mockResolvedValue(null)

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    // Summary visible in collapsed state
    expect(screen.getByText(/6 sprint sets/i)).toBeInTheDocument()
  })
})

// ─── Existing log on mount ────────────────────────────────────────────────────

describe('CardioLogger — existing log on mount', () => {
  it('shows logged entries when session already has cardio', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([sprintLog])

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    // Expand to see entries
    fireEvent.click(screen.getByRole('button', { name: /toggle cardio section/i }))

    expect(screen.getByText(/sprints/i)).toBeInTheDocument()
  })

  it('shows undo (✕) button for each logged entry', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([sprintLog])

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /toggle cardio section/i }))
    expect(screen.getByRole('button', { name: /undo cardio log/i })).toBeInTheDocument()
  })
})

// ─── Undo ─────────────────────────────────────────────────────────────────────

describe('CardioLogger — undo', () => {
  it('undo calls deleteCardio with the correct ID', async () => {
    vi.mocked(getCardioForSession)
      .mockResolvedValueOnce([sprintLog])   // initial load
      .mockResolvedValueOnce([])            // after delete
    vi.mocked(getLastPullSprintSets).mockResolvedValue(null)

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /toggle cardio section/i }))
    fireEvent.click(screen.getByRole('button', { name: /undo cardio log/i }))
    await act(async () => {})

    expect(vi.mocked(deleteCardio)).toHaveBeenCalledWith('clog-1')
  })

  it('undo removes the entry from the list', async () => {
    vi.mocked(getCardioForSession)
      .mockResolvedValueOnce([sprintLog])
      .mockResolvedValueOnce([])
    vi.mocked(getLastPullSprintSets).mockResolvedValue(null)

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /toggle cardio section/i }))
    const undoBtn = screen.getByRole('button', { name: /undo cardio log/i })
    fireEvent.click(undoBtn)
    await act(async () => {})

    // Entry row is gone; only the "Add cardio" button remains
    expect(screen.getByText(/\+ add cardio/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /undo cardio log/i })).not.toBeInTheDocument()
  })
})

// ─── Sprint suggestion after undo ─────────────────────────────────────────────

describe('CardioLogger — sprint suggestion correctness after undo', () => {
  it('suggestion reflects last REAL session after undoing, not the undone one', async () => {
    const loggedFiveSets: DbCardioLog = { ...sprintLog, id: 'clog-today', sets: 5 }

    vi.mocked(getCardioForSession)
      .mockResolvedValueOnce([loggedFiveSets])
      .mockResolvedValueOnce([])
    vi.mocked(getLastPullSprintSets)
      .mockResolvedValueOnce(null)  // initial mount (no suggestion needed; entry exists)
      .mockResolvedValueOnce(4)     // after undo: last real session was 4 sets

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    // Expand and undo
    fireEvent.click(screen.getByRole('button', { name: /toggle cardio section/i }))
    fireEvent.click(screen.getByRole('button', { name: /undo cardio log/i }))
    await act(async () => {})

    // Open the add-entry form to see the suggested sets value
    fireEvent.click(screen.getByText(/\+ add cardio/i))

    // Sprint suggestion should be nextSprintSets(4) = 5
    expect(screen.getByText(/suggested: 5 sets/i)).toBeInTheDocument()
  })

  it('getLastPullSprintSets is called again after undo to re-derive suggestion', async () => {
    vi.mocked(getCardioForSession)
      .mockResolvedValueOnce([sprintLog])
      .mockResolvedValueOnce([])
    vi.mocked(getLastPullSprintSets).mockResolvedValue(3)

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    const callsBefore = vi.mocked(getLastPullSprintSets).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: /toggle cardio section/i }))
    fireEvent.click(screen.getByRole('button', { name: /undo cardio log/i }))
    await act(async () => {})

    expect(vi.mocked(getLastPullSprintSets).mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('push session shows no sprint suggestion', async () => {
    vi.mocked(getCardioForSession).mockResolvedValue([])

    render(<CardioLogger session={pushSession} />)
    await act(async () => {})

    // Expand and open add form
    fireEvent.click(screen.getByRole('button', { name: /toggle cardio section/i }))
    fireEvent.click(screen.getByText(/\+ add cardio/i))

    expect(screen.queryByText(/suggested:.*sets/i)).not.toBeInTheDocument()
    expect(vi.mocked(getLastPullSprintSets)).not.toHaveBeenCalled()
  })
})

// ─── Multiple entries ──────────────────────────────────────────────────────────

describe('CardioLogger — multiple entries', () => {
  it('shows all logged entries', async () => {
    const secondEntry: DbCardioLog = {
      ...sprintLog,
      id: 'clog-2',
      activityType: 'elliptical',
      kind: 'other',
      sets: 0,
      minutes: 30,
    }
    vi.mocked(getCardioForSession).mockResolvedValue([sprintLog, secondEntry])

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /toggle cardio section/i }))

    expect(screen.getAllByRole('button', { name: /undo cardio log/i })).toHaveLength(2)
  })

  it('logCardio is called when adding a new entry', async () => {
    vi.mocked(getCardioForSession)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sprintLog])
    vi.mocked(getLastPullSprintSets).mockResolvedValue(5)

    render(<CardioLogger session={pullSession} />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /toggle cardio section/i }))
    fireEvent.click(screen.getByText(/\+ add cardio/i))
    fireEvent.click(screen.getByText(/log cardio/i))
    await act(async () => {})

    expect(vi.mocked(logCardio)).toHaveBeenCalledTimes(1)
  })
})
