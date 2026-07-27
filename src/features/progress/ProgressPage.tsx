import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from 'recharts'
import type { DbExercise, DbSession, DbSetLog, DbBodyMetric, DbCardioLog } from '../../data/db'
import {
  getAllExercises,
  getAllSetsForExercise,
  getAllSessionsOrdered,
  getAllBodyMetrics,
  getAllCardioLogs,
} from '../../data/repo'
import { epley1RM, effectiveLoad } from '../../domain/metrics'
import { computeExercisePRHistory } from '../../domain/records'
import type { SetWithMeta } from '../../domain/records'
import { PALETTE, dayAccent } from '../../ui/tokens'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function bodyweightAtDate(metrics: DbBodyMetric[], date: string): number {
  let bw = 0
  for (const m of metrics) {
    if (m.date <= date) bw = m.weightLb
    else break
  }
  return bw
}

// ISO-week Monday for a date string (used to aggregate volume per week)
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay() // 0=Sun
  const offset = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

// ─── Range helpers ────────────────────────────────────────────────────────────

type Range = 'month' | 'year' | 'all'

function rangeStart(range: Range): string | null {
  const today = new Date()
  if (range === 'month') {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  }
  if (range === 'year') return `${today.getFullYear()}-01-01`
  return null
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
      <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 4, lineHeight: 1.2 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: accent, lineHeight: 1.2 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: PALETTE.dim, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{sub}</p>}
    </div>
  )
}

// ─── Streak computation ───────────────────────────────────────────────────────

function computeDailyStreak(dates: string[], tolerance = 2): { current: number; longest: number } {
  const unique = [...new Set(dates)].sort()
  if (unique.length === 0) return { current: 0, longest: 0 }

  let longest = 1
  let run = 1
  for (let i = 1; i < unique.length; i++) {
    const gap =
      Math.round(
        (new Date(unique[i] + 'T00:00:00').getTime() - new Date(unique[i - 1] + 'T00:00:00').getTime()) /
          86400000,
      ) - 1
    if (gap <= tolerance) {
      run++
      if (run > longest) longest = run
    } else {
      run = 1
    }
  }

  // Current streak — walk backward from last date
  const today = todayStr()
  const last = unique[unique.length - 1]
  const daysSinceLast = Math.round(
    (new Date(today + 'T00:00:00').getTime() - new Date(last + 'T00:00:00').getTime()) / 86400000,
  )
  if (daysSinceLast > tolerance + 1) return { current: 0, longest }

  let current = 1
  for (let i = unique.length - 2; i >= 0; i--) {
    const gap =
      Math.round(
        (new Date(unique[i + 1] + 'T00:00:00').getTime() - new Date(unique[i] + 'T00:00:00').getTime()) /
          86400000,
      ) - 1
    if (gap <= tolerance) current++
    else break
  }
  return { current, longest }
}

function computeWeeklyStreak(dates: string[], minSessions = 3): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 }

  const weekCount = new Map<string, number>()
  for (const d of dates) {
    const w = mondayOf(d)
    weekCount.set(w, (weekCount.get(w) ?? 0) + 1)
  }

  const qualWeeks = [...weekCount.entries()]
    .filter(([, c]) => c >= minSessions)
    .map(([w]) => w)
    .sort()

  if (qualWeeks.length === 0) return { current: 0, longest: 0 }

  let longest = 1
  let run = 1
  for (let i = 1; i < qualWeeks.length; i++) {
    const gapWeeks = Math.round(
      (new Date(qualWeeks[i] + 'T00:00:00').getTime() - new Date(qualWeeks[i - 1] + 'T00:00:00').getTime()) /
        (7 * 86400000),
    )
    if (gapWeeks === 1) {
      run++
      if (run > longest) longest = run
    } else {
      run = 1
    }
  }

  const thisMonday = mondayOf(todayStr())
  const prevMonday = (() => {
    const d = new Date(thisMonday + 'T00:00:00')
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })()

  const lastQ = qualWeeks[qualWeeks.length - 1]
  let current = 0
  if (lastQ === thisMonday || lastQ === prevMonday) {
    current = 1
    for (let i = qualWeeks.length - 2; i >= 0; i--) {
      const gap = Math.round(
        (new Date(qualWeeks[i + 1] + 'T00:00:00').getTime() -
          new Date(qualWeeks[i] + 'T00:00:00').getTime()) /
          (7 * 86400000),
      )
      if (gap === 1) current++
      else break
    }
  }

  return { current, longest }
}

// ─── Compact Heatmap ─────────────────────────────────────────────────────────

interface HeatmapProps {
  sessions: DbSession[]
  cardioLogs: DbCardioLog[]
  year: number
  onYearChange: (y: number) => void
}

const CARDIO_PURPLE = '#8b5cf6'
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW_LABELS = ['M', '', 'W', '', 'F', '', '']

function buildYearGrid(year: number): { date: string; inYear: boolean }[][] {
  // columns = weeks; rows = Mon(0)…Sun(6)
  const jan1 = new Date(year, 0, 1)
  const jan1Dow = jan1.getDay() // 0=Sun
  // Monday on or before Jan 1
  const firstMonday = new Date(jan1)
  firstMonday.setDate(1 - (jan1Dow === 0 ? 6 : jan1Dow - 1))

  const dec31 = new Date(year, 11, 31)
  const dec31Dow = dec31.getDay()
  // Sunday on or after Dec 31
  const lastSunday = new Date(dec31)
  lastSunday.setDate(31 + (dec31Dow === 0 ? 0 : 7 - dec31Dow))

  const totalDays =
    Math.round((lastSunday.getTime() - firstMonday.getTime()) / 86400000) + 1
  const numWeeks = totalDays / 7

  const cols: { date: string; inYear: boolean }[][] = []
  const cursor = new Date(firstMonday)

  for (let w = 0; w < numWeeks; w++) {
    const col: { date: string; inYear: boolean }[] = []
    for (let d = 0; d < 7; d++) {
      const iso = cursor.toISOString().slice(0, 10)
      col.push({ date: iso, inYear: cursor.getFullYear() === year })
      cursor.setDate(cursor.getDate() + 1)
    }
    cols.push(col)
  }
  return cols
}

// Column index where each month's label should appear (first date in that month)
function monthLabelCols(cols: { date: string; inYear: boolean }[][]): Map<number, string> {
  const map = new Map<number, string>()
  let lastMonth = -1
  for (let ci = 0; ci < cols.length; ci++) {
    for (const cell of cols[ci]) {
      if (!cell.inYear) continue
      const m = parseInt(cell.date.slice(5, 7)) - 1
      if (m !== lastMonth) {
        map.set(ci, MONTH_ABBR[m])
        lastMonth = m
      }
      break
    }
  }
  return map
}

function Heatmap({ sessions, cardioLogs, year, onYearChange }: HeatmapProps) {
  const [tooltipDate, setTooltipDate] = useState<string | null>(null)
  const today = todayStr()
  const currentYear = new Date().getFullYear()

  const sessionMap = useMemo(() => {
    const m = new Map<string, 'push' | 'pull' | 'legs'>()
    for (const s of sessions) m.set(s.date, s.day)
    return m
  }, [sessions])

  // For cardio-only days (no lifting session): we need cardio without a matching session
  const cardioSessionIds = useMemo(() => {
    const m = new Map<string, string>() // sessionId → date
    for (const s of sessions) m.set(s.id, s.date)
    return m
  }, [sessions])

  const cardioDates = useMemo(() => {
    const s = new Set<string>()
    for (const c of cardioLogs) {
      const date = cardioSessionIds.get(c.sessionId)
      if (date) s.add(date)
    }
    return s
  }, [cardioLogs, cardioSessionIds])

  const cols = useMemo(() => buildYearGrid(year), [year])
  const monthLabels = useMemo(() => monthLabelCols(cols), [cols])

  const numWeeks = cols.length
  const cellSize = 5
  const gap = 1
  const labelW = 14
  const gridW = numWeeks * cellSize + (numWeeks - 1) * gap

  // Session info for tooltip
  const sessionByDate = useMemo(() => {
    const m = new Map<string, DbSession[]>()
    for (const s of sessions) {
      const arr = m.get(s.date) ?? []
      arr.push(s)
      m.set(s.date, arr)
    }
    return m
  }, [sessions])

  // Stats for selected year
  const yearSessions = useMemo(
    () => sessions.filter(s => s.date.startsWith(String(year))),
    [sessions, year],
  )
  const yearDates = yearSessions.map(s => s.date)
  const daysElapsed = year < currentYear
    ? 365 + (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 1 : 0)
    : Math.min(
        parseInt(today.slice(5, 7)) * 30 + parseInt(today.slice(8, 10)),
        365,
      )

  const uniqueTrainingDays = new Set(yearDates).size
  const pct = daysElapsed > 0 ? Math.round((uniqueTrainingDays / daysElapsed) * 100) : 0
  const sessionsPerWeek = daysElapsed > 0 ? (yearSessions.length / (daysElapsed / 7)).toFixed(1) : '0'
  const dailyStreak = useMemo(() => computeDailyStreak(yearDates), [yearDates])
  const weeklyStreak = useMemo(() => computeWeeklyStreak(yearDates), [yearDates])

  function tooltipLabel(date: string): string {
    const dt = new Date(date + 'T00:00:00')
    const dayName = dt.toLocaleDateString('en-US', { weekday: 'long' })
    const fullDate = dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const daySessions = sessionByDate.get(date) ?? []
    const hasCardio = cardioDates.has(date)

    if (daySessions.length === 0 && !hasCardio) return `${dayName}, ${fullDate}`

    const parts: string[] = []
    for (const s of daySessions) {
      const dayLabel = s.day.charAt(0).toUpperCase() + s.day.slice(1)
      parts.push(dayLabel + ' day')
    }
    if (hasCardio) parts.push('Cardio')
    return `${parts.join(' · ')} · ${dayName}, ${fullDate}`
  }

  return (
    <div>
      {/* Year navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button
          onClick={() => onYearChange(year - 1)}
          style={{ minWidth: 36, minHeight: 36, color: PALETTE.dim, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
          aria-label="previous year"
        >
          ‹
        </button>
        <span style={{ fontSize: 13, color: PALETTE.dim }}>{year}</span>
        <button
          onClick={() => onYearChange(Math.min(year + 1, currentYear))}
          disabled={year >= currentYear}
          style={{ minWidth: 36, minHeight: 36, color: year >= currentYear ? PALETTE.line : PALETTE.dim, background: 'none', border: 'none', fontSize: 18, cursor: year >= currentYear ? 'default' : 'pointer' }}
          aria-label="next year"
        >
          ›
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'inline-block', minWidth: labelW + gridW }}>
          {/* Month labels row */}
          <div style={{ display: 'flex', marginLeft: labelW, marginBottom: 2, height: 12 }}>
            {cols.map((_, ci) => (
              <div
                key={ci}
                style={{ width: cellSize, marginRight: ci < cols.length - 1 ? gap : 0, flexShrink: 0, fontSize: 9, color: PALETTE.mute, lineHeight: 1 }}
              >
                {monthLabels.get(ci) ?? ''}
              </div>
            ))}
          </div>

          {/* Grid rows (Mon=0 … Sun=6) */}
          <div style={{ display: 'flex' }}>
            {/* Weekday labels */}
            <div style={{ width: labelW, display: 'flex', flexDirection: 'column', gap, marginRight: 0 }}>
              {DOW_LABELS.map((label, ri) => (
                <div key={ri} style={{ height: cellSize, fontSize: 8, color: PALETTE.mute, lineHeight: `${cellSize}px`, textAlign: 'right', paddingRight: 2 }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Week columns */}
            <div style={{ display: 'flex', gap }}>
              {cols.map((col, ci) => (
                <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap }}>
                  {col.map(({ date, inYear }) => {
                    const dayType = sessionMap.get(date)
                    const hasCardio = cardioDates.has(date)
                    const isToday = date === today
                    const isFuture = date > today

                    let bg: string
                    if (!inYear || isFuture) bg = 'transparent'
                    else if (dayType) bg = dayAccent(dayType)
                    else bg = PALETTE.line

                    return (
                      <div
                        key={date}
                        onClick={() => setTooltipDate(tooltipDate === date ? null : date)}
                        title={tooltipDate === date ? undefined : tooltipLabel(date)}
                        style={{
                          width: cellSize,
                          height: cellSize,
                          borderRadius: 1,
                          backgroundColor: bg,
                          cursor: inYear && !isFuture ? 'pointer' : 'default',
                          boxShadow: hasCardio && inYear && !isFuture
                            ? `inset 0 0 0 1.5px ${CARDIO_PURPLE}`
                            : isToday
                              ? `0 0 0 1px ${PALETTE.fg}`
                              : undefined,
                          outline: isToday ? `1px solid ${PALETTE.fg}` : undefined,
                          outlineOffset: isToday ? 1 : undefined,
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Tooltip for tapped cell */}
          {tooltipDate && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 12px',
                background: PALETTE.panel,
                border: `1px solid ${PALETTE.line}`,
                borderRadius: 8,
                fontSize: 12,
                color: PALETTE.fg,
              }}
            >
              {tooltipLabel(tooltipDate)}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        {(['push', 'pull', 'legs'] as const).map(d => (
          <span key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: PALETTE.dim }}>
            <span style={{ width: 8, height: 8, borderRadius: 1, backgroundColor: dayAccent(d), display: 'inline-block' }} />
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: PALETTE.dim }}>
          <span style={{ width: 8, height: 8, borderRadius: 1, backgroundColor: PALETTE.line, boxShadow: `inset 0 0 0 1.5px ${CARDIO_PURPLE}`, display: 'inline-block' }} />
          Cardio
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>
        <StatCard label={`Days trained (${pct}%)`} value={String(uniqueTrainingDays)} accent={PALETTE.dim} />
        <StatCard label="Sessions / week" value={sessionsPerWeek} accent={PALETTE.dim} />
        <StatCard
          label="Current streak"
          value={`${dailyStreak.current} days`}
          sub={`${weeklyStreak.current} wks on programme`}
          accent={PALETTE.dim}
        />
        <StatCard
          label="Longest streak"
          value={`${dailyStreak.longest} days`}
          sub={`${weeklyStreak.longest} wks best`}
          accent={PALETTE.dim}
        />
      </div>
    </div>
  )
}

// ─── ProgressPage ─────────────────────────────────────────────────────────────

const SELECTED_EX_KEY = 'progress-selected-exercise'

interface ChartPoint {
  date: string
  e1rm?: number
  runningBest?: number
  volume?: number
}

export function ProgressPage() {
  const [exercises, setExercises] = useState<DbExercise[]>([])
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(SELECTED_EX_KEY) ?? '')
  const [exerciseSets, setExerciseSets] = useState<(DbSetLog & { date: string; day: string })[]>([])
  const [sessions, setSessions] = useState<DbSession[]>([])
  const [cardioLogs, setCardioLogs] = useState<DbCardioLog[]>([])
  const [bodyMetrics, setBodyMetrics] = useState<DbBodyMetric[]>([])
  const [range, setRange] = useState<Range>('all')
  const [rangeInitialized, setRangeInitialized] = useState(false)
  const [heatmapYear, setHeatmapYear] = useState(() => new Date().getFullYear())

  useEffect(() => {
    Promise.all([
      getAllExercises(),
      getAllSessionsOrdered(),
      getAllBodyMetrics(),
      getAllCardioLogs(),
    ]).then(([exs, sess, bm, cl]) => {
      setExercises(exs)
      setSessions(sess)
      setBodyMetrics(bm)
      setCardioLogs(cl)
    })
  }, [])

  // Default range: 'year' if data spans >1 year, else 'all'
  useEffect(() => {
    if (rangeInitialized || sessions.length < 2) return
    const first = sessions[0].date
    const last = sessions[sessions.length - 1].date
    const diffYears =
      (new Date(last + 'T00:00:00').getTime() - new Date(first + 'T00:00:00').getTime()) /
      (365.25 * 24 * 3600 * 1000)
    if (diffYears > 1) setRange('year')
    setRangeInitialized(true)
  }, [sessions, rangeInitialized])

  const loadSets = useCallback((id: string) => {
    if (!id) { setExerciseSets([]); return }
    getAllSetsForExercise(id).then(setExerciseSets)
  }, [])

  useEffect(() => { loadSets(selectedId) }, [selectedId, loadSets])

  function handleSelectExercise(id: string) {
    setSelectedId(id)
    localStorage.setItem(SELECTED_EX_KEY, id)
  }

  const selectedExercise = useMemo(
    () => exercises.find(e => e.id === selectedId) ?? null,
    [exercises, selectedId],
  )

  const accent = selectedExercise ? dayAccent(selectedExercise.day) : PALETTE.fg

  // Filter sets by range
  const start = rangeStart(range)
  const filteredSets = useMemo(
    () => (start ? exerciseSets.filter(s => s.date >= start) : exerciseSets),
    [exerciseSets, start],
  )

  // PR history (all time — PRs don't reset per range)
  const prHistory = useMemo(() => {
    if (!selectedExercise || exerciseSets.length === 0) return new Map<string, { bestE1RM: number }>()
    const meta: SetWithMeta[] = exerciseSets.map(s => ({
      id: s.id, blockId: s.blockId, exerciseId: selectedId,
      date: s.date, sessionId: s.sessionId,
      weightLb: s.weightLb, reps: s.reps,
      isBodyweight: selectedExercise.isBodyweight,
      bodyweightLb: selectedExercise.isBodyweight ? bodyweightAtDate(bodyMetrics, s.date) : 0,
    }))
    return computeExercisePRHistory(meta)
  }, [selectedExercise, selectedId, exerciseSets, bodyMetrics])

  // e1RM per session (all time, for running best computation)
  const allSessionE1rm = useMemo(() => {
    if (!selectedExercise || exerciseSets.length === 0) return new Map<string, number>()
    const byDate = new Map<string, typeof exerciseSets>()
    for (const s of exerciseSets) {
      const arr = byDate.get(s.date) ?? []
      arr.push(s)
      byDate.set(s.date, arr)
    }
    const result = new Map<string, number>()
    let runningMax = 0
    for (const date of [...byDate.keys()].sort()) {
      const bw = bodyweightAtDate(bodyMetrics, date)
      let maxE1RM = 0
      for (const s of byDate.get(date)!) {
        const eff = effectiveLoad(s.weightLb, selectedExercise.isBodyweight, bw)
        maxE1RM = Math.max(maxE1RM, epley1RM(eff, s.reps))
      }
      runningMax = Math.max(runningMax, maxE1RM)
      result.set(date, runningMax)
    }
    return result
  }, [selectedExercise, exerciseSets, bodyMetrics])

  // Chart data — derived from filteredSets
  const { chartData, stats } = useMemo(() => {
    if (!selectedExercise || filteredSets.length === 0) {
      return { chartData: [] as ChartPoint[], stats: null }
    }

    const byDate = new Map<string, typeof filteredSets>()
    for (const s of filteredSets) {
      const arr = byDate.get(s.date) ?? []
      arr.push(s)
      byDate.set(s.date, arr)
    }
    const sortedDates = [...byDate.keys()].sort()

    // e1RM per session date
    const sessionPoints = new Map<string, { e1rm: number; runningBest: number }>()
    let allTimeBest = 0
    for (const date of sortedDates) {
      const bw = bodyweightAtDate(bodyMetrics, date)
      let maxE1RM = 0
      for (const s of byDate.get(date)!) {
        const eff = effectiveLoad(s.weightLb, selectedExercise.isBodyweight, bw)
        maxE1RM = Math.max(maxE1RM, epley1RM(eff, s.reps))
      }
      const rounded = Math.round(maxE1RM * 10) / 10
      const runningBest = allSessionE1rm.get(date) ?? rounded
      allTimeBest = Math.max(allTimeBest, runningBest)
      sessionPoints.set(date, { e1rm: rounded, runningBest: Math.round(runningBest * 10) / 10 })
    }

    // Volume aggregation — per session for month, per week for year/all
    const volumePoints = new Map<string, number>()
    const volumeLabel = range === 'month' ? 'volume load per session' : 'volume load per week'
    for (const date of sortedDates) {
      const bw = bodyweightAtDate(bodyMetrics, date)
      let vol = 0
      for (const s of byDate.get(date)!) {
        const eff = effectiveLoad(s.weightLb, selectedExercise.isBodyweight, bw)
        vol += eff * s.reps
      }
      const key = range === 'month' ? date : mondayOf(date)
      volumePoints.set(key, (volumePoints.get(key) ?? 0) + Math.round(vol))
    }

    // Merge into combined chart array
    const combined = new Map<string, ChartPoint>()
    for (const [date, { e1rm, runningBest }] of sessionPoints) {
      combined.set(date, { date, e1rm, runningBest })
    }
    for (const [date, volume] of volumePoints) {
      const ex = combined.get(date)
      if (ex) ex.volume = volume
      else combined.set(date, { date, volume })
    }
    const chartData = [...combined.values()].sort((a, b) => a.date.localeCompare(b.date))

    // Stats
    const lastDate = sortedDates[sortedDates.length - 1]
    const firstDate = sortedDates[0]
    const lastE1RM = sessionPoints.get(lastDate)!.e1rm
    const firstE1RM = sessionPoints.get(firstDate)!.e1rm
    const changeAbs = lastE1RM - firstE1RM
    const changePct = firstE1RM > 0 ? (changeAbs / firstE1RM) * 100 : 0

    const lastSets = byDate.get(lastDate)!
    const bwLast = bodyweightAtDate(bodyMetrics, lastDate)
    const topSet = lastSets.reduce((best, s) => {
      const eff = effectiveLoad(s.weightLb, selectedExercise.isBodyweight, bwLast)
      const bestEff = effectiveLoad(best.weightLb, selectedExercise.isBodyweight, bwLast)
      return eff > bestEff ? s : best
    }, lastSets[0])

    return {
      chartData,
      stats: {
        currentE1RM: lastE1RM,
        firstE1RM,
        changeAbs,
        changePct,
        allTimeBest: Math.round(allTimeBest * 10) / 10,
        topSetWeight: topSet.weightLb,
        topSetReps: topSet.reps,
        sessionsInRange: sortedDates.length,
        volumeLabel,
      },
    }
  }, [selectedExercise, filteredSets, bodyMetrics, allSessionE1rm, range])

  const e1rmValues = chartData.filter(d => d.e1rm !== undefined).map(d => d.e1rm as number)
  const runningBestValues = chartData.filter(d => d.runningBest !== undefined).map(d => d.runningBest as number)
  const allE1rmValues = [...e1rmValues, ...runningBestValues]

  const e1rmDomain = useMemo((): [number, number] => {
    if (allE1rmValues.length === 0) return [0, 100]
    const min = Math.min(...allE1rmValues)
    const max = Math.max(...allE1rmValues)
    const pad = Math.max((max - min) * 0.15, 15)
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [allE1rmValues])

  const volumeValues = chartData.filter(d => d.volume !== undefined).map(d => d.volume as number)
  const volumeDomain = useMemo((): [number, number] => {
    if (volumeValues.length === 0) return [0, 1000]
    return [0, Math.ceil(Math.max(...volumeValues) * 1.15)]
  }, [volumeValues])

  const firstE1rmInRange = chartData.find(d => d.e1rm !== undefined)?.e1rm

  const pushEx = exercises.filter(e => e.day === 'push')
  const pullEx = exercises.filter(e => e.day === 'pull')
  const legsEx = exercises.filter(e => e.day === 'legs')

  const tooltipStyle = {
    contentStyle: {
      background: PALETTE.panel,
      border: `1px solid ${PALETTE.line}`,
      borderRadius: 4,
      fontSize: 12,
      color: PALETTE.fg,
    },
  }

  const prDots = useMemo(() => {
    if (!chartData.length) return []
    return [...prHistory.entries()]
      .filter(([date]) => !start || date >= start)
      .map(([date, pr]) => ({ date, e1rm: Math.round(pr.bestE1RM * 10) / 10 }))
  }, [prHistory, chartData, start])

  return (
    <div style={{ padding: '24px 16px 16px', color: PALETTE.fg }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Progress</h1>

      {/* Exercise selector */}
      <section style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: PALETTE.dim, display: 'block', marginBottom: 6 }}>
          Exercise
        </label>
        <select
          value={selectedId}
          onChange={e => handleSelectExercise(e.target.value)}
          style={{ width: '100%', background: PALETTE.panel, color: PALETTE.fg, border: `1px solid ${PALETTE.line}`, borderRadius: 6, padding: '10px 12px', fontSize: 15, outline: 'none' }}
        >
          <option value="">Choose an exercise…</option>
          {pushEx.length > 0 && (
            <optgroup label="Push">
              {pushEx.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </optgroup>
          )}
          {pullEx.length > 0 && (
            <optgroup label="Pull">
              {pullEx.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </optgroup>
          )}
          {legsEx.length > 0 && (
            <optgroup label="Legs">
              {legsEx.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </optgroup>
          )}
        </select>
      </section>

      {/* Time range */}
      {selectedExercise && (
        <section style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {(['month', 'year', 'all'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: range === r ? 500 : 400,
                background: range === r ? accent : PALETTE.panel,
                color: range === r ? '#fff' : PALETTE.dim,
                border: `1px solid ${range === r ? accent : PALETTE.line}`,
                cursor: 'pointer',
              }}
            >
              {r === 'month' ? 'This month' : r === 'year' ? 'This year' : 'All time'}
            </button>
          ))}
        </section>
      )}

      {/* Exercise analysis */}
      {selectedExercise && filteredSets.length === 0 && (
        <p style={{ color: PALETTE.mute, fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
          {exerciseSets.length === 0
            ? 'Log your first set to see progress.'
            : 'No sessions in this range.'}
        </p>
      )}

      {selectedExercise && chartData.length > 0 && stats && (
        <>
          {/* Summary stats — 5 cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 20 }}>
            <StatCard label="Current e1RM" value={`${stats.currentE1RM.toFixed(1)} lb`} accent={accent} />
            <StatCard
              label={`Change (${range === 'month' ? 'month' : range === 'year' ? 'year' : 'all time'})`}
              value={`${stats.changeAbs >= 0 ? '+' : ''}${stats.changeAbs.toFixed(1)} lb`}
              sub={`${stats.changePct >= 0 ? '+' : ''}${stats.changePct.toFixed(1)}%`}
              accent={stats.changeAbs >= 0 ? accent : PALETTE.mute}
            />
            <StatCard label="All-time best e1RM" value={`${stats.allTimeBest.toFixed(1)} lb`} accent={PALETTE.pr} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 24 }}>
            <StatCard
              label="Top set"
              value={`${stats.topSetWeight} lb × ${stats.topSetReps}`}
              accent={accent}
            />
            <StatCard label="Sessions in range" value={String(stats.sessionsInRange)} accent={PALETTE.dim} />
          </div>

          {/* Dual-axis chart: volume bars (right) + e1RM line + running best dashed (left) */}
          <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 4 }}>
            Estimated 1RM &amp; {stats.volumeLabel}
          </p>
          <div style={{ marginBottom: 28 }}>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 40, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fill: PALETTE.mute, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: PALETTE.line }}
                  interval="preserveStartEnd"
                />
                {/* Left axis: e1RM */}
                <YAxis
                  yAxisId="e1rm"
                  domain={e1rmDomain}
                  tick={{ fill: PALETTE.mute, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                {/* Right axis: volume */}
                <YAxis
                  yAxisId="vol"
                  orientation="right"
                  domain={volumeDomain}
                  tick={{ fill: PALETTE.mute, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${Math.round((v as number) / 1000)}k`}
                />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(label: unknown) =>
                    typeof label === 'string' ? fmtDate(label) : String(label ?? '')
                  }
                  formatter={(v: unknown, name: unknown) => {
                    if (name === 'e1rm') return [`${(v as number).toFixed(1)} lb`, 'e1RM']
                    if (name === 'runningBest') return [`${(v as number).toFixed(1)} lb`, 'Best e1RM']
                    return [`${(v as number).toLocaleString()} lb`, 'Volume']
                  }}
                />
                {/* Volume bars — behind the lines */}
                <Bar
                  yAxisId="vol"
                  dataKey="volume"
                  fill={PALETTE.mute}
                  opacity={0.4}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
                {/* Baseline reference at first e1RM in range */}
                {firstE1rmInRange !== undefined && (
                  <ReferenceLine
                    yAxisId="e1rm"
                    y={firstE1rmInRange}
                    stroke={PALETTE.mute}
                    strokeDasharray="4 2"
                    opacity={0.5}
                  />
                )}
                {/* Running best — dashed, same color, lower opacity */}
                <Line
                  yAxisId="e1rm"
                  type="monotone"
                  dataKey="runningBest"
                  stroke={accent}
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  opacity={0.5}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  connectNulls
                />
                {/* e1RM solid line */}
                <Line
                  yAxisId="e1rm"
                  type="monotone"
                  dataKey="e1rm"
                  stroke={accent}
                  strokeWidth={2}
                  dot={{ r: chartData.length === 1 ? 5 : 3, fill: accent, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  connectNulls
                />
                {/* PR gold dots */}
                {prDots.map(({ date, e1rm }) => (
                  <ReferenceDot
                    key={date}
                    yAxisId="e1rm"
                    x={date}
                    y={e1rm}
                    r={5}
                    fill={PALETTE.pr}
                    stroke={PALETTE.panel}
                    strokeWidth={2}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Compact heatmap — shown always */}
      <section style={{ marginTop: selectedExercise && chartData.length > 0 ? 8 : 0 }}>
        <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 8 }}>Training history</p>
        <Heatmap
          sessions={sessions}
          cardioLogs={cardioLogs}
          year={heatmapYear}
          onYearChange={setHeatmapYear}
        />
      </section>
    </div>
  )
}
