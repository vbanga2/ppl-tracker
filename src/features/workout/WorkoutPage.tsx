import { useState, useEffect } from 'react'
import type { Day } from '../../domain/plan'
import { nextDay } from '../../domain/plan'
import { getLastSession, getOrCreateTodaySession } from '../../data/repo'
import type { DbSession } from '../../data/db'
import { DayPicker } from './DayPicker'
import { ExerciseList } from './ExerciseList'

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function WorkoutPage() {
  const [session, setSession] = useState<DbSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [overrideDay, setOverrideDay] = useState<Day | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    async function init() {
      const last = await getLastSession()
      const today = todayDate()

      // If there's already a session today, resume it
      if (last && last.date === today) {
        setSession(last)
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
    setShowPicker(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        Loading…
      </div>
    )
  }

  if (!session) {
    const day = overrideDay ?? 'push'
    return (
      <div className="px-4 py-8 flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold">Ready to train?</h1>
        <p className="text-slate-400 text-center">
          Next suggested day:
          <span className="ml-2 font-semibold text-white capitalize">{day}</span>
        </p>
        <button
          onClick={() => startSession(day)}
          className="w-full max-w-sm bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-5 rounded-2xl text-xl min-h-[64px]"
        >
          Start {day.charAt(0).toUpperCase() + day.slice(1)} Day
        </button>
        <button
          onClick={() => setShowPicker(true)}
          className="text-slate-400 text-sm underline min-h-[44px]"
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

  return (
    <div>
      <div className="px-4 py-4 flex items-center justify-between border-b border-slate-700">
        <div>
          <h1 className="text-xl font-bold capitalize">{session.day} Day</h1>
          <p className="text-xs text-slate-400">{session.date}</p>
        </div>
      </div>
      <ExerciseList session={session} />
    </div>
  )
}
