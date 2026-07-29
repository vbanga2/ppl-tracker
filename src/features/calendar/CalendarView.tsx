import { useState, useEffect, useMemo, useCallback } from 'react'
import type { DbSession, DbSetLog, DbExercise, DbBlock, DbBodyMetric, DbCardioLog } from '../../data/db'
import {
  loadCalendarData,
  createSessionForDate,
  updateSessionNotes,
  addBodyMetric,
  deleteBodyMetric,
  deleteSession,
  deleteSet,
  getSetsForSession,
  getCardioForSession,
  deleteCardio,
} from '../../data/repo'
import { computePRDates, computeExercisePRHistory } from '../../domain/records'
import type { SetWithMeta } from '../../domain/records'
import { ExerciseList } from '../workout/ExerciseList'
import { CardioLogger } from '../workout/CardioLogger'
import { PALETTE, SURFACE, BORDER, dayAccent } from '../../ui/tokens'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatFullDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DAY_NAMES[dt.getDay()]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isFuture(dateStr: string, today: string): boolean {
  return dateStr > today
}

function bodyweightAtDate(sortedMetrics: DbBodyMetric[], date: string): number {
  let bw = 0
  for (const m of sortedMetrics) {
    if (m.date <= date) bw = m.weightLb
    else break
  }
  return bw
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface CalendarRawData {
  sessions: DbSession[]
  setLogs: DbSetLog[]
  exercises: DbExercise[]
  blocks: DbBlock[]
  bodyMetrics: DbBodyMetric[]
  cardioLogs: DbCardioLog[]
  prDates: Set<string>
  enrichedSets: SetWithMeta[]
}

interface DayCell {
  date: string
  dayNum: number
  sessions: DbSession[]
  hasPR: boolean
  hasExtraData: boolean
}

interface DayData {
  date: string
  sessions: DbSession[]
  sessionSets: Map<string, DbSetLog[]>
  sessionCardio: Map<string, DbCardioLog[]>
  sessionExerciseSets: Map<string, { exercise: DbExercise; sets: DbSetLog[]; prText: string | null }[]>
  bodyMetric: DbBodyMetric | undefined
  hasPR: boolean
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface CalendarViewProps {
  onClose: () => void
  onSessionChanged?: () => void
  initialDate?: string
}

// ─── Grid builder ────────────────────────────────────────────────────────────

function buildDayCells(
  year: number,
  month: number,
  data: CalendarRawData | null,
): (DayCell | null)[] {
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (DayCell | null)[] = []

  for (let i = 0; i < firstDay; i++) cells.push(null)

  const sessionsByDate = new Map<string, DbSession[]>()
  const bodyMetricDates = new Set<string>()
  const cardioDates = new Set<string>()

  if (data) {
    for (const s of data.sessions) {
      const arr = sessionsByDate.get(s.date) ?? []
      arr.push(s)
      sessionsByDate.set(s.date, arr)
    }
    for (const m of data.bodyMetrics) bodyMetricDates.add(m.date)
    for (const c of data.cardioLogs) {
      const sess = data.sessions.find(s => s.id === c.sessionId)
      if (sess) cardioDates.add(sess.date)
    }
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = dateKey(year, month, d)
    const sessions = sessionsByDate.get(date) ?? []
    const hasPR = data?.prDates.has(date) ?? false
    const hasExtraData = bodyMetricDates.has(date) || cardioDates.has(date)
    cells.push({ date, dayNum: d, sessions, hasPR, hasExtraData })
  }

  return cells
}

function deriveDayData(dateStr: string, data: CalendarRawData): DayData {
  const sessions = data.sessions.filter(s => s.date === dateStr)

  const sessionSets = new Map<string, DbSetLog[]>()
  const sessionCardio = new Map<string, DbCardioLog[]>()
  const sessionExerciseSets = new Map<
    string,
    { exercise: DbExercise; sets: DbSetLog[]; prText: string | null }[]
  >()

  const blockMap = new Map(data.blocks.map(b => [b.id, b]))
  const exerciseMap = new Map(data.exercises.map(e => [e.id, e]))

  for (const sess of sessions) {
    const sets = data.setLogs.filter(s => s.sessionId === sess.id)
    const cardio = data.cardioLogs.filter(c => c.sessionId === sess.id)
    sessionSets.set(sess.id, sets)
    sessionCardio.set(sess.id, cardio)

    // Group sets by exercise
    const byExercise = new Map<string, DbSetLog[]>()
    for (const set of sets) {
      const block = blockMap.get(set.blockId)
      if (!block) continue
      const arr = byExercise.get(block.exerciseId) ?? []
      arr.push(set)
      byExercise.set(block.exerciseId, arr)
    }

    const exerciseEntries: { exercise: DbExercise; sets: DbSetLog[]; prText: string | null }[] = []
    for (const [exId, exSets] of byExercise) {
      const exercise = exerciseMap.get(exId)
      if (!exercise) continue

      // Compute PR text for this exercise on this date
      const exAllSets = data.enrichedSets.filter(s => s.exerciseId === exId)
      const prHistory = computeExercisePRHistory(exAllSets)
      const pr = prHistory.get(dateStr)
      const prText = pr ? `Best e1RM: ${exercise.name} ${Math.round(pr.bestE1RM)} lb` : null

      exerciseEntries.push({ exercise, sets: exSets, prText })
    }
    sessionExerciseSets.set(sess.id, exerciseEntries)
  }

  const bodyMetric = data.bodyMetrics.find(m => m.date === dateStr)

  return {
    date: dateStr,
    sessions,
    sessionSets,
    sessionCardio,
    sessionExerciseSets,
    bodyMetric,
    hasPR: data.prDates.has(dateStr),
  }
}

// ─── DayDetailPanel ──────────────────────────────────────────────────────────

interface DayDetailPanelProps {
  dayData: DayData
  today: string
  onAddSession: (day: 'push' | 'pull' | 'legs') => void
  onEditSession: (session: DbSession) => void
  onDeleteSession: (session: DbSession) => void
  onBodyMetricChange: () => void
  onNoteBlur: (sessionId: string, notes: string) => void
}

function formatCardioEntry(c: DbCardioLog): string {
  const type = c.activityType ?? c.kind
  if (type === 'sprints') return `${c.sets} sprint sets${c.minutes ? ` · ${c.minutes} min` : ''}`
  const parts = []
  if (c.minutes) parts.push(`${c.minutes} min`)
  if (c.distanceMi) parts.push(`${c.distanceMi} mi`)
  const label = type.charAt(0).toUpperCase() + type.slice(1)
  return parts.length > 0 ? `${label} · ${parts.join(' · ')}` : label
}

function DayDetailPanel({
  dayData,
  today,
  onAddSession,
  onEditSession,
  onDeleteSession,
  onBodyMetricChange,
  onNoteBlur,
}: DayDetailPanelProps) {
  const future = isFuture(dayData.date, today)
  const [showDayPicker, setShowDayPicker] = useState(false)
  const [noteValues, setNoteValues] = useState<Map<string, string>>(new Map())
  const [bwValue, setBwValue] = useState<string>(
    dayData.bodyMetric ? String(dayData.bodyMetric.weightLb) : '',
  )
  const [bfValue, setBfValue] = useState<string>(
    dayData.bodyMetric?.bodyFatPct != null ? String(dayData.bodyMetric.bodyFatPct) : '',
  )

  useEffect(() => {
    const m = new Map<string, string>()
    for (const s of dayData.sessions) m.set(s.id, s.notes ?? '')
    setNoteValues(m)
    setBwValue(dayData.bodyMetric ? String(dayData.bodyMetric.weightLb) : '')
    setBfValue(dayData.bodyMetric?.bodyFatPct != null ? String(dayData.bodyMetric.bodyFatPct) : '')
  }, [dayData])

  async function handleBwBlur() {
    const w = parseFloat(bwValue)
    if (isNaN(w) || w <= 0) return
    if (dayData.bodyMetric) await deleteBodyMetric(dayData.bodyMetric.id)
    await addBodyMetric({
      id: crypto.randomUUID(),
      date: dayData.date,
      weightLb: w,
      bodyFatPct: bfValue ? parseFloat(bfValue) : null,
      source: 'manual',
    })
    onBodyMetricChange()
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      <h2 className="text-base font-medium" style={{ color: PALETTE.fg }}>
        {formatFullDate(dayData.date)}
      </h2>

      {dayData.sessions.length === 0 && (
        <p className="text-sm" style={{ color: PALETTE.mute }}>
          No session logged
        </p>
      )}

      {dayData.sessions.map(sess => {
        const exEntries = dayData.sessionExerciseSets.get(sess.id) ?? []
        const cardio = dayData.sessionCardio.get(sess.id) ?? []
        const accent = dayAccent(sess.day)
        const noteVal = noteValues.get(sess.id) ?? ''
        return (
          <div
            key={sess.id}
            className="rounded-2xl overflow-hidden"
            style={{ border: `1px solid ${PALETTE.line}` }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ background: accent }}
            >
              <span className="text-white font-medium capitalize">{sess.day} day</span>
              <div className="flex gap-2">
                <button
                  onClick={() => onEditSession(sess)}
                  className="text-white text-sm px-3 rounded-lg"
                  style={{ minHeight: 36, background: 'rgba(255,255,255,0.2)' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => onDeleteSession(sess)}
                  className="text-white text-sm px-3 rounded-lg"
                  style={{ minHeight: 36, background: 'rgba(255,255,255,0.2)' }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="px-4 py-3 flex flex-col gap-2">
              {exEntries.map(({ exercise, sets, prText }) => (
                <div key={exercise.id}>
                  <p className="text-sm font-medium" style={{ color: PALETTE.fg }}>
                    {exercise.name}
                    {prText && (
                      <span className="ml-2 text-xs" style={{ color: PALETTE.pr }}>
                        ★ PR
                      </span>
                    )}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: PALETTE.dim, fontVariantNumeric: 'tabular-nums' }}>
                    {sets.map(s => `${s.weightLb}×${s.reps}`).join(', ')}
                  </p>
                  {prText && (
                    <p className="text-xs mt-0.5" style={{ color: PALETTE.pr }}>
                      {prText}
                    </p>
                  )}
                </div>
              ))}

              {cardio.map(c => (
                <p key={c.id} className="text-xs" style={{ color: PALETTE.dim }}>
                  Cardio: {formatCardioEntry(c)}
                </p>
              ))}

              {/* Session note */}
              <div className="mt-2">
                <p className="text-xs mb-1" style={{ color: PALETTE.mute }}>
                  Session note
                </p>
                <textarea
                  value={noteVal}
                  onChange={e => {
                    const m = new Map(noteValues)
                    m.set(sess.id, e.target.value)
                    setNoteValues(m)
                  }}
                  onBlur={() => onNoteBlur(sess.id, noteVal)}
                  placeholder="Add a note…"
                  rows={2}
                  className="w-full text-sm rounded-xl px-3 py-2 resize-none"
                  style={{
                    background: PALETTE.line,
                    color: PALETTE.fg,
                    border: 'none',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>
        )
      })}

      {/* Body metric */}
      <div
        className="rounded-2xl px-4 py-3 flex flex-col gap-2"
        style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}` }}
      >
        <p className="text-xs font-medium" style={{ color: PALETTE.mute }}>
          Body metrics
        </p>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs" style={{ color: PALETTE.dim }}>
              Weight (lb)
            </label>
            <input
              type="number"
              value={bwValue}
              onChange={e => setBwValue(e.target.value)}
              onBlur={handleBwBlur}
              placeholder="—"
              disabled={future}
              className="w-full text-sm rounded-lg px-2 py-1.5 mt-1"
              style={{
                background: PALETTE.line,
                color: PALETTE.fg,
                border: 'none',
                outline: 'none',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs" style={{ color: PALETTE.dim }}>
              Body fat %
            </label>
            <input
              type="number"
              value={bfValue}
              onChange={e => setBfValue(e.target.value)}
              onBlur={handleBwBlur}
              placeholder="—"
              disabled={future}
              className="w-full text-sm rounded-lg px-2 py-1.5 mt-1"
              style={{
                background: PALETTE.line,
                color: PALETTE.fg,
                border: 'none',
                outline: 'none',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
          </div>
        </div>
      </div>

      {/* Future placeholder for nutrition totals */}
      <div
        className="rounded-2xl px-4 py-3"
        style={{ background: PALETTE.panel, border: `1px dashed ${PALETTE.line}` }}
      >
        <p className="text-xs" style={{ color: PALETTE.mute }}>
          Nutrition — coming in M4
        </p>
      </div>

      {/* Add session / future */}
      {future ? (
        <p className="text-sm text-center" style={{ color: PALETTE.mute }}>
          Future date — no editing
        </p>
      ) : (
        <>
          {showDayPicker ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium" style={{ color: PALETTE.dim }}>
                Add session
              </p>
              {(['push', 'pull', 'legs'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => { setShowDayPicker(false); onAddSession(d) }}
                  className="w-full capitalize font-medium py-3 rounded-2xl text-white"
                  style={{ background: PALETTE[d] }}
                >
                  {d} day
                </button>
              ))}
              <button
                onClick={() => setShowDayPicker(false)}
                className="text-sm py-2"
                style={{ color: PALETTE.mute }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDayPicker(true)}
              className="w-full text-sm font-medium py-3 rounded-2xl"
              style={{ background: PALETTE.line, color: PALETTE.dim }}
            >
              + Add session
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─── RetroSessionView ────────────────────────────────────────────────────────

interface RetroSessionViewProps {
  session: DbSession
  onBack: () => void
}

function RetroSessionView({ session, onBack }: RetroSessionViewProps) {
  const [noteValue, setNoteValue] = useState(session.notes ?? '')

  return (
    <div className="flex flex-col min-h-full">
      <div
        className="flex items-center gap-3 px-4 py-4 border-b"
        style={{ borderColor: PALETTE.line }}
      >
        <button
          onClick={onBack}
          className="text-sm font-medium"
          style={{ minHeight: 44, color: PALETTE.dim }}
        >
          ← Back
        </button>
        <div className="flex-1">
          <p className="text-sm font-medium capitalize" style={{ color: dayAccent(session.day) }}>
            {session.day} day
          </p>
          <p className="text-xs" style={{ color: PALETTE.mute }}>
            {formatFullDate(session.date)}
          </p>
        </div>
      </div>

      <div className="px-4 pt-3">
        <p className="text-xs mb-1" style={{ color: PALETTE.mute }}>
          Session note
        </p>
        <textarea
          value={noteValue}
          onChange={e => setNoteValue(e.target.value)}
          onBlur={() => updateSessionNotes(session.id, noteValue)}
          placeholder="Add a note…"
          rows={2}
          className="w-full text-sm rounded-xl px-3 py-2 resize-none mb-3"
          style={{
            background: PALETTE.line,
            color: PALETTE.fg,
            border: 'none',
            outline: 'none',
          }}
        />
      </div>

      <ExerciseList session={session} />
      <CardioLogger session={session} />
    </div>
  )
}

// ─── Main CalendarView ───────────────────────────────────────────────────────

const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function CalendarView({ onClose, onSessionChanged, initialDate }: CalendarViewProps) {
  const today = todayString()
  const startDate = initialDate ?? today
  const [year, setYear] = useState(() => parseInt(startDate.slice(0, 4)))
  const [month, setMonth] = useState(() => parseInt(startDate.slice(5, 7)))
  const [selectedDate, setSelectedDate] = useState<string | null>(startDate)
  const [loadKey, setLoadKey] = useState(0)
  const [mode, setMode] = useState<'calendar' | 'retroSession'>('calendar')
  const [activeSession, setActiveSession] = useState<DbSession | null>(null)
  const [calendarData, setCalendarData] = useState<CalendarRawData | null>(null)

  useEffect(() => {
    setCalendarData(null)
    loadCalendarData().then(raw => {
      const blockMap = new Map(raw.blocks.map(b => [b.id, b]))
      const exerciseMap = new Map(raw.exercises.map(e => [e.id, e]))
      const sessionMap = new Map(raw.sessions.map(s => [s.id, s]))

      const enrichedSets: SetWithMeta[] = raw.setLogs.flatMap(sl => {
        const block = blockMap.get(sl.blockId)
        const sess = sessionMap.get(sl.sessionId)
        if (!block || !sess) return []
        const exercise = exerciseMap.get(block.exerciseId)
        if (!exercise) return []
        return [{
          id: sl.id,
          blockId: sl.blockId,
          exerciseId: block.exerciseId,
          date: sess.date,
          sessionId: sl.sessionId,
          weightLb: sl.weightLb,
          reps: sl.reps,
          isBodyweight: exercise.isBodyweight,
          bodyweightLb: exercise.isBodyweight
            ? bodyweightAtDate(raw.bodyMetrics, sess.date)
            : 0,
        }]
      })

      const prDates = computePRDates(enrichedSets)

      setCalendarData({ ...raw, prDates, enrichedSets })
    })
  }, [loadKey])

  const dayCells = useMemo(
    () => buildDayCells(year, month, calendarData),
    [year, month, calendarData],
  )

  const selectedDayData = useMemo(() => {
    if (!selectedDate || !calendarData) return null
    return deriveDayData(selectedDate, calendarData)
  }, [selectedDate, calendarData])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const handleAddSession = useCallback(
    async (day: 'push' | 'pull' | 'legs') => {
      if (!selectedDate) return
      const sess = await createSessionForDate(day, selectedDate)
      setActiveSession(sess)
      setMode('retroSession')
    },
    [selectedDate],
  )

  const handleEditSession = useCallback((sess: DbSession) => {
    setActiveSession(sess)
    setMode('retroSession')
  }, [])

  const handleDeleteSession = useCallback(async (sess: DbSession) => {
    const sets = await getSetsForSession(sess.id)
    const cardio = await getCardioForSession(sess.id)
    const hasData = sets.length > 0 || cardio.length > 0
    if (hasData) {
      const ok = window.confirm('Delete this session and all its sets?')
      if (!ok) return
    }
    await Promise.all([
      ...sets.map(s => deleteSet(s.id)),
      ...cardio.map(c => deleteCardio(c.id)),
    ])
    await deleteSession(sess.id)
    setLoadKey(k => k + 1)
    onSessionChanged?.()
  }, [onSessionChanged])

  function handleRetroBack() {
    setMode('calendar')
    setActiveSession(null)
    setLoadKey(k => k + 1)
    onSessionChanged?.()
  }

  function handleBodyMetricChange() {
    setLoadKey(k => k + 1)
  }

  function handleNoteBlur(sessionId: string, notes: string) {
    updateSessionNotes(sessionId, notes)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: PALETTE.ink }}
    >
      {mode === 'retroSession' && activeSession ? (
        <div className="flex-1 overflow-y-auto">
          <RetroSessionView session={activeSession} onBack={handleRetroBack} />
        </div>
      ) : (
        <>
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 border-b"
            style={{ borderColor: BORDER.subtle, paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: 16, background: SURFACE.elevated }}
          >
            <h1 className="text-base font-medium" style={{ color: PALETTE.fg }}>
              Training calendar
            </h1>
            <button
              onClick={onClose}
              className="text-lg"
              style={{ minWidth: 44, minHeight: 44, color: PALETTE.mute, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Month navigation */}
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={prevMonth}
                className="text-lg"
                style={{ minWidth: 44, minHeight: 44, color: PALETTE.dim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ←
              </button>
              <span className="text-sm font-medium" style={{ color: PALETTE.fg }}>
                {MONTH_NAMES[month - 1]} {year}
              </span>
              <button
                onClick={nextMonth}
                className="text-lg"
                style={{ minWidth: 44, minHeight: 44, color: PALETTE.dim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                →
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 px-2">
              {DAY_HEADERS.map((h, i) => (
                <div
                  key={i}
                  className="text-center text-xs py-1"
                  style={{ color: PALETTE.mute }}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 px-2 gap-0.5">
              {dayCells.map((cell, i) => {
                if (!cell) {
                  return <div key={`empty-${i}`} style={{ aspectRatio: '1/1' }} />
                }

                const future = isFuture(cell.date, today)
                const isToday = cell.date === today
                const isSelected = cell.date === selectedDate
                const primarySession = cell.sessions[0]
                const accent = primarySession ? dayAccent(primarySession.day) : PALETTE.push

                let bg = 'transparent'
                let textColor: string = future ? PALETTE.mute : PALETTE.fg
                let borderStyle = 'none'

                if (isSelected) {
                  bg = primarySession ? accent : PALETTE.push
                  textColor = PALETTE.plate
                } else if (primarySession) {
                  bg = `${accent}33`
                }

                if (isToday && !isSelected) {
                  borderStyle = `2px solid ${PALETTE.dim}`
                }

                return (
                  <button
                    key={cell.date}
                    onClick={() => !future && setSelectedDate(cell.date)}
                    disabled={future}
                    style={{
                      aspectRatio: '1/1',
                      background: bg,
                      border: borderStyle,
                      borderRadius: 8,
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: future ? 'default' : 'pointer',
                    }}
                  >
                    <span
                      className="text-sm"
                      style={{ color: textColor, fontVariantNumeric: 'tabular-nums' }}
                    >
                      {cell.dayNum}
                    </span>

                    {/* PR star */}
                    {cell.hasPR && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: 3,
                          fontSize: 9,
                          color: PALETTE.pr,
                          lineHeight: 1,
                        }}
                      >
                        ★
                      </span>
                    )}

                    {/* Session dots (2+ sessions) or extra-data dot */}
                    <div className="flex gap-0.5 mt-0.5" style={{ minHeight: 5 }}>
                      {cell.sessions.length >= 2
                        ? cell.sessions.slice(0, 3).map((s, idx) => (
                            <span
                              key={idx}
                              style={{
                                width: 4,
                                height: 4,
                                borderRadius: '50%',
                                background: dayAccent(s.day),
                                display: 'inline-block',
                              }}
                            />
                          ))
                        : cell.hasExtraData && (
                            <span
                              style={{
                                width: 4,
                                height: 4,
                                borderRadius: '50%',
                                background: isSelected ? 'rgba(255,255,255,0.6)' : PALETTE.dim,
                                display: 'inline-block',
                              }}
                            />
                          )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Day detail */}
            {selectedDate && (
              <div className="mt-2 border-t" style={{ borderColor: PALETTE.line }}>
                {selectedDayData ? (
                  <DayDetailPanel
                    dayData={selectedDayData}
                    today={today}
                    onAddSession={handleAddSession}
                    onEditSession={handleEditSession}
                    onDeleteSession={handleDeleteSession}
                    onBodyMetricChange={handleBodyMetricChange}
                    onNoteBlur={handleNoteBlur}
                  />
                ) : (
                  <div className="px-4 py-6 text-center" style={{ color: PALETTE.mute }}>
                    Loading…
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
