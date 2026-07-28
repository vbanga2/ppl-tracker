import { useState, useEffect, useMemo } from 'react'
import type { DbProfile, DbNutritionTarget } from '../../data/db'
import { getProfile, saveProfile, getActiveNutritionTarget, addNutritionTarget, getAllBodyMetrics } from '../../data/repo'
import { PALETTE } from '../../ui/tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityLevel = 'sedentary' | 'lightly' | 'moderately' | 'very' | 'extra'
type Goal = 'maintenance' | 'fat_loss' | 'muscle_gain' | 'recomp'

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (little or no exercise)',
  lightly: 'Lightly active (light exercise 1–3 days/week)',
  moderately: 'Moderately active (moderate exercise 3–5 days/week)',
  very: 'Very active (hard exercise 6–7 days/week)',
  extra: 'Extra active (very hard exercise, physical job)',
}
const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2, lightly: 1.375, moderately: 1.55, very: 1.725, extra: 1.9,
}

// Protein g/kg defaults by goal (spec table)
const PROTEIN_PER_KG: Record<Goal, number> = {
  maintenance: 1.0, fat_loss: 1.8, muscle_gain: 1.9, recomp: 2.2,
}

export interface MicroTargets {
  vitaminDIU: string
  ironMgDay: string
  zincMgDay: string
  vitaminCMgDay: string
  sodiumGDay: string
  addedSugarsPctKcal: string
}

const DEFAULT_MICROS: MicroTargets = {
  vitaminDIU: '400–600',
  ironMgDay: '8',
  zincMgDay: '11',
  vitaminCMgDay: '90',
  sodiumGDay: '2.3',
  addedSugarsPctKcal: '10',
}

function parseMicros(json: string | null | undefined): MicroTargets {
  if (!json) return DEFAULT_MICROS
  try { return { ...DEFAULT_MICROS, ...JSON.parse(json) } } catch { return DEFAULT_MICROS }
}

// ─── TDEE computation ─────────────────────────────────────────────────────────

function profileHeightCm(p: DbProfile | null): number | null {
  if (!p) return null
  if (p.heightUnit === 'cm') return p.heightCm
  if (p.heightFt !== null) return ((p.heightFt * 12) + (p.heightIn ?? 0)) * 2.54
  return null
}

function computeBMR(weightKg: number, heightCm: number, ageYears: number, sex: 'male' | 'female'): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears
  return sex === 'male' ? base + 5 : base - 161
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%',
  background: PALETTE.ink,
  border: `1px solid ${PALETTE.line}`,
  borderRadius: 8,
  padding: '10px 12px',
  color: PALETTE.fg,
  fontSize: 16,
  outline: 'none',
  boxSizing: 'border-box',
}

const MONO_INPUT: React.CSSProperties = {
  ...INPUT,
  fontFamily: 'ui-monospace, monospace',
  fontVariantNumeric: 'tabular-nums',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
      {children}
    </p>
  )
}

function RadioGroup<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string; sub?: string }[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, background: 'none', border: `1px solid ${value === opt.value ? PALETTE.push : PALETTE.line}`,
            borderRadius: 8, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${value === opt.value ? PALETTE.push : PALETTE.mute}`, background: value === opt.value ? PALETTE.push : 'none', flexShrink: 0, marginTop: 1 }} />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, color: PALETTE.fg }}>{opt.label}</span>
            {opt.sub && <span style={{ display: 'block', fontSize: 12, color: PALETTE.mute, marginTop: 2 }}>{opt.sub}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

function MicroField({ label, value, onChange, unit }: { label: string; value: string; onChange: (v: string) => void; unit?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${PALETTE.line}` }}>
      <span style={{ flex: 1, fontSize: 13, color: PALETTE.dim }}>{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: 80, background: PALETTE.ink, border: `1px solid ${PALETTE.line}`, borderRadius: 6, padding: '5px 8px', color: PALETTE.fg, fontSize: 13, outline: 'none', textAlign: 'right', fontFamily: 'ui-monospace, monospace' }}
      />
      {unit && <span style={{ fontSize: 12, color: PALETTE.mute, width: 36, flexShrink: 0 }}>{unit}</span>}
    </div>
  )
}

// ─── NutritionGoalsScreen ─────────────────────────────────────────────────────

export interface NutritionGoalsScreenProps {
  onClose: () => void
  onSaved: () => void
}

export function NutritionGoalsScreen({ onClose, onSaved }: NutritionGoalsScreenProps) {
  const [profile, setProfile] = useState<DbProfile | null>(null)
  const [latestWeightKg, setLatestWeightKg] = useState<number | null>(null)
  const [existingTarget, setExistingTarget] = useState<DbNutritionTarget | null>(null)
  const [saving, setSaving] = useState(false)
  const [showGuidelines, setShowGuidelines] = useState(false)

  // Form state — personal stats
  const [sex, setSex] = useState<'male' | 'female' | ''>('')
  const [ageStr, setAgeStr] = useState('')
  const [activity, setActivity] = useState<ActivityLevel | ''>('')
  const [goal, setGoal] = useState<Goal | ''>('')
  const [surplusChoice, setSurplusChoice] = useState<'200-500' | '500-1000'>('200-500')

  // Macro overrides (empty = use computed)
  const [kcalStr, setKcalStr] = useState('')
  const [proteinStr, setProteinStr] = useState('')
  const [carbStr, setCarbStr] = useState('')
  const [fatStr, setFatStr] = useState('')

  // Micronutrient targets
  const [micros, setMicros] = useState<MicroTargets>(DEFAULT_MICROS)

  useEffect(() => {
    const today = todayStr()
    Promise.all([
      getProfile(),
      getAllBodyMetrics(),
      getActiveNutritionTarget(today),
    ]).then(([p, metrics, target]) => {
      if (p) {
        setProfile(p)
        if (p.sex) setSex(p.sex)
        if (p.ageYears) setAgeStr(String(p.ageYears))
        if (p.activityLevel) setActivity(p.activityLevel)
        if (p.goal) setGoal(p.goal as Goal)
        if (p.surplusChoice) setSurplusChoice(p.surplusChoice)
        setMicros(parseMicros(p.microTargetsJson))
      }
      if (metrics.length > 0) {
        const latest = [...metrics].sort((a, b) => b.date.localeCompare(a.date))[0]
        setLatestWeightKg(latest.weightLb * 0.453592)
      }
      if (target) {
        setExistingTarget(target)
        setKcalStr(String(target.kcal))
        setProteinStr(String(target.proteinG))
        setCarbStr(String(target.carbG))
        setFatStr(String(target.fatG))
      }
    })
  }, [])

  const heightCm = useMemo(() => profileHeightCm(profile), [profile])

  // ─── Computed TDEE ──

  const computed = useMemo(() => {
    if (!sex || !ageStr || !activity || !latestWeightKg || !heightCm) return null
    const age = parseInt(ageStr)
    if (!age || age < 10 || age > 120) return null
    const bmr = computeBMR(latestWeightKg, heightCm, age, sex as 'male' | 'female')
    const tdee = bmr * ACTIVITY_FACTORS[activity as ActivityLevel]
    return { bmr: Math.round(bmr), tdee: Math.round(tdee) }
  }, [sex, ageStr, activity, latestWeightKg, heightCm])

  const computedMacros = useMemo(() => {
    if (!computed || !latestWeightKg || !goal) return null
    const { bmr, tdee } = computed

    let kcal: number
    if (goal === 'maintenance') kcal = tdee
    else if (goal === 'fat_loss') kcal = tdee - 500
    else if (goal === 'muscle_gain') kcal = tdee + (surplusChoice === '200-500' ? 350 : 750)
    else kcal = tdee // recomp starts at maintenance

    // BMR floor
    const floored = kcal < bmr
    kcal = Math.max(kcal, bmr)

    const proteinG = Math.round(latestWeightKg * PROTEIN_PER_KG[goal as Goal])
    const fatG = Math.round((kcal * 0.25) / 9)
    const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4))

    const proteinPct = Math.round((proteinG * 4 / kcal) * 100)
    const fatPct = Math.round((fatG * 9 / kcal) * 100)
    const carbPct = Math.round((carbG * 4 / kcal) * 100)

    return { kcal, proteinG, fatG, carbG, proteinPct, fatPct, carbPct, floored, bmr }
  }, [computed, latestWeightKg, goal, surplusChoice])

  // Effective macro values (override if user typed something)
  const effectiveKcal = parseFloat(kcalStr) || computedMacros?.kcal || 0
  const effectiveProtein = parseFloat(proteinStr) || computedMacros?.proteinG || 0
  const effectiveCarb = parseFloat(carbStr) || computedMacros?.carbG || 0
  const effectiveFat = parseFloat(fatStr) || computedMacros?.fatG || 0

  const macroKcalSum = effectiveProtein * 4 + effectiveCarb * 4 + effectiveFat * 9
  const macroMismatch = effectiveKcal > 0 && Math.abs(macroKcalSum - effectiveKcal) > 50

  function setComputedMacros() {
    if (!computedMacros) return
    setKcalStr(String(computedMacros.kcal))
    setProteinStr(String(computedMacros.proteinG))
    setCarbStr(String(computedMacros.carbG))
    setFatStr(String(computedMacros.fatG))
  }

  // Auto-fill macros when computed values change and user hasn't typed
  const [autoFilled, setAutoFilled] = useState(false)
  useMemo(() => {
    if (computedMacros && !autoFilled && !existingTarget) {
      setKcalStr(String(computedMacros.kcal))
      setProteinStr(String(computedMacros.proteinG))
      setCarbStr(String(computedMacros.carbG))
      setFatStr(String(computedMacros.fatG))
      setAutoFilled(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedMacros])

  function setMicro(key: keyof MicroTargets, value: string) {
    setMicros(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    const kcal = parseFloat(kcalStr)
    const proteinG = parseFloat(proteinStr)
    const carbG = parseFloat(carbStr)
    const fatG = parseFloat(fatStr)
    if (!kcal || !proteinG || !carbG || !fatG) return
    setSaving(true)
    try {
      await saveProfile({
        sex: sex || null,
        ageYears: parseInt(ageStr) || null,
        activityLevel: (activity as ActivityLevel) || null,
        goal: (goal as Goal) || null,
        surplusChoice: goal === 'muscle_gain' ? surplusChoice : null,
        microTargetsJson: JSON.stringify(micros),
      })
      await addNutritionTarget({
        effectiveFrom: todayStr(),
        kcal: Math.round(kcal),
        proteinG: Math.round(proteinG),
        carbG: Math.round(carbG),
        fatG: Math.round(fatG),
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const canSave = effectiveKcal > 0 && effectiveProtein > 0 && effectiveCarb > 0 && effectiveFat > 0

  // ─── Height display ──

  function heightDisplay(): string {
    if (!profile) return 'Not set — add in Body tab'
    const cm = heightCm
    if (!cm) return 'Not set — add in Body tab'
    const totalIn = cm / 2.54
    const ft = Math.floor(totalIn / 12)
    const inches = Math.round(totalIn % 12)
    return `${ft} ft ${inches} in (${Math.round(cm)} cm)`
  }

  // ─── Render ──

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: PALETTE.ink }}>
      {/* Header */}
      <div style={{ background: PALETTE.panel, borderBottom: `1px solid ${PALETTE.line}`, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minHeight: 56 }}>
        <button onClick={onClose} style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PALETTE.dim, background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, flexShrink: 0 }} aria-label="Close">
          ←
        </button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 500, color: PALETTE.fg }}>Nutrition goals</span>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !canSave}
          style={{ minHeight: 36, padding: '0 18px', background: canSave ? PALETTE.push : PALETTE.line, color: canSave ? '#fff' : PALETTE.mute, border: 'none', borderRadius: 8, fontWeight: 500, fontSize: 15, cursor: canSave && !saving ? 'pointer' : 'default', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 60px' }}>

        {/* ─── Personal stats ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionLabel>Personal stats</SectionLabel>

          {/* Sex */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 8 }}>Biological sex (for BMR formula)</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['male', 'female'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSex(s)}
                  style={{ flex: 1, minHeight: 44, borderRadius: 8, border: `1px solid ${sex === s ? PALETTE.push : PALETTE.line}`, background: sex === s ? 'rgba(50,100,216,0.15)' : 'none', color: sex === s ? PALETTE.push : PALETTE.dim, fontSize: 14, cursor: 'pointer', fontWeight: sex === s ? 500 : 400 }}
                >
                  {s === 'male' ? 'Male' : 'Female'}
                </button>
              ))}
            </div>
          </div>

          {/* Age */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 8 }}>Age (years)</p>
            <input
              type="number"
              inputMode="numeric"
              value={ageStr}
              onChange={e => setAgeStr(e.target.value)}
              placeholder="30"
              style={MONO_INPUT}
            />
          </div>

          {/* Height (read-only, set from Body tab) */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 8 }}>Height (set in Body tab)</p>
            <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: heightCm ? PALETTE.fg : PALETTE.mute }}>
              {heightDisplay()}
            </div>
          </div>

          {/* Weight (read-only) */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 8 }}>Current weight (from Body tab)</p>
            <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: latestWeightKg ? PALETTE.fg : PALETTE.mute }}>
              {latestWeightKg
                ? `${(latestWeightKg / 0.453592).toFixed(1)} lb (${latestWeightKg.toFixed(1)} kg)`
                : 'Not logged — add a measurement in Body tab'}
            </div>
          </div>

          {/* Activity level */}
          <div style={{ marginBottom: 0 }}>
            <p style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 8 }}>Activity level</p>
            <RadioGroup
              value={activity}
              options={(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([v, label]) => ({ value: v, label }))}
              onChange={setActivity}
            />
          </div>
        </div>

        {/* ─── TDEE ── */}
        {computed && (
          <div style={{ marginBottom: 28, background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 10, padding: '14px 16px' }}>
            <SectionLabel>Estimated energy expenditure (Mifflin-St Jeor)</SectionLabel>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 2 }}>BMR</p>
                <p style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums', color: PALETTE.fg }}>{computed.bmr.toLocaleString()}</p>
                <p style={{ fontSize: 11, color: PALETTE.mute }}>kcal/day</p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 10, color: PALETTE.mute, marginBottom: 2 }}>TDEE</p>
                <p style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums', color: PALETTE.push }}>{computed.tdee.toLocaleString()}</p>
                <p style={{ fontSize: 11, color: PALETTE.mute }}>kcal/day · ×{ACTIVITY_FACTORS[activity as ActivityLevel]}</p>
              </div>
            </div>
            <p style={{ fontSize: 11, color: PALETTE.mute, marginTop: 10, lineHeight: 1.5 }}>
              These are estimates based on your inputs. TDEE changes as your weight or activity level changes. Past targets are not silently updated when your stats change.
            </p>
          </div>
        )}

        {/* ─── Goal ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionLabel>Goal</SectionLabel>

          {/* Spec reference table */}
          <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: PALETTE.dim, lineHeight: 1.6 }}>
            <p style={{ fontWeight: 500, color: PALETTE.fg, marginBottom: 6 }}>From your research (Open Evidence table)</p>
            <p>Maintenance → TDEE · protein 0.8–1.2 g/kg</p>
            <p>Fat loss → −500–750 kcal/day · protein 1.2–2.4 g/kg</p>
            <p>Muscle gain → +200–500 kcal/day · protein 1.6–2.2 g/kg</p>
            <p>Recomposition → slight deficit to maintenance · protein 2.0–2.4 g/kg</p>
          </div>

          <RadioGroup
            value={goal}
            options={[
              { value: 'maintenance' as Goal, label: 'Weight maintenance', sub: 'Target: TDEE · Protein 0.8–1.2 g/kg/day' },
              { value: 'fat_loss' as Goal, label: 'Fat loss', sub: 'Deficit 500–750 kcal/day · Protein 1.2–2.4 g/kg/day (higher during restriction)' },
              { value: 'muscle_gain' as Goal, label: 'Muscle gain', sub: 'Calorie surplus above TDEE · Protein 1.6–2.2 g/kg/day' },
              { value: 'recomp' as Goal, label: 'Body recomposition', sub: 'Slight deficit to maintenance · Protein 2.0–2.4 g/kg/day · High-volume resistance + HIIT' },
            ]}
            onChange={setGoal}
          />

          {/* Muscle gain surplus conflict */}
          {goal === 'muscle_gain' && (
            <div style={{ marginTop: 14, background: '#1a1500', border: `1px solid #6b5000`, borderRadius: 8, padding: '12px 14px' }}>
              <p style={{ fontSize: 13, color: '#c89b00', fontWeight: 500, marginBottom: 6 }}>Your two sources disagree on the muscle-gain surplus</p>
              <p style={{ fontSize: 12, color: PALETTE.dim, marginBottom: 12, lineHeight: 1.5 }}>
                Your Open Evidence table: +200–500 kcal/day above maintenance.<br />
                Your macro notes: +500–1,000 kcal/day above maintenance.<br />
                The smaller surplus is the more conservative choice for limiting fat gain.
              </p>
              <RadioGroup
                value={surplusChoice}
                options={[
                  { value: '200-500' as const, label: '+200–500 kcal/day (conservative, less fat gain)', sub: 'Default · from your Open Evidence table' },
                  { value: '500-1000' as const, label: '+500–1,000 kcal/day (aggressive, faster mass gain)', sub: 'From your macro notes' },
                ]}
                onChange={setSurplusChoice}
              />
            </div>
          )}
        </div>

        {/* ─── Macro targets ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionLabel>Calorie and macro targets</SectionLabel>

          {computedMacros?.floored && (
            <div style={{ background: '#1a1500', border: `1px solid #6b5000`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#c89b00', lineHeight: 1.5 }}>
              The deficit for this goal would bring calories below BMR ({computedMacros.bmr.toLocaleString()} kcal). The target has been floored at BMR to avoid severe restriction.
            </div>
          )}

          {computedMacros && (
            <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: PALETTE.dim, lineHeight: 1.5 }}>
              <p style={{ color: PALETTE.fg, fontWeight: 500, marginBottom: 4 }}>Computed defaults</p>
              <p>Calories: {computedMacros.kcal.toLocaleString()} kcal</p>
              <p>Protein: {computedMacros.proteinG} g ({computedMacros.proteinPct}% of calories)</p>
              <p>Carbs: {computedMacros.carbG} g ({computedMacros.carbPct}% of calories)</p>
              <p>Fat: {computedMacros.fatG} g ({computedMacros.fatPct}% of calories)</p>
              <button onClick={setComputedMacros} style={{ marginTop: 8, fontSize: 12, color: PALETTE.push, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                ↺ Reset to computed defaults
              </button>
            </div>
          )}

          <p style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 10 }}>Override any target manually. Ranges from your research: protein 10–35%, fat 20–35%, carbs 45–65% of total calories.</p>

          {/* Macro inputs */}
          {[
            { label: 'Calories (kcal)', value: kcalStr, set: setKcalStr, pct: null },
            { label: 'Protein (g)', value: proteinStr, set: setProteinStr, pct: effectiveKcal > 0 ? Math.round((parseFloat(proteinStr || '0') * 4 / effectiveKcal) * 100) : null },
            { label: 'Carbs (g)', value: carbStr, set: setCarbStr, pct: effectiveKcal > 0 ? Math.round((parseFloat(carbStr || '0') * 4 / effectiveKcal) * 100) : null },
            { label: 'Fat (g)', value: fatStr, set: setFatStr, pct: effectiveKcal > 0 ? Math.round((parseFloat(fatStr || '0') * 9 / effectiveKcal) * 100) : null },
          ].map(({ label, value, set, pct }) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: PALETTE.dim }}>{label}</span>
                {pct !== null && pct > 0 && <span style={{ fontSize: 12, color: PALETTE.mute }}>{pct}% of calories</span>}
              </div>
              <input
                type="number"
                inputMode="decimal"
                value={value}
                onChange={e => set(e.target.value)}
                placeholder="—"
                style={MONO_INPUT}
              />
            </div>
          ))}

          {macroMismatch && (
            <div style={{ background: '#1a1500', border: `1px solid #6b5000`, borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#c89b00', lineHeight: 1.5 }}>
              Macros sum to {Math.round(macroKcalSum).toLocaleString()} kcal but calorie target is {Math.round(effectiveKcal).toLocaleString()} kcal (difference: {Math.abs(Math.round(macroKcalSum - effectiveKcal))} kcal). Adjust to make them consistent.
            </div>
          )}

          {/* Verbatim protein note from spec */}
          <div style={{ marginTop: 14, background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: '12px 14px', fontSize: 12, color: PALETTE.dim, lineHeight: 1.6 }}>
            <p style={{ fontWeight: 500, color: PALETTE.fg, marginBottom: 6 }}>From your research</p>
            <p>
              Protein is the single most important macronutrient lever for body composition across all energy-balance states, and resistance training is essential whether the goal is fat loss, muscle gain, or recomposition.
            </p>
            <p style={{ marginTop: 6 }}>
              ISSN figures: 1.4–2.0 g/kg/day for most exercising individuals, rising to 2.3–3.1 g/kg/day during hypocaloric periods to preserve lean mass.
            </p>
            <p style={{ marginTop: 6, color: PALETTE.mute }}>
              Fat: emphasise unsaturated fats from liquid vegetable oils, nuts, seeds, fish.<br />
              Carbs: emphasise whole grains, fruits, vegetables. Limit simple sugars to under 10% of calories.
            </p>
          </div>
        </div>

        {/* ─── Micronutrient targets ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionLabel>Micronutrient targets</SectionLabel>

          <div style={{ background: '#0f1f10', border: `1px solid #1d5c24`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#7dc882', lineHeight: 1.5 }}>
            From your research: most adults achieve adequate micronutrients without supplementation — with the exception of vitamin D. Essentially all adults fall short of the vitamin D target.
          </div>

          <p style={{ fontSize: 12, color: PALETTE.mute, marginBottom: 12, lineHeight: 1.5 }}>
            Defaults from your research, all editable. Only nutrients where logged foods carry data will appear in the diary panel — "insufficient data" means the food database doesn't include that nutrient, not that you're deficient.
          </p>

          <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 10, padding: '0 14px' }}>
            <MicroField label="Vitamin D (IU/day)" value={micros.vitaminDIU} onChange={v => setMicro('vitaminDIU', v)} unit="IU" />
            <MicroField label="Iron (mg/day)" value={micros.ironMgDay} onChange={v => setMicro('ironMgDay', v)} unit="mg" />
            <MicroField label="Zinc (mg/day)" value={micros.zincMgDay} onChange={v => setMicro('zincMgDay', v)} unit="mg" />
            <MicroField label="Vitamin C (mg/day)" value={micros.vitaminCMgDay} onChange={v => setMicro('vitaminCMgDay', v)} unit="mg" />
            <MicroField label="Sodium (max g/day)" value={micros.sodiumGDay} onChange={v => setMicro('sodiumGDay', v)} unit="g" />
            <MicroField label="Added sugars (max % kcal)" value={micros.addedSugarsPctKcal} onChange={v => setMicro('addedSugarsPctKcal', v)} unit="%" />
          </div>

          <div style={{ marginTop: 12, background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: PALETTE.mute, lineHeight: 1.6 }}>
            <p style={{ color: PALETTE.dim, marginBottom: 4 }}>Qualitative targets (from your research, not trackable numerically)</p>
            <p>Calcium: generally adequate via dairy or fortified foods</p>
            <p>B vitamins: adequate through a varied diet — whole grains, lean meats, fortified cereals</p>
            <p>Omega-3: at least 2 servings of fatty fish weekly (salmon, mackerel)</p>
          </div>
        </div>

        {/* ─── Dietary pattern guidelines ── */}
        <div style={{ marginBottom: 28 }}>
          <button
            onClick={() => setShowGuidelines(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 10, padding: '12px 16px', cursor: 'pointer', color: PALETTE.dim, fontSize: 14 }}
          >
            <span>Dietary pattern guidelines</span>
            <span style={{ fontSize: 12, transform: showGuidelines ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▼</span>
          </button>

          {showGuidelines && (
            <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '14px 16px', fontSize: 13, color: PALETTE.dim, lineHeight: 1.7 }}>
              <p style={{ color: PALETTE.fg, fontWeight: 500, marginBottom: 8 }}>Reference (from your research)</p>
              <p>🥦 Vegetables: 4.5 cups/day</p>
              <p>🍎 Fruits: whole fruits and berries</p>
              <p>🌾 Whole grains: at least half of grain intake</p>
              <p>🍗 Lean proteins: poultry, fish, eggs, legumes, nuts — limit red meat, avoid processed meats</p>
              <p>🥛 Low-fat dairy: 2–3 servings/day (milk, yoghurt, cheese)</p>
              <p>🫒 Healthy oils: olive oil, plant oils, seafood oils</p>
              <p style={{ marginTop: 6, color: PALETTE.mute }}>Limit added sugars to under 10% of calories, sodium under 2.3 g/day</p>
            </div>
          )}
        </div>

        {/* Save at bottom too */}
        <button
          onClick={() => void handleSave()}
          disabled={saving || !canSave}
          style={{ width: '100%', minHeight: 52, background: canSave ? PALETTE.push : PALETTE.line, color: canSave ? '#fff' : PALETTE.mute, border: 'none', borderRadius: 12, fontWeight: 500, fontSize: 16, cursor: canSave && !saving ? 'pointer' : 'default', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : canSave ? 'Save goals' : 'Fill in macros to save'}
        </button>
      </div>
    </div>
  )
}
