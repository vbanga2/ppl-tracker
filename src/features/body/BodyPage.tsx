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
import { addBodyMetric, getAllBodyMetrics, deleteBodyMetric, updateBodyMetric } from '../../data/repo'
import { PALETTE } from '../../ui/tokens'

type Range = 'month' | 'year' | 'all'

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function rangeStart(range: Range): string | null {
  const today = new Date()
  if (range === 'month') {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  }
  if (range === 'year') return `${today.getFullYear()}-01-01`
  return null
}

// 7-day moving average: average of target date + 6 preceding calendar days
function sevenDayAvg(allMetrics: DbBodyMetric[], targetDate: string): number {
  const target = new Date(targetDate + 'T00:00:00')
  const windowStart = new Date(target)
  windowStart.setDate(target.getDate() - 6)
  const startStr = windowStart.toISOString().slice(0, 10)
  const inWindow = allMetrics.filter(m => m.date >= startStr && m.date <= targetDate)
  if (inWindow.length === 0) return 0
  return inWindow.reduce((sum, m) => sum + m.weightLb, 0) / inWindow.length
}

export function BodyPage() {
  const [allMetrics, setAllMetrics] = useState<DbBodyMetric[]>([])
  const [range, setRange] = useState<Range>('all')
  const [date, setDate] = useState(todayStr)
  const [weightStr, setWeightStr] = useState('')
  const [fatStr, setFatStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  function loadMetrics() {
    getAllBodyMetrics().then(setAllMetrics)
  }

  useEffect(() => { loadMetrics() }, [])

  function startEdit(m: DbBodyMetric) {
    setEditingId(m.id)
    setDate(m.date)
    setWeightStr(String(m.weightLb))
    setFatStr(m.bodyFatPct !== null ? String(m.bodyFatPct) : '')
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDate(todayStr())
    setWeightStr('')
    setFatStr('')
    setError(null)
  }

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
      if (editingId) {
        await updateBodyMetric(editingId, { date, weightLb, bodyFatPct })
        setEditingId(null)
      } else {
        await addBodyMetric({ id: crypto.randomUUID(), date, weightLb, bodyFatPct, source: 'manual' })
      }
      setWeightStr('')
      setFatStr('')
      setDate(todayStr())
      loadMetrics()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const ok = window.confirm('Delete this measurement?')
    if (!ok) return
    if (editingId === id) cancelEdit()
    await deleteBodyMetric(id)
    loadMetrics()
  }

  // Filter metrics to range
  const start = rangeStart(range)
  const chartData = useMemo(() => {
    const filtered = start ? allMetrics.filter(m => m.date >= start) : allMetrics
    return filtered.map(m => ({
      date: m.date,
      weightLb: m.weightLb,
      bodyFatPct: m.bodyFatPct,
      ma7: Math.round(sevenDayAvg(allMetrics, m.date) * 10) / 10,
    }))
  }, [allMetrics, start])

  const hasFat = chartData.some(d => d.bodyFatPct !== null)
  const latest = chartData[chartData.length - 1]
  const first = chartData[0]

  const changeAbs = latest && first && latest !== first ? latest.weightLb - first.weightLb : null
  const changePct = changeAbs !== null && first.weightLb > 0 ? (changeAbs / first.weightLb) * 100 : null

  const weightDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [100, 200]
    const vals = chartData.map(d => d.weightLb)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = Math.max((max - min) * 0.15, 5)
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [chartData])

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
    contentStyle: { background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 4, fontSize: 12, color: PALETTE.fg },
  }

  // Show last 20 entries in history list (all time, newest first)
  const historyList = useMemo(() => [...allMetrics].reverse().slice(0, 20), [allMetrics])

  return (
    <div style={{ padding: '24px 16px 16px', color: PALETTE.fg }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20 }}>Body</h1>

      {/* Entry form */}
      <section style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 10 }}>
          {editingId ? 'Edit measurement' : 'Log measurement'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: PALETTE.mute, display: 'block', marginBottom: 4 }}>Date</label>
              <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: PALETTE.mute, display: 'block', marginBottom: 4 }}>Weight (lb)</label>
              <input type="number" inputMode="decimal" value={weightStr} onChange={e => setWeightStr(e.target.value)} placeholder="185" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: PALETTE.mute, display: 'block', marginBottom: 4 }}>Body fat %</label>
              <input type="number" inputMode="decimal" value={fatStr} onChange={e => setFatStr(e.target.value)} placeholder="15" style={inputStyle} />
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving || !weightStr}
              style={{
                flex: 1,
                background: PALETTE.fg,
                color: PALETTE.ink,
                border: 'none',
                borderRadius: 8,
                padding: '12px',
                fontSize: 15,
                fontWeight: 500,
                cursor: saving || !weightStr ? 'default' : 'pointer',
                opacity: saving || !weightStr ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving…' : editingId ? 'Update' : 'Save measurement'}
            </button>
            {editingId && (
              <button
                onClick={cancelEdit}
                style={{ background: PALETTE.line, color: PALETTE.dim, border: 'none', borderRadius: 8, padding: '12px 16px', fontSize: 15, cursor: 'pointer' }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Time range */}
      {allMetrics.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
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
                background: range === r ? PALETTE.fg : PALETTE.panel,
                color: range === r ? PALETTE.ink : PALETTE.dim,
                border: `1px solid ${range === r ? PALETTE.fg : PALETTE.line}`,
                cursor: 'pointer',
              }}
            >
              {r === 'month' ? 'This month' : r === 'year' ? 'This year' : 'All time'}
            </button>
          ))}
        </div>
      )}

      {/* Chart + stats */}
      {chartData.length === 0 ? (
        <p style={{ color: PALETTE.mute, fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
          {allMetrics.length === 0
            ? 'Log your first measurement to see the trend.'
            : 'No measurements in this range.'}
        </p>
      ) : (
        <section style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 8 }}>
            {hasFat ? 'Bodyweight & body fat' : 'Bodyweight over time'}
          </p>

          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 8, right: hasFat ? 36 : 8, left: -20, bottom: 0 }}>
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
                formatter={(value: unknown, name: unknown) => {
                  if (name === 'weightLb') return [`${value} lb`, 'Weight']
                  if (name === 'ma7') return [`${value} lb`, '7-day avg']
                  return [`${value}%`, 'Body fat']
                }}
              />
              {/* 7-day moving average — dashed, dimmer */}
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey="ma7"
                stroke={PALETTE.push}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />
              {/* Bodyweight daily line */}
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey="weightLb"
                stroke={PALETTE.fg}
                strokeWidth={1.5}
                opacity={0.6}
                dot={{ r: 3, fill: PALETTE.fg, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />
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

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: PALETTE.mute }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 16, height: 2, background: PALETTE.fg, opacity: 0.6, display: 'inline-block' }} />
              Daily
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 16, height: 2, background: PALETTE.push, display: 'inline-block' }} />
              7-day avg
            </span>
          </div>

          {/* Summary stats */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {latest && (
              <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: '8px 12px', flex: 1 }}>
                <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 2 }}>Current weight</p>
                <p style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', color: PALETTE.fg }}>{latest.weightLb} lb</p>
              </div>
            )}
            {changeAbs !== null && changePct !== null && (
              <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: '8px 12px', flex: 1 }}>
                <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 2 }}>
                  Change ({range === 'month' ? 'month' : range === 'year' ? 'year' : 'all time'})
                </p>
                <p style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', color: changeAbs <= 0 ? PALETTE.pull : PALETTE.fg }}>
                  {changeAbs >= 0 ? '+' : ''}{changeAbs.toFixed(1)} lb
                </p>
                <p style={{ fontSize: 11, color: PALETTE.dim, fontVariantNumeric: 'tabular-nums' }}>
                  {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%
                </p>
              </div>
            )}
            {latest?.bodyFatPct !== null && latest?.bodyFatPct !== undefined && (
              <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: '8px 12px', flex: 1 }}>
                <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 2 }}>Body fat</p>
                <p style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', color: PALETTE.fg }}>{latest.bodyFatPct}%</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* History list — edit / delete */}
      {historyList.length > 0 && (
        <section>
          <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 8 }}>Recent measurements</p>
          <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 12, overflow: 'hidden' }}>
            {historyList.map((m, i) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderBottom: i < historyList.length - 1 ? `1px solid ${PALETTE.line}` : undefined,
                  background: editingId === m.id ? PALETTE.line : undefined,
                }}
              >
                <div>
                  <span style={{ fontSize: 13, color: PALETTE.fg, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtDate(m.date)} · {m.weightLb} lb
                    {m.bodyFatPct !== null ? ` · ${m.bodyFatPct}%` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => startEdit(m)}
                    style={{ fontSize: 12, color: PALETTE.dim, background: PALETTE.line, border: 'none', borderRadius: 6, padding: '4px 10px', minHeight: 28, cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void handleDelete(m.id)}
                    style={{ fontSize: 12, color: PALETTE.mute, background: 'none', border: 'none', padding: '4px 6px', minHeight: 28, cursor: 'pointer' }}
                    aria-label="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
