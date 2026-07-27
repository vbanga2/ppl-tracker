import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { DbBodyMetric } from '../../data/db'
import { addBodyMetric, getAllBodyMetrics } from '../../data/repo'
import { PALETTE } from '../../ui/tokens'

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function BodyPage() {
  const [metrics, setMetrics] = useState<DbBodyMetric[]>([])
  const [date, setDate] = useState(todayStr)
  const [weightStr, setWeightStr] = useState('')
  const [fatStr, setFatStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function loadMetrics() {
    getAllBodyMetrics().then(setMetrics)
  }

  useEffect(() => {
    loadMetrics()
  }, [])

  async function handleSave() {
    const weightLb = parseFloat(weightStr)
    if (!weightStr || isNaN(weightLb) || weightLb <= 0) {
      setError('Enter a valid weight.')
      return
    }
    const bodyFatPct = fatStr ? parseFloat(fatStr) : null
    if (bodyFatPct !== null && (isNaN(bodyFatPct) || bodyFatPct < 0 || bodyFatPct > 60)) {
      setError('Body fat must be 0–60%.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await addBodyMetric({
        id: crypto.randomUUID(),
        date,
        weightLb,
        bodyFatPct,
        source: 'manual',
      })
      setWeightStr('')
      setFatStr('')
      setDate(todayStr())
      loadMetrics()
    } finally {
      setSaving(false)
    }
  }

  // Sorted oldest first (getAllBodyMetrics returns chronological order).
  const chartData = useMemo(
    () => metrics.map(m => ({ date: m.date, weightLb: m.weightLb, bodyFatPct: m.bodyFatPct })),
    [metrics],
  )

  const hasFat = chartData.some(d => d.bodyFatPct !== null)

  const weightDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [100, 200]
    const vals = chartData.map(d => d.weightLb)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = Math.max((max - min) * 0.15, 5)
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [chartData])

  const latest = chartData[chartData.length - 1]

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: PALETTE.panel,
    border: `1px solid ${PALETTE.line}`,
    borderRadius: 6,
    color: PALETTE.fg,
    padding: '8px 8px',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontVariantNumeric: 'tabular-nums',
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

  return (
    <div style={{ padding: '24px 16px 16px', color: PALETTE.fg }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Body</h1>

      {/* Entry form */}
      <section style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 10 }}>Log measurement</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label
                style={{ fontSize: 11, color: PALETTE.mute, display: 'block', marginBottom: 4 }}
              >
                Date
              </label>
              <input
                type="date"
                value={date}
                max={todayStr()}
                onChange={e => setDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label
                style={{ fontSize: 11, color: PALETTE.mute, display: 'block', marginBottom: 4 }}
              >
                Weight (lb)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={weightStr}
                onChange={e => setWeightStr(e.target.value)}
                placeholder="185"
                style={inputStyle}
              />
            </div>
            <div>
              <label
                style={{ fontSize: 11, color: PALETTE.mute, display: 'block', marginBottom: 4 }}
              >
                Body fat %
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={fatStr}
                onChange={e => setFatStr(e.target.value)}
                placeholder="15"
                style={inputStyle}
              />
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving || !weightStr}
            style={{
              background: PALETTE.fg,
              color: PALETTE.ink,
              border: 'none',
              borderRadius: 8,
              padding: '12px',
              fontSize: 15,
              fontWeight: 500,
              cursor: saving || !weightStr ? 'default' : 'pointer',
              opacity: saving || !weightStr ? 0.5 : 1,
              width: '100%',
            }}
          >
            {saving ? 'Saving…' : 'Save measurement'}
          </button>
        </div>
      </section>

      {/* Chart + stats */}
      {chartData.length === 0 ? (
        <p style={{ color: PALETTE.mute, fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
          Log your first measurement to see the trend.
        </p>
      ) : (
        <section>
          <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 8 }}>
            {hasFat ? 'Bodyweight & body fat' : 'Bodyweight over time'}
          </p>

          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: hasFat ? 36 : 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fill: PALETTE.mute, fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: PALETTE.line }}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="weight"
                domain={weightDomain}
                tick={{ fill: PALETTE.mute, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              {hasFat && (
                <YAxis
                  yAxisId="fat"
                  orientation="right"
                  domain={[0, 'auto']}
                  tick={{ fill: PALETTE.mute, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
              )}
              <Tooltip
                {...tooltipStyle}
                labelFormatter={(label: unknown) =>
                  typeof label === 'string' ? fmtDate(label) : String(label ?? '')
                }
                formatter={(value: unknown, name: unknown) =>
                  name === 'weightLb'
                    ? [`${value} lb`, 'Weight']
                    : [`${value}%`, 'Body fat']
                }
              />
              {/* Bodyweight line */}
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey="weightLb"
                stroke={PALETTE.fg}
                strokeWidth={2}
                dot={{ r: 3, fill: PALETTE.fg, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />
              {/* Body fat % line — dashed, right axis */}
              {hasFat && (
                <Line
                  yAxisId="fat"
                  type="monotone"
                  dataKey="bodyFatPct"
                  stroke={PALETTE.dim}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={{ r: 3, fill: PALETTE.dim, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Latest values */}
          {latest && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <div
                style={{
                  background: PALETTE.panel,
                  border: `1px solid ${PALETTE.line}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  flex: 1,
                }}
              >
                <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 2 }}>
                  Current weight
                </p>
                <p
                  style={{
                    fontSize: 16,
                    fontVariantNumeric: 'tabular-nums',
                    color: PALETTE.fg,
                  }}
                >
                  {latest.weightLb} lb
                </p>
              </div>
              {latest.bodyFatPct !== null && (
                <div
                  style={{
                    background: PALETTE.panel,
                    border: `1px solid ${PALETTE.line}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    flex: 1,
                  }}
                >
                  <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 2 }}>
                    Body fat
                  </p>
                  <p
                    style={{
                      fontSize: 16,
                      fontVariantNumeric: 'tabular-nums',
                      color: PALETTE.fg,
                    }}
                  >
                    {latest.bodyFatPct}%
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
