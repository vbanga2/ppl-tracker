import { useState, useEffect } from 'react'
import type { DbCardioLog, DbSession } from '../../data/db'
import {
  logCardio,
  deleteCardio,
  getCardioForSession,
  getLastPullSprintSets,
} from '../../data/repo'
import { nextSprintSets } from '../../domain/progression'
import { Stepper } from '../../ui/Stepper'
import { PALETTE, dayAccent } from '../../ui/tokens'

interface CardioLoggerProps {
  session: DbSession
}

function formatCardioEntry(entry: DbCardioLog): string {
  if (entry.kind === 'sprints') {
    return entry.minutes > 0
      ? `${entry.sets} sprint sets · ${entry.minutes} min`
      : `${entry.sets} sprint sets`
  }
  const parts: string[] = []
  if (entry.minutes > 0) parts.push(`${entry.minutes} min`)
  if (entry.distanceMi > 0) parts.push(`${entry.distanceMi} mi`)
  return parts.length > 0 ? parts.join(' · ') : entry.kind
}

export function CardioLogger({ session }: CardioLoggerProps) {
  // undefined = loading; null = no log; DbCardioLog = logged
  const [loggedEntry, setLoggedEntry] = useState<DbCardioLog | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [undoing, setUndoing] = useState(false)

  const [minutes, setMinutes] = useState(0)
  const [distanceMi, setDistanceMi] = useState(0)
  const [sprintSets, setSprintSets] = useState(4)
  const [sprintMinutes, setSprintMinutes] = useState(0)

  const accent = dayAccent(session.day)

  // Load once per session — deps are stable primitives, no loop risk
  useEffect(() => {
    let cancelled = false

    async function init() {
      const existing = await getCardioForSession(session.id)
      if (cancelled) return

      if (existing.length > 0) {
        setLoggedEntry(existing[0])
        return
      }

      setLoggedEntry(null)

      if (session.day === 'pull') {
        const last = await getLastPullSprintSets()
        if (cancelled) return
        const suggested = nextSprintSets(last)
        setSprintSets(suggested)
      }
    }

    init()
    return () => { cancelled = true }
  }, [session.id, session.day])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const entry: Omit<DbCardioLog, 'updatedAt' | 'deletedAt'> = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        kind: session.day === 'pull' ? 'sprints' : session.day === 'legs' ? 'treadmill' : 'other',
        sets: session.day === 'pull' ? sprintSets : 0,
        minutes: session.day === 'pull' ? sprintMinutes : minutes,
        distanceMi: session.day === 'pull' ? 0 : distanceMi,
        routeId: null,
      }
      await logCardio(entry)
      setLoggedEntry({ ...entry, updatedAt: Date.now(), deletedAt: null })
    } catch (err) {
      alert(`Failed to save cardio: ${err}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleUndo() {
    if (!loggedEntry || undoing) return
    setUndoing(true)
    try {
      await deleteCardio(loggedEntry.id)
      setLoggedEntry(null)
      // Re-derive suggestion from the last REAL sprint session (soft-deleted entry excluded)
      if (session.day === 'pull') {
        const last = await getLastPullSprintSets()
        setSprintSets(nextSprintSets(last))
      }
    } catch (err) {
      alert(`Failed to undo cardio: ${err}`)
    } finally {
      setUndoing(false)
    }
  }

  if (loggedEntry === undefined) return null

  // ── Logged state ─────────────────────────────────────────────────────────────
  if (loggedEntry !== null) {
    return (
      <div
        className="mx-4 mt-4 mb-6 rounded-2xl px-4 py-4"
        style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}` }}
      >
        <p className="text-sm font-medium mb-2" style={{ color: PALETTE.dim }}>
          Cardio logged
        </p>
        {/* Same visual pattern as a logged set row in BlockLogger */}
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2"
          style={{ background: PALETTE.line }}
        >
          <span
            className="font-medium text-sm"
            style={{ color: PALETTE.fg, fontVariantNumeric: 'tabular-nums' }}
          >
            {formatCardioEntry(loggedEntry)}
          </span>
          <button
            onClick={handleUndo}
            disabled={undoing}
            aria-label="Undo cardio log"
            className="text-xs ml-2 px-2 disabled:opacity-50"
            style={{ minHeight: 44, color: '#e05252' }}
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  // ── Unlogged state — log form ─────────────────────────────────────────────────
  return (
    <div
      className="mx-4 mt-4 mb-6 rounded-2xl px-4 py-4 flex flex-col gap-4"
      style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}` }}
    >
      {session.day === 'push' && (
        <>
          <div>
            <p className="font-medium text-sm" style={{ color: PALETTE.fg }}>
              Cardio (optional)
            </p>
            <p className="text-xs mt-0.5" style={{ color: PALETTE.mute }}>
              Light cardio after push — log if done.
            </p>
          </div>
          <Stepper label="Minutes" value={minutes} onChange={setMinutes} step={1} min={0} />
          <Stepper label="Distance" value={distanceMi} onChange={setDistanceMi} step={0.1} min={0} />
        </>
      )}

      {session.day === 'pull' && (
        <>
          <div>
            <p className="font-medium text-sm" style={{ color: PALETTE.fg }}>
              Sprints
            </p>
            <p className="text-xs mt-0.5" style={{ color: PALETTE.mute }}>
              100 m sprint, jog back 100 m. Rest 2–3 min between sets.
            </p>
            <p className="text-xs" style={{ color: PALETTE.mute }}>
              Suggested: {sprintSets} sets (max 10, +1 per session).
            </p>
          </div>
          <Stepper label="Sets" value={sprintSets} onChange={setSprintSets} step={1} min={1} max={10} />
          <Stepper label="Minutes" value={sprintMinutes} onChange={setSprintMinutes} step={1} min={0} />
        </>
      )}

      {session.day === 'legs' && (
        <>
          <div>
            <p className="font-medium text-sm" style={{ color: PALETTE.fg }}>
              Treadmill
            </p>
            <p className="text-xs mt-0.5" style={{ color: PALETTE.mute }}>
              Target: 60 minutes.
            </p>
          </div>
          <Stepper label="Minutes" value={minutes} onChange={setMinutes} step={1} min={0} />
          <Stepper label="Distance" value={distanceMi} onChange={setDistanceMi} step={0.1} min={0} />
        </>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full text-white font-bold py-4 rounded-2xl text-base disabled:opacity-50"
        style={{ minHeight: 56, background: accent }}
      >
        Log Cardio
      </button>
    </div>
  )
}
