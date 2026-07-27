import { useState, useEffect, useRef, useCallback } from 'react'
import type { Day } from '../../domain/plan'
import { nextDay } from '../../domain/plan'
import {
  getLastSession,
  getOrCreateTodaySession,
  getSetsForSession,
  deleteSet,
  getCardioForSession,
  deleteCardio,
  deleteSession,
  updateSessionNotes,
} from '../../data/repo'
import type { DbSession } from '../../data/db'
import { DayPicker } from './DayPicker'
import { ExerciseList } from './ExerciseList'
import { CardioLogger } from './CardioLogger'
import { CalendarView } from '../calendar/CalendarView'
import { PALETTE, dayAccent } from '../../ui/tokens'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function todayDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatFullDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DAY_NAMES[dt.getDay()]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`
}

interface WorkoutPageProps {
  onDayReady?: (day: Day | null) => void
}

export function WorkoutPage({ onDayReady }: WorkoutPageProps) {
  const [session, setSession] = useState<DbSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [overrideDay, setOverrideDay] = useState<Day | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [sessionNote, setSessionNote] = useState('')
  const onDayReadyRef = useRef(onDayReady)
  useEffect(() => { onDayReadyRef.current = onDayReady })

  const init = useCallback(async () => {
    const last = await getLastSession()
    const today = todayDate()

    if (last && last.date === today) {
      setSession(last)
      setSessionNote(last.notes ?? '')
      onDayReadyRef.current?.(last.day)
      setLoading(false)
      return
    }

    const suggestedDay = nextDay(last?.day ?? null)
    setOverrideDay(suggestedDay)
    setSession(null)
    setLoading(false)
  }, [])

  useEffect(() => { init() }, [init])

  async function startSession(day: Day) {
    const s = await getOrCreateTodaySession(day, todayDate())
    setSession(s)
    setSessionNote(s.notes ?? '')
    onDayReady?.(s.day)
    setShowPicker(false)
  }

  async function handleChangeDay(newDay: Day) {
    const s = await getOrCreateTodaySession(newDay, todayDate())
    setSession(s)
    setSessionNote(s.notes ?? '')
    onDayReadyRef.current?.(s.day)
    setShowPicker(false)
  }

  async function handleDeleteSession() {
    if (!session) return
    const [sets, cardio] = await Promise.all([
      getSetsForSession(session.id),
      getCardioForSession(session.id),
    ])
    const hasData = sets.length > 0 || cardio.length > 0
    if (hasData) {
      const parts: string[] = []
      if (sets.length > 0) parts.push(`${sets.length} set${sets.length !== 1 ? 's' : ''}`)
      if (cardio.length > 0) parts.push('cardio')
      const ok = window.confirm(
        `This session has ${parts.join(' and ')} logged. Delete everything?`,
      )
      if (!ok) return
    }
    await Promise.all([...sets.map(s => deleteSet(s.id)), ...cardio.map(c => deleteCardio(c.id))])
    await deleteSession(session.id)
    setSession(null)
    setSessionNote('')
    const last = await getLastSession()
    setOverrideDay(nextDay(last?.day ?? null))
    onDayReadyRef.current?.(null)
  }

  function handleNoteBlur() {
    if (session) updateSessionNotes(session.id, sessionNote)
  }

  // Date header — always visible at the top
  const dateHeader = (
    <button
      onClick={() => setShowCalendar(true)}
      className="w-full flex items-center justify-between px-4 py-3 border-b"
      style={{ borderColor: PALETTE.line, minHeight: 48 }}
    >
      <span className="text-sm" style={{ color: PALETTE.dim }}>
        {formatFullDate(todayDate())}
      </span>
      <span className="text-xs px-2 py-1 rounded-lg" style={{ background: PALETTE.line, color: PALETTE.mute }}>
        Calendar
      </span>
    </button>
  )

  if (loading) {
    return (
      <>
        {dateHeader}
        <div className="flex items-center justify-center h-64" style={{ color: PALETTE.mute }}>
          Loading…
        </div>
        {showCalendar && (
          <CalendarView onClose={() => setShowCalendar(false)} onSessionChanged={init} />
        )}
      </>
    )
  }

  if (!session) {
    const day = overrideDay ?? 'push'
    const accent = dayAccent(day)
    return (
      <>
        {dateHeader}
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
        {showCalendar && (
          <CalendarView onClose={() => setShowCalendar(false)} onSessionChanged={init} />
        )}
      </>
    )
  }

  const accent = dayAccent(session.day)

  return (
    <>
      {dateHeader}
      <div>
        <div
          className="px-4 py-4 border-b"
          style={{ borderColor: PALETTE.line }}
        >
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowPicker(true)}
              className="flex flex-col items-start text-left"
              style={{ minHeight: 44 }}
            >
              <h1 className="text-xl font-medium capitalize" style={{ color: accent }}>
                {session.day} day ›
              </h1>
            </button>
            <button
              onClick={handleDeleteSession}
              className="flex items-center justify-center text-lg"
              style={{ width: 44, height: 44, color: PALETTE.mute }}
              title="Delete session"
              aria-label="Delete session"
            >
              ✕
            </button>
          </div>
          {/* Session note */}
          <textarea
            value={sessionNote}
            onChange={e => setSessionNote(e.target.value)}
            onBlur={handleNoteBlur}
            placeholder="Add a session note…"
            rows={2}
            className="w-full text-sm rounded-xl px-3 py-2 mt-2 resize-none"
            style={{
              background: PALETTE.line,
              color: PALETTE.fg,
              border: 'none',
              outline: 'none',
            }}
          />
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
      {showCalendar && (
        <CalendarView onClose={() => setShowCalendar(false)} onSessionChanged={init} />
      )}
    </>
  )
}
