import { useState, useEffect, useMemo, useRef } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { DbHealthSample } from '../../data/db'
import {
  getHealthSamplesOfType,
  getHealthSampleCount,
  getHealthWorkoutCount,
  upsertHealthSamples,
  upsertHealthWorkouts,
  upsertHealthBodyMetrics,
  clearAllHealthData,
} from '../../data/repo'
import { PALETTE, SURFACE, BORDER } from '../../ui/tokens'
import HealthWorker from '../../workers/healthImport.worker?worker'

type Range = 'month' | 'year' | 'all'

const HK_STEPS = 'HKQuantityTypeIdentifierStepCount'
const HK_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned'
const HK_SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis'
const HK_REST_HR = 'HKQuantityTypeIdentifierRestingHeartRate'
const HK_HRV = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'

function fmtShortDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function fmtFullDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function rangeStartTs(range: Range): number | null {
  const now = new Date()
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  if (range === 'year') return new Date(now.getFullYear(), 0, 1).getTime()
  return null
}

function filterByRange(samples: DbHealthSample[], range: Range): DbHealthSample[] {
  const start = rangeStartTs(range)
  return start ? samples.filter(s => s.startAt >= start) : samples
}

const sectionHeader: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: PALETTE.mute,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginTop: 24,
  marginBottom: 8,
}

const tooltipStyle = {
  contentStyle: {
    background: PALETTE.panel,
    border: `1px solid ${PALETTE.line}`,
    borderRadius: 4,
    fontSize: 12,
    color: PALETTE.fg,
  },
}

// ─── Small bar chart ──────────────────────────────────────────────────────────

interface SimpleBarChartProps {
  data: DbHealthSample[]
  range: Range
  color: string
  valueFormatter: (v: number) => string
  yTickFormatter: (v: number) => string
}

function SimpleBarChart({ data, range, color, valueFormatter, yTickFormatter }: SimpleBarChartProps) {
  const filtered = filterByRange(data, range)
  if (filtered.length === 0) {
    return <p style={{ fontSize: 13, color: PALETTE.mute, padding: '12px 0' }}>No data in this range.</p>
  }
  const chartData = filtered.map(s => ({ ts: s.startAt, value: s.value }))
  return (
    <div style={{ background: SURFACE.sunken, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, padding: '12px 4px 8px' }}>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER.subtle} vertical={false} />
          <XAxis
            dataKey="ts"
            tickFormatter={fmtShortDate}
            tick={{ fill: PALETTE.mute, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: BORDER.subtle }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: PALETTE.mute, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={yTickFormatter}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v: unknown) => typeof v === 'number' ? fmtFullDate(v) : ''}
            formatter={(v: unknown) => [valueFormatter(v as number), '']}
          />
          <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function SimpleLineChart({ data, range, color, valueFormatter, yTickFormatter }: SimpleBarChartProps) {
  const filtered = filterByRange(data, range)
  if (filtered.length === 0) {
    return <p style={{ fontSize: 13, color: PALETTE.mute, padding: '12px 0' }}>No data in this range.</p>
  }
  const chartData = filtered.map(s => ({ ts: s.startAt, value: s.value }))
  return (
    <div style={{ background: SURFACE.sunken, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, padding: '12px 4px 8px' }}>
      <ResponsiveContainer width="100%" height={140}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER.subtle} vertical={false} />
          <XAxis
            dataKey="ts"
            tickFormatter={fmtShortDate}
            tick={{ fill: PALETTE.mute, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: BORDER.subtle }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: PALETTE.mute, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={yTickFormatter}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(v: unknown) => typeof v === 'number' ? fmtFullDate(v) : ''}
            formatter={(v: unknown) => [valueFormatter(v as number), '']}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface WorkerResult {
  samples: Array<{ type: string; startAt: number; endAt: number; value: number; unit: string; source: string }>
  workouts: Array<{ workoutType: string; startAt: number; endAt: number; durationMin: number; distanceMi: number | null; kcal: number | null; source: string }>
  bodyMetrics: Array<{ date: string; weightLb: number | null; bodyFatPct: number | null; source: string }>
}

export function HealthSection() {
  const [steps, setSteps] = useState<DbHealthSample[]>([])
  const [energy, setEnergy] = useState<DbHealthSample[]>([])
  const [sleep, setSleep] = useState<DbHealthSample[]>([])
  const [restHr, setRestHr] = useState<DbHealthSample[]>([])
  const [hrv, setHrv] = useState<DbHealthSample[]>([])
  const [sampleCount, setSampleCount] = useState(0)
  const [workoutCount, setWorkoutCount] = useState(0)
  const [range, setRange] = useState<Range>('year')
  const [importing, setImporting] = useState(false)
  const [importPct, setImportPct] = useState(0)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const lastImportAt = localStorage.getItem('lastHealthImportAt')

  const hasAnyData = sampleCount > 0 || workoutCount > 0

  function loadData() {
    void Promise.all([
      getHealthSamplesOfType(HK_STEPS).then(setSteps),
      getHealthSamplesOfType(HK_ENERGY).then(setEnergy),
      getHealthSamplesOfType(HK_SLEEP).then(setSleep),
      getHealthSamplesOfType(HK_REST_HR).then(setRestHr),
      getHealthSamplesOfType(HK_HRV).then(setHrv),
      getHealthSampleCount().then(setSampleCount),
      getHealthWorkoutCount().then(setWorkoutCount),
    ])
  }

  useEffect(() => { loadData() }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!file.name.endsWith('.zip')) {
      setImportStatus('Select the export.zip file from Health app → profile picture → Export All Health Data.')
      return
    }

    setImporting(true)
    setImportPct(0)
    setImportStatus(null)

    const worker = new HealthWorker()

    worker.onmessage = async (ev: MessageEvent) => {
      const msg = ev.data as { type: string; pct?: number; phase?: string; result?: WorkerResult; message?: string }

      if (msg.type === 'progress') {
        setImportPct(msg.pct ?? 0)
        return
      }

      if (msg.type === 'error') {
        setImporting(false)
        setImportStatus(`Import failed: ${msg.message ?? 'unknown error'}`)
        worker.terminate()
        return
      }

      if (msg.type === 'done' && msg.result) {
        const { samples, workouts, bodyMetrics } = msg.result
        try {
          await upsertHealthSamples(samples)
          await upsertHealthWorkouts(workouts)
          await upsertHealthBodyMetrics(bodyMetrics)
          localStorage.setItem('lastHealthImportAt', String(Date.now()))

          const totalSamples = samples.length
          const totalWorkouts = workouts.length
          const totalMetrics = bodyMetrics.length
          setImportStatus(
            `Import complete — ${totalSamples} daily samples, ${totalWorkouts} workouts, ${totalMetrics} body metric entries.`,
          )
          loadData()
        } catch (err) {
          setImportStatus(`Failed to save to database: ${String(err)}`)
        } finally {
          setImporting(false)
          worker.terminate()
        }
      }
    }

    worker.onerror = (err: ErrorEvent) => {
      setImporting(false)
      setImportStatus(`Worker error: ${err.message}`)
      worker.terminate()
    }

    worker.postMessage({ type: 'start', file })
  }

  async function handleClear() {
    const ok = window.confirm(
      'Delete all Apple Health data from this app? Your original Health app data is not affected. Re-import any time.',
    )
    if (!ok) return
    setClearing(true)
    try {
      await clearAllHealthData()
      localStorage.removeItem('lastHealthImportAt')
      loadData()
      setImportStatus('Health data cleared.')
    } finally {
      setClearing(false)
    }
  }

  const hasSteps = steps.length > 0
  const hasEnergy = energy.length > 0
  const hasSleep = sleep.length > 0
  const hasRestHr = restHr.length > 0
  const hasHrv = hrv.length > 0

  const latestSteps = useMemo(() => {
    const inRange = filterByRange(steps, range)
    return inRange[inRange.length - 1]?.value ?? null
  }, [steps, range])

  const avgSleepHours = useMemo(() => {
    const inRange = filterByRange(sleep, range)
    if (inRange.length === 0) return null
    const avg = inRange.reduce((s, r) => s + r.value, 0) / inRange.length
    return avg / 60
  }, [sleep, range])

  return (
    <>
      {/* Honesty statement */}
      <div style={{ background: SURFACE.elevated, border: `1px solid ${BORDER.strong}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: PALETTE.dim, lineHeight: 1.5 }}>
        <p>
          <strong style={{ color: PALETTE.fg }}>Manual import, not live sync.</strong> Apple provides no way for a web app to read Health data automatically. To update, re-export from Health → your profile picture → Export All Health Data, then import the new zip here.
        </p>
      </div>

      {/* Import control */}
      <section style={{ marginBottom: 20 }}>
        <p style={sectionHeader}>Import</p>
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {importing ? (
          <div style={{ background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 12, padding: '14px' }}>
            <p style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 8 }}>Parsing export.zip… {importPct}%</p>
            <div style={{ height: 6, background: PALETTE.line, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${importPct}%`, background: PALETTE.pull, borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              width: '100%',
              minHeight: 50,
              background: PALETTE.pull,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Import export.zip
          </button>
        )}

        {importStatus && (
          <p style={{ fontSize: 12, color: PALETTE.dim, marginTop: 8, lineHeight: 1.5 }}>{importStatus}</p>
        )}
      </section>

      {/* Import stats */}
      {hasAnyData && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                {lastImportAt && (
                  <p style={{ fontSize: 12, color: PALETTE.mute, marginBottom: 4 }}>
                    Last import: {new Date(parseInt(lastImportAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
                <p style={{ fontSize: 12, color: PALETTE.mute }}>
                  {sampleCount} daily samples · {workoutCount} workouts
                </p>
              </div>
              <button
                onClick={() => void handleClear()}
                disabled={clearing}
                style={{ fontSize: 12, color: PALETTE.mute, background: 'none', border: `1px solid ${PALETTE.line}`, borderRadius: 6, padding: '4px 10px', cursor: clearing ? 'default' : 'pointer', opacity: clearing ? 0.6 : 1, minHeight: 32 }}
              >
                {clearing ? 'Clearing…' : 'Clear'}
              </button>
            </div>
          </div>
        </section>
      )}

      {hasAnyData && (
        <>
          {/* Range control */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['month', 'year', 'all'] as Range[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 20, fontSize: 13,
                  fontWeight: range === r ? 500 : 400,
                  background: range === r ? PALETTE.fg : SURFACE.raised,
                  color: range === r ? PALETTE.ink : PALETTE.dim,
                  border: `1px solid ${range === r ? PALETTE.fg : BORDER.subtle}`,
                  cursor: 'pointer',
                }}
              >
                {r === 'month' ? 'This month' : r === 'year' ? 'This year' : 'All time'}
              </button>
            ))}
          </div>

          {/* Steps */}
          {hasSteps && (
            <section style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <p style={sectionHeader}>Steps per day</p>
                {latestSteps !== null && (
                  <span style={{ fontSize: 13, color: PALETTE.fg, fontVariantNumeric: 'tabular-nums' }}>
                    {latestSteps.toLocaleString()} today
                  </span>
                )}
              </div>
              <SimpleBarChart
                data={steps}
                range={range}
                color={PALETTE.pull}
                valueFormatter={v => `${v.toLocaleString()} steps`}
                yTickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
              />
            </section>
          )}

          {/* Active energy */}
          {hasEnergy && (
            <section style={{ marginBottom: 20 }}>
              <p style={sectionHeader}>Active energy per day</p>
              <SimpleBarChart
                data={energy}
                range={range}
                color={PALETTE.legs}
                valueFormatter={v => `${v} kcal`}
                yTickFormatter={v => `${v}`}
              />
            </section>
          )}

          {/* Sleep */}
          {hasSleep && (
            <section style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <p style={sectionHeader}>Sleep per night</p>
                {avgSleepHours !== null && (
                  <span style={{ fontSize: 13, color: PALETTE.fg, fontVariantNumeric: 'tabular-nums' }}>
                    avg {avgSleepHours.toFixed(1)} hr
                  </span>
                )}
              </div>
              <SimpleBarChart
                data={sleep}
                range={range}
                color={PALETTE.push}
                valueFormatter={v => `${(v / 60).toFixed(1)} hr`}
                yTickFormatter={v => `${(v / 60).toFixed(0)}h`}
              />
            </section>
          )}

          {/* Resting HR */}
          {hasRestHr && (
            <section style={{ marginBottom: 20 }}>
              <p style={sectionHeader}>Resting heart rate (bpm)</p>
              <SimpleLineChart
                data={restHr}
                range={range}
                color={PALETTE.legs}
                valueFormatter={v => `${v} bpm`}
                yTickFormatter={v => String(v)}
              />
            </section>
          )}

          {/* HRV */}
          {hasHrv && (
            <section style={{ marginBottom: 20 }}>
              <p style={sectionHeader}>Heart rate variability (ms)</p>
              <SimpleLineChart
                data={hrv}
                range={range}
                color={PALETTE.pr}
                valueFormatter={v => `${v} ms`}
                yTickFormatter={v => String(v)}
              />
            </section>
          )}

          <p style={{ fontSize: 12, color: PALETTE.mute, marginTop: 8, lineHeight: 1.5 }}>
            Weight and body fat data from Apple Health appears in the Weight tab. Health entries are shown alongside manual entries, and manual entries always take priority on a date conflict.
          </p>
        </>
      )}

      {!hasAnyData && !importing && (
        <p style={{ fontSize: 14, color: PALETTE.mute, textAlign: 'center', padding: '32px 0', lineHeight: 1.7 }}>
          No health data imported yet.{'\n'}Export from Health → your profile picture → Export All Health Data, then tap Import above.
        </p>
      )}
    </>
  )
}
