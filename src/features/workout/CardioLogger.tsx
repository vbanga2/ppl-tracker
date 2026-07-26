import { useState, useEffect } from 'react'
import type { DbSession } from '../../data/db'
import { logCardio, getCardioForSession, getLastPullSprintSets } from '../../data/repo'
import { nextSprintSets } from '../../domain/progression'
import { Stepper } from '../../ui/Stepper'

interface CardioLoggerProps {
  session: DbSession
}

export function CardioLogger({ session }: CardioLoggerProps) {
  const [logged, setLogged] = useState(false)
  const [saving, setSaving] = useState(false)

  // Push / Legs: minutes + distance
  const [minutes, setMinutes] = useState(0)
  const [distanceMi, setDistanceMi] = useState(0)

  // Pull: sprints
  const [sprintSets, setSprintSets] = useState(4)
  const [sprintMinutes, setSprintMinutes] = useState(0)

  useEffect(() => {
    async function init() {
      const existing = await getCardioForSession(session.id)
      if (existing.length > 0) {
        setLogged(true)
        return
      }
      if (session.day === 'pull') {
        const last = await getLastPullSprintSets()
        setSprintSets(nextSprintSets(last))
      }
    }
    init()
  }, [session.id, session.day])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      if (session.day === 'pull') {
        await logCardio({
          id: crypto.randomUUID(),
          sessionId: session.id,
          kind: 'sprints',
          sets: sprintSets,
          minutes: sprintMinutes,
          distanceMi: 0,
          routeId: null,
        })
      } else {
        await logCardio({
          id: crypto.randomUUID(),
          sessionId: session.id,
          kind: session.day === 'legs' ? 'treadmill' : 'other',
          sets: 0,
          minutes,
          distanceMi,
          routeId: null,
        })
      }
      setLogged(true)
    } catch (err) {
      alert(`Failed to save cardio: ${err}`)
    } finally {
      setSaving(false)
    }
  }

  if (logged) {
    return (
      <div className="mx-4 mt-4 mb-6 bg-slate-800 rounded-2xl px-4 py-4">
        <p className="text-sm font-medium text-green-400">Cardio logged ✓</p>
      </div>
    )
  }

  return (
    <div className="mx-4 mt-4 mb-6 bg-slate-800 rounded-2xl px-4 py-4 flex flex-col gap-4">
      {session.day === 'push' && (
        <>
          <div>
            <p className="font-medium text-sm">Cardio (optional)</p>
            <p className="text-xs text-slate-400 mt-0.5">Light cardio after push — log if done.</p>
          </div>
          <Stepper label="Minutes" value={minutes} onChange={setMinutes} step={1} min={0} />
          <Stepper label="Distance (mi)" value={distanceMi} onChange={setDistanceMi} step={0.1} min={0} />
        </>
      )}

      {session.day === 'pull' && (
        <>
          <div>
            <p className="font-medium text-sm">Sprints</p>
            <p className="text-xs text-slate-400 mt-0.5">
              100 m sprint, jog back 100 m. Rest 2–3 min between sets.
            </p>
            <p className="text-xs text-slate-400">Suggested: {sprintSets} sets (max 10, +1 per session).</p>
          </div>
          <Stepper label="Sets" value={sprintSets} onChange={setSprintSets} step={1} min={1} max={10} />
          <Stepper label="Minutes" value={sprintMinutes} onChange={setSprintMinutes} step={1} min={0} />
        </>
      )}

      {session.day === 'legs' && (
        <>
          <div>
            <p className="font-medium text-sm">Treadmill</p>
            <p className="text-xs text-slate-400 mt-0.5">Target: 60 minutes.</p>
          </div>
          <Stepper label="Minutes" value={minutes} onChange={setMinutes} step={1} min={0} />
          <Stepper label="Distance (mi)" value={distanceMi} onChange={setDistanceMi} step={0.1} min={0} />
        </>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-base min-h-[56px]"
      >
        Log Cardio
      </button>
    </div>
  )
}
