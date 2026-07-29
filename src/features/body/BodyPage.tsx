import { useState, useEffect, useMemo, useRef } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { DbBodyMetric, DbBodyMeasurement, DbProgressPhoto, DbProfile } from '../../data/db'
import {
  addBodyMetric,
  getAllBodyMetrics,
  deleteBodyMetric,
  updateBodyMetric,
  addBodyMeasurement,
  getAllBodyMeasurements,
  updateBodyMeasurement,
  deleteBodyMeasurement,
  countBodyMetricsWithDefaultFat,
  clearDefaultBodyFat,
  addProgressPhoto,
  getAllProgressPhotos,
  updateProgressPhoto,
  deleteProgressPhoto,
  getProfile,
  saveProfile,
} from '../../data/repo'
import { PALETTE, SURFACE, BORDER } from '../../ui/tokens'

type Range = 'month' | 'year' | 'all'
type PhotoPoseFilter = 'all' | 'front' | 'side' | 'back' | 'other'

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

function sevenDayAvg(allMetrics: DbBodyMetric[], targetDate: string): number {
  const target = new Date(targetDate + 'T00:00:00')
  const windowStart = new Date(target)
  windowStart.setDate(target.getDate() - 6)
  const startStr = windowStart.toISOString().slice(0, 10)
  const inWindow = allMetrics.filter(m => m.date >= startStr && m.date <= targetDate)
  if (inWindow.length === 0) return 0
  return inWindow.reduce((sum, m) => sum + m.weightLb, 0) / inWindow.length
}

// Downscale a File to max 1600px on long edge, re-encode as WebP at 80%
async function processPhoto(file: File): Promise<{ blob: Blob; widthPx: number; heightPx: number }> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const maxPx = 1600
  let w = width
  let h = height
  if (w > maxPx || h > maxPx) {
    const ratio = Math.min(maxPx / w, maxPx / h)
    w = Math.round(w * ratio)
    h = Math.round(h * ratio)
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', 0.8),
  )
  return { blob, widthPx: w, heightPx: h }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: SURFACE.sunken,
  border: `1px solid ${BORDER.subtle}`,
  borderRadius: 6,
  color: PALETTE.fg,
  padding: '8px',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
  minHeight: 48,
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: PALETTE.mute,
  display: 'block',
  marginBottom: 4,
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BodyPage() {
  const [activeSection, setActiveSection] = useState<'weight' | 'measurements' | 'photos'>('weight')

  return (
    <div style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16, color: PALETTE.fg }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 16 }}>Body</h1>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['weight', 'measurements', 'photos'] as const).map(s => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: activeSection === s ? 500 : 400,
              background: activeSection === s ? PALETTE.fg : SURFACE.raised,
              color: activeSection === s ? PALETTE.ink : PALETTE.dim,
              border: `1px solid ${activeSection === s ? PALETTE.fg : BORDER.subtle}`,
              cursor: 'pointer',
            }}
          >
            {s === 'weight' ? 'Weight' : s === 'measurements' ? 'Measurements' : 'Photos'}
          </button>
        ))}
      </div>

      {activeSection === 'weight' && <WeightSection />}
      {activeSection === 'measurements' && <MeasurementsSection />}
      {activeSection === 'photos' && <PhotosSection />}
    </div>
  )
}

// ─── Weight section ───────────────────────────────────────────────────────────

function WeightSection() {
  const [allMetrics, setAllMetrics] = useState<DbBodyMetric[]>([])
  const [range, setRange] = useState<Range>('all')
  const [date, setDate] = useState(todayStr)
  const [weightStr, setWeightStr] = useState('')
  const [fatStr, setFatStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [defaultFatCount, setDefaultFatCount] = useState<number | null>(null)
  const [clearingFat, setClearingFat] = useState(false)

  // Height + BMI state
  const [profile, setProfile] = useState<DbProfile | null>(null)
  const [showBmi, setShowBmi] = useState(false)
  const [heightUnit, setHeightUnit] = useState<'cm' | 'imperial'>('imperial')
  const [heightFtStr, setHeightFtStr] = useState('')
  const [heightInStr, setHeightInStr] = useState('')
  const [heightCmStr, setHeightCmStr] = useState('')
  const [savingHeight, setSavingHeight] = useState(false)
  const [heightExpanded, setHeightExpanded] = useState(false)

  function loadMetrics() {
    getAllBodyMetrics().then(setAllMetrics)
  }

  useEffect(() => {
    loadMetrics()
    countBodyMetricsWithDefaultFat().then(setDefaultFatCount)
    getProfile().then(p => {
      if (p) {
        setProfile(p)
        setHeightUnit(p.heightUnit)
        if (p.heightUnit === 'imperial') {
          setHeightFtStr(p.heightFt !== null ? String(p.heightFt) : '')
          setHeightInStr(p.heightIn !== null ? String(p.heightIn) : '')
        } else {
          setHeightCmStr(p.heightCm !== null ? String(p.heightCm) : '')
        }
      }
    })
  }, [])

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
    const bodyFatPct = fatStr.trim() ? parseFloat(fatStr) : null
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

  async function handleClearDefaultFat() {
    const ok = window.confirm(
      `Clear body fat from ${defaultFatCount} row${defaultFatCount !== 1 ? 's' : ''} that show exactly 15%?\n\nThis only affects rows with exactly 15.0% — rows you deliberately entered will not be changed if they have a different value.`,
    )
    if (!ok) return
    setClearingFat(true)
    try {
      await clearDefaultBodyFat()
      loadMetrics()
      setDefaultFatCount(0)
    } finally {
      setClearingFat(false)
    }
  }

  async function handleSaveHeight() {
    setSavingHeight(true)
    try {
      if (heightUnit === 'imperial') {
        const ft = parseInt(heightFtStr) || null
        const inches = parseFloat(heightInStr) || 0
        const cm = ft !== null ? (ft * 12 + inches) * 2.54 : null
        await saveProfile({ heightUnit: 'imperial', heightFt: ft, heightIn: inches || null, heightCm: cm })
      } else {
        const cm = parseFloat(heightCmStr) || null
        await saveProfile({ heightUnit: 'cm', heightCm: cm, heightFt: null, heightIn: null })
      }
      setProfile(await getProfile() ?? null)
      setHeightExpanded(false)
    } finally {
      setSavingHeight(false)
    }
  }

  const profileHeightDisplay = useMemo((): string | null => {
    if (!profile) return null
    if (profile.heightUnit === 'imperial' && profile.heightFt !== null) {
      return `${profile.heightFt} ft ${profile.heightIn ?? 0} in`
    }
    if (profile.heightUnit === 'cm' && profile.heightCm !== null) {
      return `${Math.round(profile.heightCm)} cm`
    }
    return null
  }, [profile])

  const profileHeightCm = useMemo((): number | null => {
    if (!profile) return null
    if (profile.heightUnit === 'cm') return profile.heightCm
    if (profile.heightFt !== null) return ((profile.heightFt * 12) + (profile.heightIn ?? 0)) * 2.54
    return null
  }, [profile])

  const start = rangeStart(range)
  const chartData = useMemo(() => {
    const filtered = start ? allMetrics.filter(m => m.date >= start) : allMetrics
    const hM = profileHeightCm ? profileHeightCm / 100 : null
    return filtered.map(m => ({
      date: m.date,
      weightLb: m.weightLb,
      bodyFatPct: m.bodyFatPct,
      ma7: Math.round(sevenDayAvg(allMetrics, m.date) * 10) / 10,
      bmi: hM ? Math.round((m.weightLb * 0.453592 / (hM * hM)) * 10) / 10 : null,
    }))
  }, [allMetrics, start, profileHeightCm])

  const hasFat = chartData.some(d => d.bodyFatPct !== null)
  const hasBmi = showBmi && chartData.some(d => d.bmi !== null)
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

  const tooltipStyle = {
    contentStyle: { background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 4, fontSize: 12, color: PALETTE.fg },
  }

  const historyList = useMemo(() => [...allMetrics].reverse().slice(0, 20), [allMetrics])

  return (
    <>
      {/* Default fat audit banner */}
      {defaultFatCount !== null && defaultFatCount > 0 && (
        <div
          style={{
            background: '#2a1800',
            border: '1px solid #b85a00',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 13,
            color: '#fbe4c7',
          }}
        >
          <p style={{ marginBottom: 6 }}>
            <strong>{defaultFatCount} measurement{defaultFatCount !== 1 ? 's' : ''}</strong> have body fat exactly 15% — these may have been saved by a previous default. You can clear them.
          </p>
          <button
            onClick={() => void handleClearDefaultFat()}
            disabled={clearingFat}
            style={{
              background: '#b85a00',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 12,
              cursor: clearingFat ? 'default' : 'pointer',
              opacity: clearingFat ? 0.6 : 1,
            }}
          >
            {clearingFat ? 'Clearing…' : 'Clear body fat on these rows'}
          </button>
        </div>
      )}

      {/* Log measurement — elevated panel */}
      <section style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          {editingId ? 'Edit measurement' : 'Log measurement'}
        </p>
        <div style={{ background: SURFACE.elevated, border: `1px solid ${BORDER.strong}`, borderRadius: 12, padding: '14px 14px 10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                value={date}
                max={todayStr()}
                onChange={e => setDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Weight (lb)</label>
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
              <label style={labelStyle}>Body fat % <span style={{ color: PALETTE.mute, fontWeight: 400 }}>(optional)</span></label>
              <input
                type="number"
                inputMode="decimal"
                value={fatStr}
                onChange={e => setFatStr(e.target.value)}
                placeholder="Optional"
                style={inputStyle}
              />
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
                  padding: '14px',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: saving || !weightStr ? 'default' : 'pointer',
                  opacity: saving || !weightStr ? 0.5 : 1,
                  minHeight: 48,
                }}
              >
                {saving ? 'Saving…' : editingId ? 'Update' : 'Save measurement'}
              </button>
              {editingId && (
                <button
                  onClick={cancelEdit}
                  style={{
                    background: PALETTE.line,
                    color: PALETTE.dim,
                    border: 'none',
                    borderRadius: 8,
                    padding: '14px 16px',
                    fontSize: 15,
                    cursor: 'pointer',
                    minHeight: 48,
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Height — compact row, expands to edit */}
      <section style={{ marginBottom: 20 }}>
        {profileHeightDisplay && !heightExpanded ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, padding: '10px 14px', minHeight: 44 }}>
            <span style={{ fontSize: 13, color: PALETTE.dim }}>
              Height <span style={{ color: PALETTE.fg, fontVariantNumeric: 'tabular-nums' }}>{profileHeightDisplay}</span>
            </span>
            <button
              onClick={() => setHeightExpanded(true)}
              style={{ fontSize: 13, color: PALETTE.push, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', minHeight: 40 }}
            >
              Edit
            </button>
          </div>
        ) : !profileHeightDisplay && !heightExpanded ? (
          <button
            onClick={() => setHeightExpanded(true)}
            style={{ width: '100%', minHeight: 44, background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, color: PALETTE.mute, fontSize: 13, cursor: 'pointer', textAlign: 'left', padding: '0 14px' }}
          >
            Add height to enable BMI →
          </button>
        ) : (
          <div style={{ background: SURFACE.elevated, border: `1px solid ${BORDER.strong}`, borderRadius: 12, padding: '14px' }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Height</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['imperial', 'cm'] as const).map(u => (
                <button
                  key={u}
                  onClick={() => setHeightUnit(u)}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 20, fontSize: 12, fontWeight: heightUnit === u ? 500 : 400, background: heightUnit === u ? PALETTE.fg : SURFACE.raised, color: heightUnit === u ? PALETTE.ink : PALETTE.dim, border: `1px solid ${heightUnit === u ? PALETTE.fg : BORDER.subtle}`, cursor: 'pointer' }}
                >
                  {u === 'imperial' ? 'ft / in' : 'cm'}
                </button>
              ))}
            </div>
            {heightUnit === 'imperial' ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Feet</label>
                  <input type="number" inputMode="numeric" value={heightFtStr} onChange={e => setHeightFtStr(e.target.value)} placeholder="5" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Inches</label>
                  <input type="number" inputMode="decimal" value={heightInStr} onChange={e => setHeightInStr(e.target.value)} placeholder="10" style={inputStyle} />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Centimetres</label>
                <input type="number" inputMode="decimal" value={heightCmStr} onChange={e => setHeightCmStr(e.target.value)} placeholder="178" style={inputStyle} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => void handleSaveHeight()}
                disabled={savingHeight}
                style={{ flex: 1, minHeight: 44, background: PALETTE.fg, color: PALETTE.ink, border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: savingHeight ? 'default' : 'pointer', opacity: savingHeight ? 0.6 : 1 }}
              >
                {savingHeight ? 'Saving…' : 'Save height'}
              </button>
              {profileHeightDisplay && (
                <button
                  onClick={() => setHeightExpanded(false)}
                  style={{ minHeight: 44, padding: '0 16px', background: PALETTE.line, color: PALETTE.dim, border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
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
          <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {[hasFat && 'body fat', hasBmi && 'BMI'].filter(Boolean).length > 0
              ? `Bodyweight · ${[hasFat && 'body fat', hasBmi && 'BMI'].filter(Boolean).join(' · ')}`
              : 'Bodyweight over time'}
          </p>

          {/* Chart in sunken well */}
          <div style={{ background: SURFACE.sunken, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, padding: '12px 4px 8px', marginBottom: 8 }}>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData} margin={{ top: 8, right: hasFat && hasBmi ? 60 : (hasFat || hasBmi) ? 36 : 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER.subtle} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fill: PALETTE.mute, fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: BORDER.subtle }}
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
                {hasBmi && (
                  <YAxis
                    yAxisId="bmi"
                    orientation="right"
                    domain={['auto', 'auto']}
                    tick={{ fill: PALETTE.mute, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => v.toFixed(1)}
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
                    if (name === 'bmi') return [String(value), 'BMI']
                    return [`${value}%`, 'Body fat']
                  }}
                />
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
                {hasBmi && (
                  <Line
                    yAxisId="bmi"
                    type="monotone"
                    dataKey="bmi"
                    stroke={PALETTE.cardioBorder}
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    dot={{ r: 3, fill: PALETTE.cardioBorder, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>

            <div style={{ display: 'flex', gap: 12, padding: '0 12px 4px', fontSize: 11, color: PALETTE.mute, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 16, height: 2, background: PALETTE.fg, opacity: 0.6, display: 'inline-block' }} />
                Daily
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 16, height: 2, background: PALETTE.push, display: 'inline-block' }} />
                7-day avg
              </span>
              {profileHeightCm && (
                <button
                  onClick={() => setShowBmi(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: showBmi ? PALETTE.cardioBorder : PALETTE.mute, fontSize: 11, padding: 0 }}
                >
                  <span style={{ width: 16, height: 2, background: PALETTE.cardioBorder, opacity: showBmi ? 1 : 0.35, display: 'inline-block' }} />
                  BMI {showBmi ? '(on)' : '(off)'}
                </button>
              )}
            </div>
          </div>

          {/* Stat cards — raised inside sunken container */}
          <div style={{ background: SURFACE.sunken, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, padding: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {latest && (
                <div style={{ background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 8, padding: '8px 12px', flex: 1 }}>
                  <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 2 }}>Current weight</p>
                  <p style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', color: PALETTE.fg }}>{latest.weightLb} lb</p>
                </div>
              )}
              {changeAbs !== null && changePct !== null && (
                <div style={{ background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 8, padding: '8px 12px', flex: 1 }}>
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
                <div style={{ background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 8, padding: '8px 12px', flex: 1 }}>
                  <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 2 }}>Body fat</p>
                  <p style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', color: PALETTE.fg }}>{latest.bodyFatPct}%</p>
                </div>
              )}
            </div>

            {hasBmi && latest?.bmi != null && (
              <div style={{ marginTop: 8, background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <p style={{ fontSize: 10, color: PALETTE.mute }}>BMI</p>
                  <p style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: PALETTE.cardioBorder }}>{latest.bmi}</p>
                </div>
                <p style={{ fontSize: 11, color: PALETTE.mute, marginTop: 4, lineHeight: 1.5 }}>
                  BMI does not distinguish muscle from fat and systematically misclassifies muscular individuals. For someone strength training three days a week, body weight trend and body-fat percentage are more informative.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* History list */}
      {historyList.length > 0 && (
        <section>
          <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Recent measurements</p>
          <div style={{ background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 12, overflow: 'hidden' }}>
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
    </>
  )
}

// ─── Measurements section ─────────────────────────────────────────────────────

type MeasurementFields = {
  chestIn: string
  leftArmIn: string
  rightArmIn: string
  waistIn: string
  hipsIn: string
  leftThighIn: string
  rightThighIn: string
  neckIn: string
  calfIn: string
  notes: string
}

const MEASUREMENT_LABELS: { key: keyof MeasurementFields; label: string }[] = [
  { key: 'chestIn', label: 'Chest (in)' },
  { key: 'neckIn', label: 'Neck (in)' },
  { key: 'waistIn', label: 'Waist (in)' },
  { key: 'hipsIn', label: 'Hips (in)' },
  { key: 'leftArmIn', label: 'Left arm (in)' },
  { key: 'rightArmIn', label: 'Right arm (in)' },
  { key: 'leftThighIn', label: 'Left thigh (in)' },
  { key: 'rightThighIn', label: 'Right thigh (in)' },
  { key: 'calfIn', label: 'Calf (in)' },
]

function emptyMeasurementFields(): MeasurementFields {
  return {
    chestIn: '', leftArmIn: '', rightArmIn: '', waistIn: '', hipsIn: '',
    leftThighIn: '', rightThighIn: '', neckIn: '', calfIn: '', notes: '',
  }
}

function parseMeasurementField(s: string): number | null {
  if (!s.trim()) return null
  const v = parseFloat(s)
  return isNaN(v) || v <= 0 ? null : v
}

function fieldsToRecord(f: MeasurementFields): Omit<DbBodyMeasurement, 'id' | 'date' | 'updatedAt' | 'deletedAt'> {
  return {
    chestIn: parseMeasurementField(f.chestIn),
    leftArmIn: parseMeasurementField(f.leftArmIn),
    rightArmIn: parseMeasurementField(f.rightArmIn),
    waistIn: parseMeasurementField(f.waistIn),
    hipsIn: parseMeasurementField(f.hipsIn),
    leftThighIn: parseMeasurementField(f.leftThighIn),
    rightThighIn: parseMeasurementField(f.rightThighIn),
    neckIn: parseMeasurementField(f.neckIn),
    calfIn: parseMeasurementField(f.calfIn),
    notes: f.notes.trim() || null,
  }
}

function recordToFields(m: DbBodyMeasurement): MeasurementFields {
  return {
    chestIn: m.chestIn !== null ? String(m.chestIn) : '',
    leftArmIn: m.leftArmIn !== null ? String(m.leftArmIn) : '',
    rightArmIn: m.rightArmIn !== null ? String(m.rightArmIn) : '',
    waistIn: m.waistIn !== null ? String(m.waistIn) : '',
    hipsIn: m.hipsIn !== null ? String(m.hipsIn) : '',
    leftThighIn: m.leftThighIn !== null ? String(m.leftThighIn) : '',
    rightThighIn: m.rightThighIn !== null ? String(m.rightThighIn) : '',
    neckIn: m.neckIn !== null ? String(m.neckIn) : '',
    calfIn: m.calfIn !== null ? String(m.calfIn) : '',
    notes: m.notes ?? '',
  }
}

type MeasurementChart = 'chestIn' | 'leftArmIn' | 'rightArmIn' | 'waistIn' | 'hipsIn' | 'leftThighIn' | 'rightThighIn' | 'neckIn' | 'calfIn'
const CHART_OPTIONS: { key: MeasurementChart; label: string }[] = [
  { key: 'chestIn', label: 'Chest' },
  { key: 'neckIn', label: 'Neck' },
  { key: 'waistIn', label: 'Waist' },
  { key: 'hipsIn', label: 'Hips' },
  { key: 'leftArmIn', label: 'Left arm' },
  { key: 'rightArmIn', label: 'Right arm' },
  { key: 'leftThighIn', label: 'Left thigh' },
  { key: 'rightThighIn', label: 'Right thigh' },
  { key: 'calfIn', label: 'Calf' },
]

function MeasurementsSection() {
  const [allMeasurements, setAllMeasurements] = useState<DbBodyMeasurement[]>([])
  const [date, setDate] = useState(todayStr)
  const [fields, setFields] = useState<MeasurementFields>(emptyMeasurementFields)
  const [showMore, setShowMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('all')
  const [chartMetric, setChartMetric] = useState<MeasurementChart>('waistIn')

  function load() {
    getAllBodyMeasurements().then(setAllMeasurements)
  }

  useEffect(() => { load() }, [])

  function setField(k: keyof MeasurementFields, v: string) {
    setFields(f => ({ ...f, [k]: v }))
  }

  function handleSameAsLeft(leftKey: keyof MeasurementFields, rightKey: keyof MeasurementFields) {
    setFields(f => ({ ...f, [rightKey]: f[leftKey] }))
  }

  async function handleSave() {
    const record = fieldsToRecord(fields)
    setSaving(true)
    try {
      if (editingId) {
        await updateBodyMeasurement(editingId, { date, ...record })
        setEditingId(null)
      } else {
        await addBodyMeasurement({ id: crypto.randomUUID(), date, ...record })
      }
      setDate(todayStr())
      setFields(emptyMeasurementFields())
      setShowMore(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  function startEdit(m: DbBodyMeasurement) {
    setEditingId(m.id)
    setDate(m.date)
    setFields(recordToFields(m))
    setShowMore(true)
  }

  function cancelEdit() {
    setEditingId(null)
    setDate(todayStr())
    setFields(emptyMeasurementFields())
    setShowMore(false)
  }

  async function handleDelete(id: string) {
    const ok = window.confirm('Delete this measurement entry?')
    if (!ok) return
    if (editingId === id) cancelEdit()
    await deleteBodyMeasurement(id)
    load()
  }

  const start = rangeStart(range)
  const chartData = useMemo(() => {
    const filtered = start ? allMeasurements.filter(m => m.date >= start) : allMeasurements
    return filtered
      .filter(m => m[chartMetric] !== null)
      .map(m => ({ date: m.date, value: m[chartMetric] as number }))
  }, [allMeasurements, start, chartMetric])

  // Change table
  const changeTable = useMemo(() => {
    const filtered = start ? allMeasurements.filter(m => m.date >= start) : allMeasurements
    if (filtered.length < 2) return null
    const first = filtered[0]
    const last = filtered[filtered.length - 1]
    return CHART_OPTIONS
      .map(({ key, label }) => {
        const v1 = first[key]
        const v2 = last[key]
        if (v1 === null || v2 === null) return null
        return { label, delta: v2 - v1, first: v1, last: v2 }
      })
      .filter(Boolean) as Array<{ label: string; delta: number; first: number; last: number }>
  }, [allMeasurements, start])

  const hasAnyField = Object.entries(fields).some(([k, v]) => k !== 'notes' && v.trim())

  const tooltipStyle = {
    contentStyle: { background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 4, fontSize: 12, color: PALETTE.fg },
  }

  return (
    <>
      {/* Entry form */}
      <section style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          {editingId ? 'Edit entry' : 'Log measurements'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>

          {/* Primary fields: waist always visible */}
          <div>
            <label style={labelStyle}>Waist (in) <OptionalBadge /></label>
            <input type="number" inputMode="decimal" value={fields.waistIn} onChange={e => setField('waistIn', e.target.value)} placeholder="Optional" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Weight — go to Weight tab to log bodyweight</label>
          </div>

          {/* Disclosure toggle */}
          <button
            onClick={() => setShowMore(m => !m)}
            style={{
              background: 'none',
              border: `1px solid ${PALETTE.line}`,
              borderRadius: 8,
              color: PALETTE.dim,
              padding: '8px 14px',
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {showMore ? '− Fewer measurements' : '+ More measurements'}
          </button>

          {showMore && (
            <>
              {/* Chest & Neck */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Chest (in) <OptionalBadge /></label>
                  <input type="number" inputMode="decimal" value={fields.chestIn} onChange={e => setField('chestIn', e.target.value)} placeholder="Optional" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Neck (in) <OptionalBadge /></label>
                  <input type="number" inputMode="decimal" value={fields.neckIn} onChange={e => setField('neckIn', e.target.value)} placeholder="Optional" style={inputStyle} />
                </div>
              </div>
              {/* Hips */}
              <div>
                <label style={labelStyle}>Hips (in) <OptionalBadge /></label>
                <input type="number" inputMode="decimal" value={fields.hipsIn} onChange={e => setField('hipsIn', e.target.value)} placeholder="Optional" style={inputStyle} />
              </div>
              {/* Arms */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Left arm (in) <OptionalBadge /></label>
                  <input type="number" inputMode="decimal" value={fields.leftArmIn} onChange={e => setField('leftArmIn', e.target.value)} placeholder="Optional" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Right arm (in) <OptionalBadge /></label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input type="number" inputMode="decimal" value={fields.rightArmIn} onChange={e => setField('rightArmIn', e.target.value)} placeholder="Optional" style={{ ...inputStyle, flex: 1 }} />
                    <button
                      onClick={() => handleSameAsLeft('leftArmIn', 'rightArmIn')}
                      title="Same as left"
                      style={{ background: PALETTE.line, border: 'none', borderRadius: 6, color: PALETTE.dim, fontSize: 11, padding: '0 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      = L
                    </button>
                  </div>
                </div>
              </div>
              {/* Thighs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Left thigh (in) <OptionalBadge /></label>
                  <input type="number" inputMode="decimal" value={fields.leftThighIn} onChange={e => setField('leftThighIn', e.target.value)} placeholder="Optional" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Right thigh (in) <OptionalBadge /></label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input type="number" inputMode="decimal" value={fields.rightThighIn} onChange={e => setField('rightThighIn', e.target.value)} placeholder="Optional" style={{ ...inputStyle, flex: 1 }} />
                    <button
                      onClick={() => handleSameAsLeft('leftThighIn', 'rightThighIn')}
                      title="Same as left"
                      style={{ background: PALETTE.line, border: 'none', borderRadius: 6, color: PALETTE.dim, fontSize: 11, padding: '0 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      = L
                    </button>
                  </div>
                </div>
              </div>
              {/* Calf */}
              <div>
                <label style={labelStyle}>Calf (in) <OptionalBadge /></label>
                <input type="number" inputMode="decimal" value={fields.calfIn} onChange={e => setField('calfIn', e.target.value)} placeholder="Optional" style={inputStyle} />
              </div>
              {/* Notes */}
              <div>
                <label style={labelStyle}>Notes <OptionalBadge /></label>
                <textarea
                  value={fields.notes}
                  onChange={e => setField('notes', e.target.value)}
                  placeholder="Optional"
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving || (!hasAnyField && !editingId)}
              style={{
                flex: 1,
                background: PALETTE.fg,
                color: PALETTE.ink,
                border: 'none',
                borderRadius: 8,
                padding: '14px',
                fontSize: 15,
                fontWeight: 500,
                cursor: saving || (!hasAnyField && !editingId) ? 'default' : 'pointer',
                opacity: saving || (!hasAnyField && !editingId) ? 0.5 : 1,
                minHeight: 48,
              }}
            >
              {saving ? 'Saving…' : editingId ? 'Update' : 'Save measurements'}
            </button>
            {editingId && (
              <button
                onClick={cancelEdit}
                style={{ background: PALETTE.line, color: PALETTE.dim, border: 'none', borderRadius: 8, padding: '14px 16px', fontSize: 15, cursor: 'pointer', minHeight: 48 }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Chart */}
      {allMeasurements.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          {/* Range */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
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

          {/* Metric picker */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {CHART_OPTIONS.map(o => (
              <button
                key={o.key}
                onClick={() => setChartMetric(o.key)}
                style={{
                  padding: '4px 10px', borderRadius: 16, fontSize: 12,
                  background: chartMetric === o.key ? PALETTE.push : SURFACE.raised,
                  color: chartMetric === o.key ? '#fff' : PALETTE.dim,
                  border: `1px solid ${chartMetric === o.key ? PALETTE.push : BORDER.subtle}`,
                  cursor: 'pointer',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>

          {chartData.length < 2 ? (
            <p style={{ color: PALETTE.mute, fontSize: 13, padding: '12px 0' }}>
              Log at least two {CHART_OPTIONS.find(o => o.key === chartMetric)?.label.toLowerCase()} entries to see a trend.
            </p>
          ) : (
            <div style={{ background: SURFACE.sunken, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, padding: '12px 4px 8px', marginBottom: 12 }}>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER.subtle} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: PALETTE.mute, fontSize: 10 }} tickLine={false} axisLine={{ stroke: BORDER.subtle }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: PALETTE.mute, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}"`} />
                  <Tooltip
                    {...tooltipStyle}
                    labelFormatter={(l: unknown) => typeof l === 'string' ? fmtDate(l) : String(l ?? '')}
                    formatter={(v: unknown) => [`${v}"`, CHART_OPTIONS.find(o => o.key === chartMetric)?.label ?? '']}
                  />
                  <Line type="monotone" dataKey="value" stroke={PALETTE.pull} strokeWidth={2} dot={{ r: 3, fill: PALETTE.pull, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Change table */}
          {changeTable && changeTable.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Change over range</p>
              <div style={{ background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, overflow: 'hidden' }}>
                {changeTable.map((row, i) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      gap: 8,
                      padding: '7px 12px',
                      borderBottom: i < changeTable.length - 1 ? `1px solid ${BORDER.subtle}` : undefined,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 12, color: PALETTE.dim }}>{row.label}</span>
                    <span style={{ fontSize: 12, color: PALETTE.mute, fontVariantNumeric: 'tabular-nums' }}>{row.last}"</span>
                    <span style={{
                      fontSize: 12,
                      fontVariantNumeric: 'tabular-nums',
                      color: row.delta < 0 ? PALETTE.pull : row.delta > 0 ? '#f87171' : PALETTE.mute,
                      minWidth: 44,
                      textAlign: 'right',
                    }}>
                      {row.delta >= 0 ? '+' : ''}{row.delta.toFixed(1)}"
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* History */}
      {allMeasurements.length > 0 && (
        <section>
          <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>History</p>
          <div style={{ background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 12, overflow: 'hidden' }}>
            {[...allMeasurements].reverse().slice(0, 10).map((m, i, arr) => (
              <div
                key={m.id}
                style={{
                  padding: '10px 14px',
                  borderBottom: i < arr.length - 1 ? `1px solid ${PALETTE.line}` : undefined,
                  background: editingId === m.id ? PALETTE.line : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: PALETTE.fg }}>{fmtDate(m.date)}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEdit(m)} style={{ fontSize: 12, color: PALETTE.dim, background: PALETTE.line, border: 'none', borderRadius: 6, padding: '4px 10px', minHeight: 28, cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => void handleDelete(m.id)} style={{ fontSize: 12, color: PALETTE.mute, background: 'none', border: 'none', padding: '4px 6px', minHeight: 28, cursor: 'pointer' }} aria-label="Delete">✕</button>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: PALETTE.mute, marginTop: 2 }}>
                  {MEASUREMENT_LABELS
                    .filter(({ key }) => {
                      const v = m[key as keyof DbBodyMeasurement]
                      return v !== null && v !== undefined && v !== ''
                    })
                    .map(({ key, label }) => `${label.replace(' (in)', '')}: ${m[key as keyof DbBodyMeasurement]}"`)
                    .join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function OptionalBadge() {
  return <span style={{ color: PALETTE.mute, fontWeight: 400, fontSize: 10 }}>optional</span>
}

// ─── Photos section ───────────────────────────────────────────────────────────

type Pose = DbProgressPhoto['pose']
const POSES: Pose[] = ['front', 'side', 'back', 'other']

function PhotosSection() {
  const [photos, setPhotos] = useState<DbProgressPhoto[]>([])
  const [poseFilter, setPoseFilter] = useState<PhotoPoseFilter>('all')
  const [date, setDate] = useState(todayStr)
  const [pose, setPose] = useState<Pose>('front')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [compareA, setCompareA] = useState<string | null>(null)
  const [compareB, setCompareB] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map())
  const fileRef = useRef<HTMLInputElement>(null)

  function load() {
    getAllProgressPhotos().then(ps => {
      setPhotos(ps)
      setPhotoUrls(prev => {
        // Revoke old URLs
        prev.forEach(url => URL.revokeObjectURL(url))
        const next = new Map<string, string>()
        for (const p of ps) {
          next.set(p.id, URL.createObjectURL(p.blob))
        }
        return next
      })
    })
  }

  useEffect(() => {
    load()
    return () => {
      setPhotoUrls(prev => {
        prev.forEach(url => URL.revokeObjectURL(url))
        return new Map()
      })
    }
  }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSaving(true)
    try {
      const { blob, widthPx, heightPx } = await processPhoto(file)
      await addProgressPhoto({
        id: crypto.randomUUID(),
        date,
        pose,
        blob,
        widthPx,
        heightPx,
        notes: notes.trim() || null,
      })
      setNotes('')
      setDate(todayStr())
      load()
    } finally {
      setSaving(false)
      e.target.value = ''
    }
  }

  async function handleDelete(id: string) {
    const ok = window.confirm('Delete this photo?')
    if (!ok) return
    await deleteProgressPhoto(id)
    if (compareA === id) setCompareA(null)
    if (compareB === id) setCompareB(null)
    load()
  }

  async function handleUpdateNotes(id: string, newNotes: string) {
    await updateProgressPhoto(id, { notes: newNotes.trim() || null })
    load()
  }

  const filtered = useMemo(
    () => poseFilter === 'all' ? photos : photos.filter(p => p.pose === poseFilter),
    [photos, poseFilter],
  )

  // Group by date descending
  const grouped = useMemo(() => {
    const map = new Map<string, DbProgressPhoto[]>()
    for (const p of [...filtered].reverse()) {
      if (!map.has(p.date)) map.set(p.date, [])
      map.get(p.date)!.push(p)
    }
    return [...map.entries()]
  }, [filtered])

  const comparePhotoA = compareA ? photos.find(p => p.id === compareA) : null
  const comparePhotoB = compareB ? photos.find(p => p.id === compareB) : null

  return (
    <>
      {/* Privacy statement */}
      <p style={{ fontSize: 12, color: PALETTE.mute, marginBottom: 16 }}>
        Photos are stored on this device only. Nothing is uploaded or shared.
      </p>

      {/* Capture form */}
      <section style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 10 }}>Add photo</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Pose</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {POSES.map(p => (
                <button
                  key={p}
                  onClick={() => setPose(p)}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 13,
                    background: pose === p ? PALETTE.push : PALETTE.panel,
                    color: pose === p ? '#fff' : PALETTE.dim,
                    border: `1px solid ${pose === p ? PALETTE.push : PALETTE.line}`,
                    cursor: 'pointer',
                  }}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Notes <OptionalBadge /></label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional"
              style={inputStyle}
            />
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={saving}
            style={{
              background: PALETTE.push,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '14px',
              fontSize: 15,
              fontWeight: 500,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1,
              minHeight: 48,
            }}
          >
            {saving ? 'Processing…' : 'Take or choose photo'}
          </button>
          <p style={{ fontSize: 11, color: PALETTE.mute }}>
            Photos are resized to max 1600px and saved as WebP to keep storage small.
          </p>
        </div>
      </section>

      {photos.length === 0 ? (
        <p style={{ color: PALETTE.mute, fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
          Add your first progress photo.
        </p>
      ) : (
        <>
          {/* Controls row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            {/* Pose filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', ...POSES] as PhotoPoseFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setPoseFilter(f)}
                  style={{
                    padding: '4px 10px', borderRadius: 16, fontSize: 12,
                    background: poseFilter === f ? PALETTE.fg : PALETTE.panel,
                    color: poseFilter === f ? PALETTE.ink : PALETTE.dim,
                    border: `1px solid ${poseFilter === f ? PALETTE.fg : PALETTE.line}`,
                    cursor: 'pointer',
                  }}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setCompareMode(m => !m); setCompareA(null); setCompareB(null) }}
              style={{
                padding: '4px 12px', borderRadius: 16, fontSize: 12,
                background: compareMode ? PALETTE.pull : PALETTE.panel,
                color: compareMode ? '#fff' : PALETTE.dim,
                border: `1px solid ${compareMode ? PALETTE.pull : PALETTE.line}`,
                cursor: 'pointer',
              }}
            >
              Compare
            </button>
          </div>

          {/* Compare panel */}
          {compareMode && (
            <div style={{ marginBottom: 16 }}>
              {!comparePhotoA || !comparePhotoB ? (
                <p style={{ fontSize: 13, color: PALETTE.mute }}>
                  {!comparePhotoA ? 'Tap a photo to select it for comparison (A).' : 'Tap another photo to compare (B).'}
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <CompareSlot label="A" photo={comparePhotoA} url={photoUrls.get(comparePhotoA.id) ?? ''} onClear={() => setCompareA(null)} />
                  <CompareSlot label="B" photo={comparePhotoB} url={photoUrls.get(comparePhotoB.id) ?? ''} onClear={() => setCompareB(null)} />
                </div>
              )}
            </div>
          )}

          {/* Gallery */}
          {grouped.map(([date, ps]) => (
            <div key={date} style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 8 }}>{fmtDate(date)}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {ps.map(p => (
                  <PhotoCard
                    key={p.id}
                    photo={p}
                    url={photoUrls.get(p.id) ?? ''}
                    compareMode={compareMode}
                    selectedAs={p.id === compareA ? 'A' : p.id === compareB ? 'B' : null}
                    onSelect={() => {
                      if (!compareMode) return
                      if (!compareA) { setCompareA(p.id); return }
                      if (!compareB && p.id !== compareA) { setCompareB(p.id); return }
                    }}
                    onDelete={() => void handleDelete(p.id)}
                    onUpdateNotes={newNotes => void handleUpdateNotes(p.id, newNotes)}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}

function CompareSlot({ label, photo, url, onClear }: { label: string; photo: DbProgressPhoto; url: string; onClear: () => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <img src={url} alt={`${photo.pose} — ${photo.date}`} style={{ width: '100%', borderRadius: 8, display: 'block', aspectRatio: '3/4', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 6px', fontSize: 12, color: '#fff', fontWeight: 500 }}>
        {label} · {fmtDate(photo.date)}
      </div>
      <button onClick={onClear} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 4, color: '#fff', padding: '2px 6px', fontSize: 12, cursor: 'pointer' }}>✕</button>
    </div>
  )
}

function PhotoCard({
  photo,
  url,
  compareMode,
  selectedAs,
  onSelect,
  onDelete,
  onUpdateNotes,
}: {
  photo: DbProgressPhoto
  url: string
  compareMode: boolean
  selectedAs: 'A' | 'B' | null
  onSelect: () => void
  onDelete: () => void
  onUpdateNotes: (notes: string) => void
}) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesVal, setNotesVal] = useState(photo.notes ?? '')

  return (
    <div
      style={{
        borderRadius: 8,
        overflow: 'hidden',
        background: PALETTE.panel,
        border: selectedAs ? `2px solid ${PALETTE.pull}` : `1px solid ${PALETTE.line}`,
        cursor: compareMode ? 'pointer' : 'default',
        position: 'relative',
      }}
      onClick={compareMode ? onSelect : undefined}
    >
      <img
        src={url}
        alt={`${photo.pose} progress photo — ${photo.date}`}
        style={{ width: '100%', display: 'block', aspectRatio: '3/4', objectFit: 'cover' }}
      />
      {selectedAs && (
        <div style={{ position: 'absolute', top: 4, left: 4, background: PALETTE.pull, borderRadius: 4, padding: '2px 6px', fontSize: 12, color: '#fff', fontWeight: 500 }}>
          {selectedAs}
        </div>
      )}
      <div style={{ padding: '6px 8px' }}>
        <p style={{ fontSize: 11, color: PALETTE.dim }}>
          {photo.pose.charAt(0).toUpperCase() + photo.pose.slice(1)} · {photo.widthPx}×{photo.heightPx}
        </p>
        {editingNotes ? (
          <div style={{ marginTop: 4 }}>
            <input
              type="text"
              value={notesVal}
              onChange={e => setNotesVal(e.target.value)}
              style={{ ...inputStyle, fontSize: 12, minHeight: 32, padding: '4px 6px' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <button
                onClick={() => { onUpdateNotes(notesVal); setEditingNotes(false) }}
                style={{ fontSize: 11, background: PALETTE.fg, color: PALETTE.ink, border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
              >
                Save
              </button>
              <button
                onClick={() => { setNotesVal(photo.notes ?? ''); setEditingNotes(false) }}
                style={{ fontSize: 11, background: PALETTE.line, color: PALETTE.dim, border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {photo.notes && <p style={{ fontSize: 11, color: PALETTE.mute, marginTop: 2 }}>{photo.notes}</p>}
            {!compareMode && (
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <button onClick={() => setEditingNotes(true)} style={{ fontSize: 11, color: PALETTE.dim, background: PALETTE.line, border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>Note</button>
                <button onClick={onDelete} style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', padding: '3px 4px', cursor: 'pointer' }}>Delete</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
