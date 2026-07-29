import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
import { PALETTE, SURFACE, BORDER, dayAccent } from '../../ui/tokens'

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

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay()
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
    <div style={{ background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
      <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 4, lineHeight: 1.2 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: accent, lineHeight: 1.2 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: PALETTE.dim, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{sub}</p>}
    </div>
  )
}

function fmtVolume(v: number): string {
  if (v === 0) return '0'
  if (v >= 10000) {
    const k = v / 1000
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`
  }
  return v.toLocaleString()
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

// ─── Heatmap (Anki-style) ────────────────────────────────────────────────────

type HeatView = 'quarter' | 'year'

interface HeatmapProps {
  sessions: DbSession[]
  cardioLogs: DbCardioLog[]
  onOpenDate?: (date: string) => void
}

const CARDIO_PURPLE = '#8b5cf6'
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW_LABELS = ['M', '', 'W', '', 'F', '', '']
const QUARTER_WEEKS = 13
const CELL_Q = 13
const CELL_Y = 5
const GAP = 2

type GridCell = { date: string; inRange: boolean }

function getQuarter(date: string): 1 | 2 | 3 | 4 {
  const m = parseInt(date.slice(5, 7))
  return Math.ceil(m / 3) as 1 | 2 | 3 | 4
}

function quarterFirstMonday(year: number, quarter: 1 | 2 | 3 | 4): Date {
  const month = (quarter - 1) * 3
  const d = new Date(year, month, 1)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d
}

function buildQuarterGrid(year: number, quarter: 1 | 2 | 3 | 4): GridCell[][] {
  const qStartMonth = (quarter - 1) * 3
  const qEndMonth = qStartMonth + 2
  const startDate = `${year}-${String(qStartMonth + 1).padStart(2, '0')}-01`
  const endDate = new Date(year, qEndMonth + 1, 0).toISOString().slice(0, 10)

  const cursor = new Date(quarterFirstMonday(year, quarter))
  const cols: GridCell[][] = []

  for (let w = 0; w < QUARTER_WEEKS; w++) {
    const col: GridCell[] = []
    for (let d = 0; d < 7; d++) {
      const iso = cursor.toISOString().slice(0, 10)
      col.push({ date: iso, inRange: iso >= startDate && iso <= endDate })
      cursor.setDate(cursor.getDate() + 1)
    }
    cols.push(col)
  }
  return cols
}

function buildYearGrid(year: number): GridCell[][] {
  const jan1 = new Date(year, 0, 1)
  const jan1Dow = jan1.getDay()
  const firstMonday = new Date(jan1)
  firstMonday.setDate(1 - (jan1Dow === 0 ? 6 : jan1Dow - 1))

  const dec31 = new Date(year, 11, 31)
  const dec31Dow = dec31.getDay()
  const lastSunday = new Date(dec31)
  lastSunday.setDate(31 + (dec31Dow === 0 ? 0 : 7 - dec31Dow))

  const totalDays = Math.round((lastSunday.getTime() - firstMonday.getTime()) / 86400000) + 1
  const numWeeks = totalDays / 7

  const cols: GridCell[][] = []
  const cursor = new Date(firstMonday)

  for (let w = 0; w < numWeeks; w++) {
    const col: GridCell[] = []
    for (let d = 0; d < 7; d++) {
      const iso = cursor.toISOString().slice(0, 10)
      col.push({ date: iso, inRange: cursor.getFullYear() === year })
      cursor.setDate(cursor.getDate() + 1)
    }
    cols.push(col)
  }
  return cols
}

function monthLabelsForCols(cols: GridCell[][]): Map<number, string> {
  const map = new Map<number, string>()
  let lastMonth = -1
  for (let ci = 0; ci < cols.length; ci++) {
    const first = cols[ci].find(c => c.inRange)
    if (!first) continue
    const m = parseInt(first.date.slice(5, 7)) - 1
    if (m !== lastMonth) {
      map.set(ci, MONTH_ABBR[m])
      lastMonth = m
    }
  }
  return map
}

function advanceQuarter(year: number, q: 1 | 2 | 3 | 4, delta: 1 | -1): { year: number; q: 1 | 2 | 3 | 4 } {
  let newQ = (q + delta) as number
  let newYear = year
  if (newQ > 4) { newQ = 1; newYear++ }
  if (newQ < 1) { newQ = 4; newYear-- }
  return { year: newYear, q: newQ as 1 | 2 | 3 | 4 }
}

function Heatmap({ sessions, cardioLogs, onOpenDate }: HeatmapProps) {
  const today = todayStr()
  const todayYear = parseInt(today.slice(0, 4))
  const todayQ = getQuarter(today)

  const [view, setView] = useState<HeatView>('quarter')
  const [qYear, setQYear] = useState(todayYear)
  const [qQ, setQQ] = useState<1 | 2 | 3 | 4>(todayQ)
  const [yearKey, setYearKey] = useState(todayYear)
  const [tooltipDate, setTooltipDate] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sessionsByDate = useMemo(() => {
    const m = new Map<string, DbSession[]>()
    for (const s of sessions) {
      const arr = m.get(s.date) ?? []
      arr.push(s)
      m.set(s.date, arr)
    }
    return m
  }, [sessions])

  const sessionIdToDate = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sessions) m.set(s.id, s.date)
    return m
  }, [sessions])

  const cardioDates = useMemo(() => {
    const s = new Set<string>()
    for (const c of cardioLogs) {
      const date = sessionIdToDate.get(c.sessionId)
      if (date) s.add(date)
    }
    return s
  }, [cardioLogs, sessionIdToDate])

  const cols = useMemo(() => {
    return view === 'quarter' ? buildQuarterGrid(qYear, qQ) : buildYearGrid(yearKey)
  }, [view, qYear, qQ, yearKey])

  const monthLabels = useMemo(() => monthLabelsForCols(cols), [cols])
  const cellSize = view === 'quarter' ? CELL_Q : CELL_Y
  const labelW = view === 'quarter' ? 18 : 14

  useEffect(() => {
    if (view !== 'year' || !scrollRef.current) return
    const todayIdx = cols.findIndex(col => col.some(c => c.date === today))
    if (todayIdx < 0) return
    const cellW = cellSize + GAP
    scrollRef.current.scrollLeft = Math.max(0, todayIdx * cellW - scrollRef.current.clientWidth / 2)
  }, [view, yearKey, cols, today, cellSize])

  const heading = view === 'quarter' ? `Q${qQ} ${qYear}` : String(yearKey)

  const atCurrentOrFuture = view === 'quarter'
    ? (qYear > todayYear || (qYear === todayYear && qQ >= todayQ))
    : yearKey >= todayYear

  function goNext() {
    if (view === 'quarter') {
      const n = advanceQuarter(qYear, qQ, 1)
      setQYear(n.year); setQQ(n.q)
    } else {
      setYearKey(y => Math.min(y + 1, todayYear))
    }
    setTooltipDate(null)
  }

  function goPrev() {
    if (view === 'quarter') {
      const p = advanceQuarter(qYear, qQ, -1)
      setQYear(p.year); setQQ(p.q)
    } else {
      setYearKey(y => y - 1)
    }
    setTooltipDate(null)
  }

  function goToday() {
    setQYear(todayYear); setQQ(todayQ); setYearKey(todayYear)
    setTooltipDate(null)
  }

  const statsYear = view === 'quarter' ? qYear : yearKey
  const yearSessions = useMemo(
    () => sessions.filter(s => s.date.startsWith(String(statsYear))),
    [sessions, statsYear],
  )
  const yearDates = useMemo(() => yearSessions.map(s => s.date), [yearSessions])
  const daysElapsed =
    statsYear < todayYear
      ? statsYear % 4 === 0 && (statsYear % 100 !== 0 || statsYear % 400 === 0) ? 366 : 365
      : Math.round((new Date(today + 'T00:00:00').getTime() - new Date(`${statsYear}-01-01T00:00:00`).getTime()) / 86400000) + 1
  const uniqueTrainingDays = new Set(yearDates).size
  const pct = daysElapsed > 0 ? Math.round((uniqueTrainingDays / daysElapsed) * 100) : 0
  const sessionsPerWeek = daysElapsed > 0 ? (yearSessions.length / (daysElapsed / 7)).toFixed(1) : '0'
  const dailyStreak = useMemo(() => computeDailyStreak(yearDates), [yearDates])
  const weeklyStreak = useMemo(() => computeWeeklyStreak(yearDates), [yearDates])

  function getCellBg(date: string): string | undefined {
    const daySessions = sessionsByDate.get(date)
    if (!daySessions || daySessions.length === 0) return undefined
    if (daySessions.length === 1) return dayAccent(daySessions[0].day)
    return `linear-gradient(135deg, ${dayAccent(daySessions[0].day)} 50%, ${dayAccent(daySessions[1].day)} 50%)`
  }

  function tooltipLabel(date: string): string {
    const dt = new Date(date + 'T00:00:00')
    const dayName = dt.toLocaleDateString('en-US', { weekday: 'long' })
    const fullDate = dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const daySessions = sessionsByDate.get(date) ?? []
    const hasCardio = cardioDates.has(date)
    if (daySessions.length === 0 && !hasCardio) return `${dayName}, ${fullDate}`
    const parts: string[] = []
    for (const s of daySessions) parts.push(s.day.charAt(0).toUpperCase() + s.day.slice(1) + ' day')
    if (hasCardio) parts.push('Cardio')
    return `${parts.join(' · ')} · ${dayName}, ${fullDate}`
  }

  return (
    <div>
      {/* View toggle: Quarter / Year */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {(['quarter', 'year'] as HeatView[]).map(v => (
          <button
            key={v}
            onClick={() => { setView(v); setTooltipDate(null) }}
            style={{
              padding: '3px 12px',
              borderRadius: 20,
              fontSize: 12,
              background: view === v ? PALETTE.dim : PALETTE.panel,
              color: view === v ? PALETTE.ink : PALETTE.dim,
              border: `1px solid ${PALETTE.line}`,
              cursor: 'pointer',
            }}
          >
            {v === 'quarter' ? 'Quarter' : 'Year'}
          </button>
        ))}
      </div>

      {/* Navigation: ‹ heading ◯ › */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button
          onClick={goPrev}
          style={{ minWidth: 36, minHeight: 36, color: PALETTE.dim, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}
          aria-label="previous"
        >
          ‹
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: PALETTE.dim }}>{heading}</span>
          <button
            onClick={goToday}
            title="Jump to today"
            style={{ fontSize: 14, color: PALETTE.mute, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}
          >
            ◯
          </button>
        </div>
        <button
          onClick={goNext}
          disabled={atCurrentOrFuture}
          style={{ minWidth: 36, minHeight: 36, color: atCurrentOrFuture ? PALETTE.line : PALETTE.dim, background: 'none', border: 'none', fontSize: 20, cursor: atCurrentOrFuture ? 'default' : 'pointer' }}
          aria-label="next"
        >
          ›
        </button>
      </div>

      {/* Grid */}
      <div ref={scrollRef} style={{ overflowX: view === 'year' ? 'auto' : 'visible' }}>
        <div style={{ display: 'inline-block' }}>
          <div style={{ display: 'flex' }}>
            {/* Weekday labels */}
            <div style={{ width: labelW, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              {DOW_LABELS.map((label, ri) => (
                <div
                  key={ri}
                  style={{
                    height: cellSize,
                    marginBottom: ri < 6 ? GAP : 0,
                    fontSize: view === 'quarter' ? 9 : 7,
                    color: PALETTE.mute,
                    lineHeight: `${cellSize}px`,
                    textAlign: 'right',
                    paddingRight: 3,
                  }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Week columns */}
            <div style={{ display: 'flex', gap: GAP }}>
              {cols.map((col, ci) => (
                <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                  {col.map(({ date, inRange }) => {
                    const isFutureDate = date > today
                    const isToday = date === today
                    const hasCardio = inRange && !isFutureDate && cardioDates.has(date)
                    const bg = inRange && !isFutureDate ? (getCellBg(date) ?? PALETTE.line) : 'transparent'

                    return (
                      <div
                        key={date}
                        onClick={() => { if (inRange && !isFutureDate) setTooltipDate(td => td === date ? null : date) }}
                        style={{
                          width: cellSize,
                          height: cellSize,
                          borderRadius: Math.max(1, Math.round(cellSize / 5)),
                          background: bg,
                          cursor: inRange && !isFutureDate ? 'pointer' : 'default',
                          boxShadow: hasCardio ? `inset 0 0 0 ${cellSize > 8 ? 2 : 1.5}px ${CARDIO_PURPLE}` : undefined,
                          outline: isToday && inRange ? `${cellSize > 8 ? 2 : 1}px solid ${PALETTE.fg}` : undefined,
                          outlineOffset: 1,
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Month labels at BOTTOM */}
          <div style={{ display: 'flex', marginLeft: labelW, marginTop: 4, height: 14 }}>
            {cols.map((_, ci) => (
              <div
                key={ci}
                style={{
                  width: cellSize,
                  marginRight: ci < cols.length - 1 ? GAP : 0,
                  flexShrink: 0,
                  fontSize: view === 'quarter' ? 9 : 7,
                  color: PALETTE.mute,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {monthLabels.get(ci) ?? ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltipDate && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: PALETTE.panel,
            border: `1px solid ${PALETTE.line}`,
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          <p style={{ color: PALETTE.fg, marginBottom: onOpenDate ? 4 : 0 }}>{tooltipLabel(tooltipDate)}</p>
          {onOpenDate && (
            <button
              onClick={() => { onOpenDate(tooltipDate); setTooltipDate(null) }}
              style={{ fontSize: 11, color: PALETTE.push, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Open in calendar →
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
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
      <div style={{ background: SURFACE.sunken, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, padding: 8, marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          <StatCard label={`Days ${statsYear} (${pct}%)`} value={String(uniqueTrainingDays)} accent={PALETTE.dim} />
          <StatCard label="Sessions / week" value={sessionsPerWeek} accent={PALETTE.dim} />
          <StatCard
            label="Current streak"
            value={`${dailyStreak.current} days`}
            sub={`${weeklyStreak.current} wks on prog`}
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

interface ProgressPageProps {
  onOpenDate?: (date: string) => void
}

export function ProgressPage({ onOpenDate }: ProgressPageProps = {}) {
  const [exercises, setExercises] = useState<DbExercise[]>([])
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(SELECTED_EX_KEY) ?? '')
  const [exerciseSets, setExerciseSets] = useState<(DbSetLog & { date: string; day: string })[]>([])
  const [sessions, setSessions] = useState<DbSession[]>([])
  const [cardioLogs, setCardioLogs] = useState<DbCardioLog[]>([])
  const [bodyMetrics, setBodyMetrics] = useState<DbBodyMetric[]>([])
  const [range, setRange] = useState<Range>('all')
  const [rangeInitialized, setRangeInitialized] = useState(false)

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

  const start = rangeStart(range)
  const filteredSets = useMemo(
    () => (start ? exerciseSets.filter(s => s.date >= start) : exerciseSets),
    [exerciseSets, start],
  )

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

  const isSingleSession = stats !== null && stats.sessionsInRange === 1

  return (
    <div style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingBottom: 16, color: PALETTE.fg }}>
      <div style={{ padding: '0 16px 16px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Progress</h1>

        {/* Exercise selector + range control — one control bar */}
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: PALETTE.mute, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>
                Exercise
              </label>
              <select
                value={selectedId}
                onChange={e => handleSelectExercise(e.target.value)}
                style={{ width: '100%', background: SURFACE.raised, color: PALETTE.fg, border: `1px solid ${BORDER.subtle}`, borderRadius: 6, padding: '10px 12px', fontSize: 15, outline: 'none' }}
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
            </div>
          </div>

          {selectedExercise && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
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
                    background: range === r ? accent : SURFACE.raised,
                    color: range === r ? '#fff' : PALETTE.dim,
                    border: `1px solid ${range === r ? accent : BORDER.subtle}`,
                    cursor: 'pointer',
                  }}
                >
                  {r === 'month' ? 'This month' : r === 'year' ? 'This year' : 'All time'}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Empty state */}
        {selectedExercise && filteredSets.length === 0 && (
          <p style={{ color: PALETTE.mute, fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
            {exerciseSets.length === 0
              ? 'Log your first set to see progress.'
              : 'No sessions in this range.'}
          </p>
        )}

        {/* Chart section */}
        {selectedExercise && chartData.length > 0 && stats && (
          <>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Estimated 1RM &amp; {stats.volumeLabel}
              </p>
              {isSingleSession && (
                <span style={{ fontSize: 11, color: PALETTE.mute }}>1 session</span>
              )}
            </div>

            {/* Chart in sunken well */}
            <div style={{ background: SURFACE.sunken, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, padding: '12px 4px 8px', marginBottom: 16 }}>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 40, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER.subtle} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fill: PALETTE.mute, fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: BORDER.subtle }}
                    interval="preserveStartEnd"
                    padding={isSingleSession ? { left: 60, right: 60 } : { left: 0, right: 0 }}
                  />
                  <YAxis
                    yAxisId="e1rm"
                    domain={e1rmDomain}
                    tick={{ fill: PALETTE.mute, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="vol"
                    orientation="right"
                    domain={volumeDomain}
                    tick={{ fill: PALETTE.mute, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => fmtVolume(v)}
                    tickCount={5}
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
                  <Bar
                    yAxisId="vol"
                    dataKey="volume"
                    fill={PALETTE.mute}
                    opacity={0.4}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                  {firstE1rmInRange !== undefined && (
                    <ReferenceLine
                      yAxisId="e1rm"
                      y={firstE1rmInRange}
                      stroke={PALETTE.mute}
                      strokeDasharray="4 2"
                      opacity={0.5}
                    />
                  )}
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
                  <Line
                    yAxisId="e1rm"
                    type="monotone"
                    dataKey="e1rm"
                    stroke={accent}
                    strokeWidth={2}
                    dot={{ r: isSingleSession ? 6 : 3, fill: accent, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                    connectNulls
                  />
                  {prDots.map(({ date, e1rm }) => (
                    <ReferenceDot
                      key={date}
                      yAxisId="e1rm"
                      x={date}
                      y={e1rm}
                      r={5}
                      fill={PALETTE.pr}
                      stroke={SURFACE.sunken}
                      strokeWidth={2}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Summary stats — raised cards in a sunken container */}
            <div style={{ background: SURFACE.sunken, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, padding: 10, marginBottom: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 6 }}>
                <StatCard label="Current e1RM" value={`${stats.currentE1RM.toFixed(1)} lb`} accent={accent} />
                <StatCard
                  label={`Change (${range === 'month' ? 'month' : range === 'year' ? 'year' : 'all time'})`}
                  value={`${stats.changeAbs >= 0 ? '+' : ''}${stats.changeAbs.toFixed(1)} lb`}
                  sub={`${stats.changePct >= 0 ? '+' : ''}${stats.changePct.toFixed(1)}%`}
                  accent={stats.changeAbs >= 0 ? accent : PALETTE.mute}
                />
                <StatCard label="All-time best e1RM" value={`${stats.allTimeBest.toFixed(1)} lb`} accent={PALETTE.pr} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <StatCard
                  label="Top set"
                  value={`${stats.topSetWeight} lb × ${stats.topSetReps}`}
                  accent={accent}
                />
                <StatCard label="Sessions in range" value={String(stats.sessionsInRange)} accent={PALETTE.dim} />
              </div>
            </div>
          </>
        )}

        {/* Training history — clearly headed section */}
        <div style={{ marginTop: 8, borderTop: selectedExercise && chartData.length > 0 ? `1px solid ${BORDER.strong}` : undefined, paddingTop: selectedExercise && chartData.length > 0 ? 24 : 0 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Training history</p>
          <Heatmap
            sessions={sessions}
            cardioLogs={cardioLogs}
            onOpenDate={onOpenDate}
          />
        </div>
      </div>
    </div>
  )
}
