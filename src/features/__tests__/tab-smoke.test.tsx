import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ProgressPage } from '../progress/ProgressPage'
import { BodyPage } from '../body/BodyPage'

vi.mock('../../data/repo', () => ({
  getAllExercises: vi.fn().mockResolvedValue([]),
  getAllSessionsOrdered: vi.fn().mockResolvedValue([]),
  getAllBodyMetrics: vi.fn().mockResolvedValue([]),
  getAllSetsForExercise: vi.fn().mockResolvedValue([]),
  getAllCardioLogs: vi.fn().mockResolvedValue([]),
  addBodyMetric: vi.fn().mockResolvedValue(undefined),
  updateBodyMetric: vi.fn().mockResolvedValue(undefined),
  deleteBodyMetric: vi.fn().mockResolvedValue(undefined),
  countBodyMetricsWithDefaultFat: vi.fn().mockResolvedValue(0),
  clearDefaultBodyFat: vi.fn().mockResolvedValue(undefined),
  getAllBodyMeasurements: vi.fn().mockResolvedValue([]),
  addBodyMeasurement: vi.fn().mockResolvedValue(undefined),
  updateBodyMeasurement: vi.fn().mockResolvedValue(undefined),
  deleteBodyMeasurement: vi.fn().mockResolvedValue(undefined),
  getAllProgressPhotos: vi.fn().mockResolvedValue([]),
  addProgressPhoto: vi.fn().mockResolvedValue(undefined),
  updateProgressPhoto: vi.fn().mockResolvedValue(undefined),
  deleteProgressPhoto: vi.fn().mockResolvedValue(undefined),
}))

const PLACEHOLDER_RE = /coming soon|coming in M\d/i

beforeEach(() => {
  vi.clearAllMocks()
})

describe('tab smoke — no placeholder text', () => {
  it('ProgressPage renders real content, not a placeholder', async () => {
    render(<ProgressPage />)
    await act(async () => {})
    expect(screen.queryByText(PLACEHOLDER_RE)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /progress/i })).toBeInTheDocument()
  })

  it('ProgressPage renders the exercise dropdown', async () => {
    render(<ProgressPage />)
    await act(async () => {})
    expect(screen.getByText(/choose an exercise/i)).toBeInTheDocument()
  })

  it('BodyPage renders real content, not a placeholder', async () => {
    render(<BodyPage />)
    await act(async () => {})
    expect(screen.queryByText(PLACEHOLDER_RE)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /body/i })).toBeInTheDocument()
  })

  it('BodyPage renders the measurement entry form', async () => {
    render(<BodyPage />)
    await act(async () => {})
    expect(screen.getByText(/log measurement/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save measurement/i })).toBeInTheDocument()
  })
})
