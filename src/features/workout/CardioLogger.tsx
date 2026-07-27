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
import { PALETTE } from '../../ui/tokens'

const COMMON_TYPES = [
  'sprints',
  'treadmill',
  'elliptical',
  'running',
  'cycling',
  'swimming',
  'rowing',
  'stair climber',
  'walking',
  'hiking',
  'basketball',
  'soccer',
  'tennis',
  'other',
]

const RECENT_KEY = 'cardio-recent-types'

function getRecentTypes(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveRecentType(type: string): void {
  const recent = getRecentTypes().filter(t => t !== type)
  recent.unshift(type)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 3)))
}

function orderedTypes(sessionDay: 'push' | 'pull' | 'legs'): string[] {
  const prescribed = sessionDay === 'pull' ? 'sprints' : sessionDay === 'legs' ? 'treadmill' : null
  const recent = getRecentTypes()
  const seen = new Set<string>()
  const result: string[] = []

  // Prescribed type first
  if (prescribed) {
    result.push(prescribed)
    seen.add(prescribed)
  }

  // Recently used (deduplicated against prescribed)
  for (const t of recent) {
    if (!seen.has(t)) {
      result.push(t)
      seen.add(t)
    }
  }

  // Rest of common types
  for (const t of COMMON_TYPES) {
    if (!seen.has(t)) {
      result.push(t)
      seen.add(t)
    }
  }

  return result
}

function defaultType(day: 'push' | 'pull' | 'legs'): string {
  if (day === 'pull') return 'sprints'
  if (day === 'legs') return 'treadmill'
  const recent = getRecentTypes()
  return recent[0] ?? 'elliptical'
}

function summariseEntries(entries: DbCardioLog[]): string {
  if (entries.length === 0) return ''
  const totalMin = entries.reduce((sum, e) => sum + e.minutes, 0)
  if (entries.length === 1) {
    const e = entries[0]
    const type = e.activityType ?? e.kind
    if (type === 'sprints') {
      return e.sets > 0
        ? `${e.sets} sprint sets${totalMin > 0 ? ` · ${totalMin} min` : ''}`
        : `Sprints${totalMin > 0 ? ` · ${totalMin} min` : ''}`
    }
    const label = type.charAt(0).toUpperCase() + type.slice(1)
    return totalMin > 0 ? `${label} · ${totalMin} min` : label
  }
  return `${entries.length} entries${totalMin > 0 ? ` · ${totalMin} min` : ''}`
}

interface EntryForm {
  activityType: string
  customType: string
  minutes: number
  caloriesBurned: string
  distanceMi: number
  sets: number
  notes: string
}

function emptyForm(day: 'push' | 'pull' | 'legs', sprintSets: number): EntryForm {
  return {
    activityType: defaultType(day),
    customType: '',
    minutes: day === 'legs' ? 60 : 0,
    caloriesBurned: '',
    distanceMi: 0,
    sets: sprintSets,
    notes: '',
  }
}

interface CardioLoggerProps {
  session: DbSession
}

const cardioStyle = {
  container: {
    background: PALETTE.panel,
    border: `1px solid ${PALETTE.cardioBorder}`,
    borderRadius: 16,
    margin: '16px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    cursor: 'pointer',
  } as React.CSSProperties,
  pill: {
    display: 'inline-block',
    background: PALETTE.cardioPillBg,
    color: PALETTE.cardioPillText,
    borderRadius: 4,
    padding: '1px 7px',
    fontSize: 11,
    fontWeight: 500,
  } as React.CSSProperties,
}

export function CardioLogger({ session }: CardioLoggerProps) {
  const [entries, setEntries] = useState<DbCardioLog[] | undefined>(undefined)
  const [collapsed, setCollapsed] = useState(true)
  const [addingEntry, setAddingEntry] = useState(false)
  const [sprintSuggestion, setSprintSuggestion] = useState(4)
  const [form, setForm] = useState<EntryForm>(() => emptyForm(session.day, 4))
  const [saving, setSaving] = useState(false)
  const [undoingId, setUndoingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      const existing = await getCardioForSession(session.id)
      if (cancelled) return
      setEntries(existing)

      if (session.day === 'pull') {
        const last = await getLastPullSprintSets()
        if (!cancelled) {
          const suggested = nextSprintSets(last)
          setSprintSuggestion(suggested)
          setForm(prev => ({ ...prev, sets: suggested }))
        }
      }
    }
    init()
    return () => { cancelled = true }
  }, [session.id, session.day])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const effectiveType =
        form.activityType === '__custom__' ? form.customType.trim() || 'other' : form.activityType
      const calories = form.caloriesBurned ? parseFloat(form.caloriesBurned) : null
      const entry: Omit<DbCardioLog, 'updatedAt' | 'deletedAt'> = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        kind:
          effectiveType === 'sprints'
            ? 'sprints'
            : effectiveType === 'treadmill'
              ? 'treadmill'
              : 'other',
        activityType: effectiveType,
        sets: effectiveType === 'sprints' ? form.sets : 0,
        minutes: form.minutes,
        distanceMi: form.distanceMi,
        caloriesBurned: calories !== null && !isNaN(calories) ? calories : null,
        notes: form.notes.trim() || null,
        routeId: null,
      }
      await logCardio(entry)
      saveRecentType(effectiveType)
      const updated = await getCardioForSession(session.id)
      setEntries(updated)
      setAddingEntry(false)
      if (session.day === 'pull' && effectiveType === 'sprints') {
        const last = await getLastPullSprintSets()
        const suggested = nextSprintSets(last)
        setSprintSuggestion(suggested)
        setForm(emptyForm(session.day, suggested))
      } else {
        setForm(emptyForm(session.day, sprintSuggestion))
      }
    } catch (err) {
      alert(`Failed to save cardio: ${err}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleUndo(entryId: string) {
    if (undoingId) return
    setUndoingId(entryId)
    try {
      await deleteCardio(entryId)
      const updated = await getCardioForSession(session.id)
      setEntries(updated)
      if (session.day === 'pull') {
        const last = await getLastPullSprintSets()
        const suggested = nextSprintSets(last)
        setSprintSuggestion(suggested)
        setForm(prev => ({ ...prev, sets: suggested }))
      }
    } catch (err) {
      alert(`Failed to undo: ${err}`)
    } finally {
      setUndoingId(null)
    }
  }

  if (entries === undefined) return null

  const summary = summariseEntries(entries)
  const types = orderedTypes(session.day)

  return (
    <div style={cardioStyle.container}>
      {/* Header — always visible, toggles collapse */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={cardioStyle.header}
        aria-expanded={!collapsed}
        aria-label="Toggle cardio section"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={cardioStyle.pill}>Cardio</span>
          {collapsed && summary && (
            <span style={{ fontSize: 13, color: PALETTE.dim }}>{summary}</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: PALETTE.mute }}>
          {collapsed ? '▶' : '▼'}
        </span>
      </button>

      {/* Expanded body */}
      {!collapsed && (
        <div style={{ padding: '0 16px 16px' }}>
          {/* Logged entries */}
          {entries.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {entries.map(e => {
                const type = e.activityType ?? e.kind
                const label = type.charAt(0).toUpperCase() + type.slice(1)
                const parts: string[] = []
                if (type === 'sprints' && e.sets > 0) parts.push(`${e.sets} sets`)
                if (e.minutes > 0) parts.push(`${e.minutes} min`)
                if (e.distanceMi > 0) parts.push(`${e.distanceMi} mi`)
                if (e.caloriesBurned) parts.push(`${e.caloriesBurned} kcal`)
                const detail = parts.join(' · ')
                return (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: PALETTE.line,
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: PALETTE.fg,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {label}
                      </span>
                      {detail && (
                        <span style={{ fontSize: 12, color: PALETTE.dim, marginLeft: 6 }}>
                          {detail}
                        </span>
                      )}
                      {e.notes && (
                        <p style={{ fontSize: 11, color: PALETTE.mute, marginTop: 2 }}>{e.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleUndo(e.id)}
                      disabled={undoingId === e.id}
                      aria-label="Undo cardio log"
                      style={{
                        minHeight: 44,
                        minWidth: 44,
                        color: '#e05252',
                        fontSize: 13,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        opacity: undoingId === e.id ? 0.5 : 1,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add-entry form */}
          {addingEntry ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Activity type */}
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: PALETTE.mute,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Activity
                </label>
                <select
                  value={form.activityType}
                  onChange={e => setForm(prev => ({ ...prev, activityType: e.target.value }))}
                  style={{
                    width: '100%',
                    background: PALETTE.panel,
                    color: PALETTE.fg,
                    border: `1px solid ${PALETTE.line}`,
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 14,
                    outline: 'none',
                  }}
                >
                  {types.map(t => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                  <option value="__custom__">Custom…</option>
                </select>
                {form.activityType === '__custom__' && (
                  <input
                    type="text"
                    value={form.customType}
                    onChange={e => setForm(prev => ({ ...prev, customType: e.target.value }))}
                    placeholder="Activity name"
                    style={{
                      width: '100%',
                      background: PALETTE.panel,
                      color: PALETTE.fg,
                      border: `1px solid ${PALETTE.line}`,
                      borderRadius: 6,
                      padding: '8px 10px',
                      fontSize: 14,
                      outline: 'none',
                      marginTop: 6,
                      boxSizing: 'border-box',
                    }}
                  />
                )}
                {session.day === 'pull' && form.activityType === 'sprints' && (
                  <p style={{ fontSize: 11, color: PALETTE.mute, marginTop: 4 }}>
                    100 m sprint, jog back. Rest 2–3 min between sets.
                    Suggested: {sprintSuggestion} sets (max 10, +1 per session).
                  </p>
                )}
              </div>

              {/* Sprint sets — only for sprints */}
              {form.activityType === 'sprints' && (
                <Stepper
                  label="Sets"
                  value={form.sets}
                  onChange={v => setForm(prev => ({ ...prev, sets: v }))}
                  step={1}
                  min={1}
                  max={10}
                />
              )}

              {/* Duration */}
              <Stepper
                label="Minutes"
                value={form.minutes}
                onChange={v => setForm(prev => ({ ...prev, minutes: v }))}
                step={1}
                min={0}
              />

              {/* Calories — manual text input, never computed */}
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: PALETTE.mute,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Calories burned (optional)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.caloriesBurned}
                  onChange={e => setForm(prev => ({ ...prev, caloriesBurned: e.target.value }))}
                  placeholder="—"
                  style={{
                    width: '100%',
                    background: PALETTE.panel,
                    color: PALETTE.fg,
                    border: `1px solid ${PALETTE.line}`,
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
              </div>

              {/* Distance */}
              <Stepper
                label="Distance (mi)"
                value={form.distanceMi}
                onChange={v => setForm(prev => ({ ...prev, distanceMi: v }))}
                step={0.1}
                min={0}
              />

              {/* Notes */}
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: PALETTE.mute,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="—"
                  style={{
                    width: '100%',
                    background: PALETTE.panel,
                    color: PALETTE.fg,
                    border: `1px solid ${PALETTE.line}`,
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setAddingEntry(false)}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: `1px solid ${PALETTE.line}`,
                    borderRadius: 10,
                    padding: '12px',
                    fontSize: 14,
                    color: PALETTE.dim,
                    cursor: 'pointer',
                    minHeight: 48,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 2,
                    background: PALETTE.cardioBorder,
                    border: 'none',
                    borderRadius: 10,
                    padding: '12px',
                    fontSize: 15,
                    fontWeight: 500,
                    color: '#ffffff',
                    cursor: saving ? 'default' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                    minHeight: 48,
                  }}
                >
                  {saving ? 'Saving…' : 'Log cardio'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingEntry(true)}
              style={{
                width: '100%',
                background: 'none',
                border: `1px dashed ${PALETTE.cardioBorder}`,
                borderRadius: 10,
                padding: '10px',
                fontSize: 13,
                color: PALETTE.cardioPillText,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              + Add cardio
            </button>
          )}
        </div>
      )}
    </div>
  )
}
