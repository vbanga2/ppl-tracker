import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from 'recharts'
import type { DbExercise, DbSession, DbSetLog, DbBodyMetric } from '../../data/db'
import {
  getAllExercises,
  getAllSetsForExercise,
  getAllSessionsOrdered,
  getAllBodyMetrics,
} from '../../data/repo'
import { epley1RM, effectiveLoad } from '../../domain/metrics'
import { computeExercisePRHistory } from '../../domain/records'
import type { SetWithMeta } from '../../domain/records'
import { PALETTE, dayAccent } from '../../ui/tokens'

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Latest bodyweight on or before `date` in a chronologically sorted metric list.
function bodyweightAtDate(metrics: DbBodyMetric[], date: string): number {
  let bw = 0
  for (const m of metrics) {
    if (m.date <= date) bw = m.weightLb
    else break
  }
  return bw
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent: string
}) {
  return (
    <div
      style={{
        background: PALETTE.panel,
        border: `1px solid ${PALETTE.line}`,
        borderRadius: 8,
        padding: '10px 8px',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 4, lineHeight: 1.2 }}>{label}</p>
      <p
        style={{
          fontSize: 15,
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          color: accent,
          lineHeight: 1.2,
        }}
      >
        {value}
      </p>
      {sub && (
        <p
          style={{
            fontSize: 11,
            color: PALETTE.dim,
            marginTop: 2,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {sub}
        </p>
      )}
    </div>
  )
}

// ─── ConsistencyStrip ────────────────────────────────────────────────────────

function ConsistencyStrip({ sessions }: { sessions: DbSession[] }) {
  const sessionMap = useMemo(() => {
    const m = new Map<string, 'push' | 'pull' | 'legs'>()
    for (const s of sessions) m.set(s.date, s.day)
    return m
  }, [sessions])

  // Last 84 days (12 weeks), oldest first
  const dates = useMemo(() => {
    const result: string[] = []
    const today = new Date()
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      result.push(d.toISOString().slice(0, 10))
    }
    return result
  }, [])

  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {dates.map(date => {
          const day = sessionMap.get(date)
          return (
            <div
              key={date}
              title={date}
              style={{
                aspectRatio: '1',
                borderRadius: 2,
                backgroundColor:
                  date > todayStr ? 'transparent' : day ? dayAccent(day) : PALETTE.line,
              }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
        {(['push', 'pull', 'legs'] as const).map(d => (
          <span
            key={d}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: PALETTE.dim,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 1,
                backgroundColor: dayAccent(d),
                display: 'inline-block',
              }}
            />
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── ProgressPage ────────────────────────────────────────────────────────────

interface E1RMPoint {
  date: string
  e1rm: number
}

interface VolumePoint {
  date: string
  volume: number
}

export function ProgressPage() {
  const [exercises, setExercises] = useState<DbExercise[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [exerciseSets, setExerciseSets] = useState<(DbSetLog & { date: string; day: string })[]>([])
  const [sessions, setSessions] = useState<DbSession[]>([])
  const [bodyMetrics, setBodyMetrics] = useState<DbBodyMetric[]>([])

  useEffect(() => {
    getAllExercises().then(setExercises)
    getAllSessionsOrdered().then(setSessions)
    getAllBodyMetrics().then(setBodyMetrics)
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setExerciseSets([])
      return
    }
    let cancelled = false
    getAllSetsForExercise(selectedId).then(sets => {
      if (!cancelled) setExerciseSets(sets)
    })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const selectedExercise = useMemo(
    () => exercises.find(e => e.id === selectedId) ?? null,
    [exercises, selectedId],
  )

  // PR history — dates on which a new best was set for the selected exercise.
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

  // Group sets by session date; compute e1RM and volume per session.
  const { e1rmData, volumeData, stats } = useMemo(() => {
    if (!selectedExercise || exerciseSets.length === 0) {
      return { e1rmData: [] as E1RMPoint[], volumeData: [] as VolumePoint[], stats: null }
    }

    const byDate = new Map<string, { day: string; sets: typeof exerciseSets }>()
    for (const s of exerciseSets) {
      const existing = byDate.get(s.date)
      if (existing) existing.sets.push(s)
      else byDate.set(s.date, { day: s.day, sets: [s] })
    }

    const sortedDates = [...byDate.keys()].sort()
    const e1rmData: E1RMPoint[] = []
    const volumeData: VolumePoint[] = []

    for (const date of sortedDates) {
      const { sets } = byDate.get(date)!
      const bw = bodyweightAtDate(bodyMetrics, date)
      let maxE1RM = 0
      let totalVolume = 0
      for (const s of sets) {
        const eff = effectiveLoad(s.weightLb, selectedExercise.isBodyweight, bw)
        maxE1RM = Math.max(maxE1RM, epley1RM(eff, s.reps))
        totalVolume += eff * s.reps
      }
      e1rmData.push({ date, e1rm: Math.round(maxE1RM * 10) / 10 })
      volumeData.push({ date, volume: Math.round(totalVolume) })
    }

    // Summary from most recent session
    const lastDate = sortedDates[sortedDates.length - 1]
    const lastSets = byDate.get(lastDate)!.sets
    const bwLast = bodyweightAtDate(bodyMetrics, lastDate)
    const topSet = lastSets.reduce((best, s) => {
      const eff = effectiveLoad(s.weightLb, selectedExercise.isBodyweight, bwLast)
      const bestEff = effectiveLoad(best.weightLb, selectedExercise.isBodyweight, bwLast)
      return eff > bestEff ? s : best
    }, lastSets[0])

    return {
      e1rmData,
      volumeData,
      stats: {
        currentE1RM: e1rmData[e1rmData.length - 1].e1rm,
        firstE1RM: e1rmData[0].e1rm,
        topSetWeight: topSet.weightLb,
        topSetReps: topSet.reps,
      },
    }
  }, [selectedExercise, exerciseSets, bodyMetrics])

  // Y axis domains with padding so single-point charts don't collapse
  const e1rmDomain = useMemo((): [number, number] => {
    if (e1rmData.length === 0) return [0, 100]
    const vals = e1rmData.map(d => d.e1rm)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = Math.max((max - min) * 0.15, 15)
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [e1rmData])

  const volumeDomain = useMemo((): [number, number] => {
    if (volumeData.length === 0) return [0, 1000]
    return [0, Math.ceil(Math.max(...volumeData.map(d => d.volume)) * 1.15)]
  }, [volumeData])

  const accent = selectedExercise ? dayAccent(selectedExercise.day) : PALETTE.fg

  const pushEx = exercises.filter(e => e.day === 'push')
  const pullEx = exercises.filter(e => e.day === 'pull')
  const legsEx = exercises.filter(e => e.day === 'legs')

  const changeAbs = stats ? stats.currentE1RM - stats.firstE1RM : 0
  const changePct =
    stats && stats.firstE1RM > 0 ? (changeAbs / stats.firstE1RM) * 100 : 0

  const tooltipStyle = {
    contentStyle: {
      background: PALETTE.panel,
      border: `1px solid ${PALETTE.line}`,
      borderRadius: 4,
      fontSize: 12,
      color: PALETTE.fg,
    },
  }

  return (
    <div style={{ padding: '24px 16px 16px', color: PALETTE.fg }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Progress</h1>

      {/* Consistency strip */}
      <section style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 8 }}>Last 12 weeks</p>
        <ConsistencyStrip sessions={sessions} />
      </section>

      {/* Exercise analysis */}
      <section>
        <label style={{ fontSize: 12, color: PALETTE.dim, display: 'block', marginBottom: 6 }}>
          Exercise
        </label>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          style={{
            width: '100%',
            background: PALETTE.panel,
            color: PALETTE.fg,
            border: `1px solid ${PALETTE.line}`,
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 15,
            outline: 'none',
            marginBottom: 20,
          }}
        >
          <option value="">Choose an exercise…</option>
          {pushEx.length > 0 && (
            <optgroup label="Push">
              {pushEx.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          )}
          {pullEx.length > 0 && (
            <optgroup label="Pull">
              {pullEx.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          )}
          {legsEx.length > 0 && (
            <optgroup label="Legs">
              {legsEx.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {selectedExercise && e1rmData.length === 0 && (
          <p
            style={{ color: PALETTE.mute, fontSize: 14, textAlign: 'center', padding: '32px 0' }}
          >
            Log your first set to see progress.
          </p>
        )}

        {selectedExercise && e1rmData.length > 0 && stats && (
          <>
            {/* Summary stats */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                marginBottom: 24,
              }}
            >
              <StatCard
                label="Current e1RM"
                value={`${stats.currentE1RM.toFixed(1)} lb`}
                accent={accent}
              />
              <StatCard
                label="Change"
                value={`${changeAbs >= 0 ? '+' : ''}${changeAbs.toFixed(1)} lb`}
                sub={`${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`}
                accent={changeAbs >= 0 ? accent : PALETTE.mute}
              />
              <StatCard
                label="Top set"
                value={`${stats.topSetWeight} lb`}
                sub={`× ${stats.topSetReps}`}
                accent={accent}
              />
            </div>

            {/* e1RM line chart */}
            <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 4 }}>
              Estimated 1RM over time
            </p>
            <div style={{ marginBottom: 24 }}>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart
                  data={e1rmData}
                  margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={PALETTE.line}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fill: PALETTE.mute, fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: PALETTE.line }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={e1rmDomain}
                    tick={{ fill: PALETTE.mute, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    labelFormatter={(label: unknown) =>
                      typeof label === 'string' ? fmtDate(label) : String(label ?? '')
                    }
                    formatter={(v: unknown) => [`${(v as number).toFixed(1)} lb`, 'e1RM']}
                  />
                  {/* Dashed reference at first recorded value */}
                  <ReferenceLine
                    y={e1rmData[0].e1rm}
                    stroke={PALETTE.mute}
                    strokeDasharray="4 2"
                  />
                  <Line
                    type="monotone"
                    dataKey="e1rm"
                    stroke={accent}
                    strokeWidth={2}
                    dot={{ r: 4, fill: accent, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                  {[...prHistory.entries()].map(([date, pr]) => (
                    <ReferenceDot
                      key={date}
                      x={date}
                      y={Math.round(pr.bestE1RM * 10) / 10}
                      r={5}
                      fill={PALETTE.pr}
                      stroke={PALETTE.panel}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Volume bar chart */}
            <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 4 }}>
              Volume load per session
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={volumeData}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={PALETTE.line}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fill: PALETTE.mute, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: PALETTE.line }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={volumeDomain}
                  tick={{ fill: PALETTE.mute, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(label: unknown) =>
                    typeof label === 'string' ? fmtDate(label) : String(label ?? '')
                  }
                  formatter={(v: unknown) => [`${(v as number).toLocaleString()} lb`, 'Volume']}
                />
                <Bar
                  dataKey="volume"
                  fill={accent}
                  opacity={0.85}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </section>
    </div>
  )
}
