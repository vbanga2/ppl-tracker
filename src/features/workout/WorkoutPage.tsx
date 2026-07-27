import { useState, useEffect, useRef } from 'react'
import type { Day } from '../../domain/plan'
import { nextDay } from '../../domain/plan'
import { getLastSession, getOrCreateTodaySession, getSetsForSession, deleteSession } from '../../data/repo'
import type { DbSession } from '../../data/db'
import { DayPicker } from './DayPicker'
import { ExerciseList } from './ExerciseList'
import { CardioLogger } from './CardioLogger'
import { PALETTE, dayAccent } from '../../ui/tokens'

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

interface WorkoutPageProps {
  onDayReady?: (day: Day | null) => void
}

export function WorkoutPage({ onDayReady }: WorkoutPageProps) {
  const [session, setSession] = useState<DbSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [overrideDay, setOverrideDay] = useState<Day | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const onDayReadyRef = useRef(onDayReady)
  useEffect(() => { onDayReadyRef.current = onDayReady })

  useEffect(() => {
    async function init() {
      const last = await getLastSession()
      const today = todayDate()

      if (last && last.date === today) {
        setSession(last)
        onDayReadyRef.current?.(last.day)
        setLoading(false)
        return
      }

      const suggestedDay = nextDay(last?.day ?? null)
      setOverrideDay(suggestedDay)
      setLoading(false)
    }
    init()
  }, [])

  async function startSession(day: Day) {
    const s = await getOrCreateTodaySession(day, todayDate())
    setSession(s)
    onDayReady?.(s.day)
    setShowPicker(false)
  }

  async function handleChangeDay(newDay: Day) {
    const s = await getOrCreateTodaySession(newDay, todayDate())
    setSession(s)
    onDayReadyRef.current?.(s.day)
    setShowPicker(false)
  }

  async function handleDeleteSession() {
    if (!session) return
    const sets = await getSetsForSession(session.id)
    if (sets.length > 0) {
      alert('Cannot delete a session with logged sets.')
      return
    }
    await deleteSession(session.id)
    setSession(null)
    const last = await getLastSession()
    setOverrideDay(nextDay(last?.day ?? null))
    onDayReadyRef.current?.(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" style={{ color: PALETTE.mute }}>
        Loading…
      </div>
    )
  }

  if (!session) {
    const day = overrideDay ?? 'push'
    const accent = dayAccent(day)
    return (
      <div className="px-4 py-8 flex flex-col items-center gap-6">
        <h1 className="text-2xl font-medium" style={{ color: PALETTE.fg }}>
          Ready to train?
        </h1>
        <p className="text-sm text-center" style={{ color: PALETTE.dim }}>
          Next suggested day:{' '}
          <span className="font-semibold capitalize" style={{ color: accent }}>
            {day}
          </span>
        </p>
        <button
          onClick={() => startSession(day)}
          className="w-full max-w-sm text-white font-medium py-5 rounded-2xl text-xl capitalize"
          style={{ minHeight: 64, background: accent }}
        >
          Start {day} day
        </button>
        <button
          onClick={() => setShowPicker(true)}
          className="text-sm underline"
          style={{ minHeight: 44, color: PALETTE.mute }}
        >
          Choose a different day
        </button>
        {showPicker && (
          <DayPicker
            onSelect={startSession}
            onCancel={() => setShowPicker(false)}
          />
        )}
      </div>
    )
  }

  const accent = dayAccent(session.day)

  return (
    <div>
      <div
        className="px-4 py-4 flex items-center justify-between border-b"
        style={{ borderColor: PALETTE.line }}
      >
        <button
          onClick={() => setShowPicker(true)}
          className="flex flex-col items-start text-left"
          style={{ minHeight: 44 }}
        >
          <h1 className="text-xl font-medium capitalize" style={{ color: accent }}>
            {session.day} day ›
          </h1>
          <p className="text-xs" style={{ color: PALETTE.mute }}>
            {session.date} · tap to change
          </p>
        </button>
        <button
          onClick={handleDeleteSession}
          className="flex items-center justify-center text-lg"
          style={{ width: 44, height: 44, color: PALETTE.mute }}
          title="Delete empty session"
          aria-label="Delete session"
        >
          ✕
        </button>
      </div>
      {showPicker && (
        <DayPicker
          onSelect={handleChangeDay}
          onCancel={() => setShowPicker(false)}
        />
      )}
      <ExerciseList session={session} />
      <CardioLogger session={session} />
    </div>
  )
}
