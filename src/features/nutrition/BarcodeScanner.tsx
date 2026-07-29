import { useState, useEffect, useRef, useMemo } from 'react'
import type { DbFood } from '../../data/db'
import { addFood, getFoodByBarcode } from '../../data/repo'
import { lookupBarcode, kcalSanityWarning } from '../../data/off'
import type { OFFParsed } from '../../data/off'
import { PALETTE, SURFACE, BORDER } from '../../ui/tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | { kind: 'scanning' }
  | { kind: 'denied' }
  | { kind: 'looking_up'; barcode: string }
  | { kind: 'off_found'; barcode: string; parsed: OFFParsed }
  | { kind: 'not_found'; barcode: string; offError: boolean }
  | { kind: 'saving' }

interface DraftFields {
  name: string
  brand: string
  servingDesc: string
  servingGrams: string  // only required when original had no serving_size
  kcal: string
  protein: string
  carb: string
  fat: string
  fiber: string
  sugar: string
  sodiumMg: string
  satFat: string
}

export interface BarcodeScannerProps {
  /** Called with the DbFood once a food is found locally or created from OFF / manual entry. */
  onFoodReady: (food: DbFood) => void
  onClose: () => void
}

// ─── Shared input style ───────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%',
  background: SURFACE.sunken,
  border: `1px solid ${BORDER.subtle}`,
  borderRadius: 8,
  padding: '10px 12px',
  color: PALETTE.fg,
  fontSize: 15,
  outline: 'none',
}

const MONO_INPUT: React.CSSProperties = {
  ...INPUT,
  fontFamily: 'ui-monospace, monospace',
  fontVariantNumeric: 'tabular-nums',
}

const OVERLAY_HEADER: React.CSSProperties = {
  background: SURFACE.elevated,
  borderBottom: `1px solid ${BORDER.subtle}`,
  paddingTop: 'max(env(safe-area-inset-top), 0px)',
  paddingLeft: 16,
  paddingRight: 16,
  paddingBottom: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
  minHeight: 56,
}

// ─── FoodDraftForm ─────────────────────────────────────────────────────────────
// Shared between "review OFF result" and "not found — enter manually".

interface FoodDraftFormProps {
  title: string
  barcode: string
  initial: DraftFields
  requireGrams: boolean   // true when OFF had no serving_size
  isOFF: boolean
  saving: boolean
  onSave: (fields: DraftFields) => void
  onCancel: () => void
}

function FoodDraftForm({
  title, barcode, initial, requireGrams, isOFF, saving, onSave, onCancel,
}: FoodDraftFormProps) {
  const [fields, setFields] = useState<DraftFields>(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof DraftFields, string>>>({})

  function set(k: keyof DraftFields, v: string) {
    setFields(p => ({ ...p, [k]: v }))
    if (errors[k]) setErrors(p => ({ ...p, [k]: undefined }))
  }

  const kcalNum = parseFloat(fields.kcal) || null
  const proteinNum = parseFloat(fields.protein) || null
  const carbNum = parseFloat(fields.carb) || null
  const fatNum = parseFloat(fields.fat) || null

  const kcalWarning = useMemo(
    () => kcalSanityWarning(kcalNum, proteinNum, carbNum, fatNum),
    [kcalNum, proteinNum, carbNum, fatNum],
  )

  function validate(): boolean {
    const errs: Partial<Record<keyof DraftFields, string>> = {}
    if (!fields.name.trim()) errs.name = 'Required'
    if (!fields.kcal.trim() || isNaN(parseFloat(fields.kcal))) errs.kcal = 'Required'
    if (!fields.protein.trim() || isNaN(parseFloat(fields.protein))) errs.protein = 'Required'
    if (!fields.carb.trim() || isNaN(parseFloat(fields.carb))) errs.carb = 'Required'
    if (!fields.fat.trim() || isNaN(parseFloat(fields.fat))) errs.fat = 'Required'
    if (!fields.servingDesc.trim() && !requireGrams) errs.servingDesc = 'Required'
    if (requireGrams && (!fields.servingGrams.trim() || isNaN(parseFloat(fields.servingGrams)))) {
      errs.servingGrams = 'Required — enter weight in grams'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSave() {
    if (validate()) onSave(fields)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 48px' }}>
      <div style={{ background: SURFACE.elevated, border: `1px solid ${BORDER.strong}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: PALETTE.mute, fontFamily: 'ui-monospace, monospace' }}>
          Barcode: {barcode}
        </div>
      </div>

      {requireGrams && (
        <div style={{ background: '#1a1500', border: '1px solid #6b5000', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13, color: '#c89b00', lineHeight: 1.5 }}>
          This product has no serving size — enter the weight in grams for the serving description you'll use.
        </div>
      )}

      {kcalWarning && (
        <div style={{ background: '#1a1500', border: '1px solid #6b5000', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13, color: '#c89b00', lineHeight: 1.5 }}>
          {kcalWarning}
        </div>
      )}

      <FormField label="Name" required error={errors.name}>
        <input value={fields.name} onChange={e => set('name', e.target.value)} placeholder="Product name" style={INPUT} />
      </FormField>
      <FormField label="Brand" hint="optional">
        <input value={fields.brand} onChange={e => set('brand', e.target.value)} placeholder="—" style={INPUT} />
      </FormField>

      {requireGrams ? (
        <FormField label="Serving weight (g)" required error={errors.servingGrams}>
          <input
            value={fields.servingGrams}
            onChange={e => set('servingGrams', e.target.value)}
            placeholder="e.g. 30"
            inputMode="decimal"
            style={MONO_INPUT}
          />
        </FormField>
      ) : (
        <FormField label="Serving description" required error={errors.servingDesc}>
          <input value={fields.servingDesc} onChange={e => set('servingDesc', e.target.value)} placeholder="e.g. 1 cup, 30g, 1 bar" style={INPUT} />
        </FormField>
      )}

      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 600, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Macros per serving
      </div>

      <FormField label="Calories (kcal)" required error={errors.kcal}>
        <input value={fields.kcal} onChange={e => set('kcal', e.target.value)} inputMode="decimal" placeholder="0" style={MONO_INPUT} />
      </FormField>
      <FormField label="Protein (g)" required error={errors.protein}>
        <input value={fields.protein} onChange={e => set('protein', e.target.value)} inputMode="decimal" placeholder="0" style={MONO_INPUT} />
      </FormField>
      <FormField label="Carbs (g)" required error={errors.carb}>
        <input value={fields.carb} onChange={e => set('carb', e.target.value)} inputMode="decimal" placeholder="0" style={MONO_INPUT} />
      </FormField>
      <FormField label="Fat (g)" required error={errors.fat}>
        <input value={fields.fat} onChange={e => set('fat', e.target.value)} inputMode="decimal" placeholder="0" style={MONO_INPUT} />
      </FormField>

      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 600, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Optional
      </div>
      <FormField label="Fiber (g)">
        <input value={fields.fiber} onChange={e => set('fiber', e.target.value)} inputMode="decimal" placeholder="—" style={MONO_INPUT} />
      </FormField>
      <FormField label="Sugar (g)">
        <input value={fields.sugar} onChange={e => set('sugar', e.target.value)} inputMode="decimal" placeholder="—" style={MONO_INPUT} />
      </FormField>
      <FormField label="Sodium (mg)">
        <input value={fields.sodiumMg} onChange={e => set('sodiumMg', e.target.value)} inputMode="decimal" placeholder="—" style={MONO_INPUT} />
      </FormField>
      <FormField label="Sat fat (g)">
        <input value={fields.satFat} onChange={e => set('satFat', e.target.value)} inputMode="decimal" placeholder="—" style={MONO_INPUT} />
      </FormField>

      {isOFF && (
        <p style={{ fontSize: 12, color: PALETTE.mute, marginBottom: 16, textAlign: 'center', lineHeight: 1.5 }}>
          Data from{' '}
          <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer" style={{ color: PALETTE.dim, textDecoration: 'underline' }}>
            Open Food Facts
          </a>
          {' '}· ODbL
        </p>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onCancel}
          style={{ minHeight: 48, padding: '0 20px', background: SURFACE.raised, border: `1px solid ${BORDER.subtle}`, borderRadius: 10, color: PALETTE.dim, fontSize: 15, cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ flex: 1, minHeight: 48, background: PALETTE.push, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 500, fontSize: 15, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving…' : 'Save & log'}
        </button>
      </div>
    </div>
  )
}

function FormField({
  label, required, hint, error, children,
}: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 13, color: PALETTE.dim }}>{label}</span>
        {required && <span style={{ fontSize: 11, color: PALETTE.mute }}>required</span>}
        {hint && <span style={{ fontSize: 11, color: PALETTE.mute }}>{hint}</span>}
      </div>
      {children}
      {error && <p style={{ marginTop: 4, fontSize: 12, color: '#e57373' }}>{error}</p>}
    </div>
  )
}

// ─── ManualBarcodeInput ───────────────────────────────────────────────────────

function ManualBarcodeInput({ onSubmit }: { onSubmit: (barcode: string) => void }) {
  const [value, setValue] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Enter barcode number"
        style={{ ...MONO_INPUT, flex: 1 }}
      />
      <button
        type="submit"
        disabled={!value.trim()}
        style={{ minHeight: 44, padding: '0 16px', background: PALETTE.push, border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 500, cursor: value.trim() ? 'pointer' : 'default', opacity: value.trim() ? 1 : 0.5, flexShrink: 0 }}
      >
        Look up
      </button>
    </form>
  )
}

// ─── helpers to map between DraftFields and DbFood ───────────────────────────

function parsedToDraft(p: OFFParsed): DraftFields {
  return {
    name: p.name,
    brand: p.brand ?? '',
    servingDesc: p.servingDesc ?? '',
    servingGrams: p.servingGrams !== null ? String(p.servingGrams) : '',
    kcal: p.kcal !== null ? String(p.kcal) : '',
    protein: p.proteinG !== null ? String(p.proteinG) : '',
    carb: p.carbG !== null ? String(p.carbG) : '',
    fat: p.fatG !== null ? String(p.fatG) : '',
    fiber: p.fiberG !== null ? String(p.fiberG) : '',
    sugar: p.sugarG !== null ? String(p.sugarG) : '',
    sodiumMg: p.sodiumMg !== null ? String(p.sodiumMg) : '',
    satFat: p.satFatG !== null ? String(p.satFatG) : '',
  }
}

const EMPTY_DRAFT: DraftFields = {
  name: '', brand: '', servingDesc: '', servingGrams: '',
  kcal: '', protein: '', carb: '', fat: '',
  fiber: '', sugar: '', sodiumMg: '', satFat: '',
}

function toOptNum(s: string): number | null {
  const v = parseFloat(s)
  return s.trim() === '' || isNaN(v) ? null : v
}

async function draftToFood(
  fields: DraftFields,
  barcode: string,
  source: 'off' | 'manual',
  requireGrams: boolean,
): Promise<DbFood> {
  const servingGramsNum = requireGrams ? parseFloat(fields.servingGrams) : toOptNum(fields.servingGrams)
  const servingDesc = requireGrams ? `${Math.round(servingGramsNum ?? 0)}g` : fields.servingDesc.trim()

  return addFood({
    barcode,
    name: fields.name.trim(),
    brand: fields.brand.trim() || null,
    source,
    servingDesc,
    servingGrams: servingGramsNum || null,
    kcal: parseFloat(fields.kcal),
    proteinG: parseFloat(fields.protein),
    carbG: parseFloat(fields.carb),
    fatG: parseFloat(fields.fat),
    fiberG: toOptNum(fields.fiber),
    sugarG: toOptNum(fields.sugar),
    sodiumMg: toOptNum(fields.sodiumMg),
    satFatG: toOptNum(fields.satFat),
    microsJson: null,
    lastUsedAt: Date.now(),
    useCount: 0,
  })
}

// ─── BarcodeScanner ───────────────────────────────────────────────────────────

export function BarcodeScanner({ onFoodReady, onClose }: BarcodeScannerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' })
  const videoRef = useRef<HTMLVideoElement>(null)
  // Store the controls so we can stop on unmount or when a barcode is found
  const stopRef = useRef<(() => void) | null>(null)
  // Debounce: ignore repeat reads of the same code within 2s
  const lastCodeRef = useRef<string | null>(null)
  const lastCodeTimestampRef = useRef<number>(0)

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      if (!videoRef.current) return
      try {
        // Dynamic import so ZXing is code-split out of the main bundle
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelled) return

        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          (result, _error, _controls) => {
            if (!result) return
            const code = result.getText()
            const now = Date.now()
            // Ignore if same code scanned within 2s
            if (code === lastCodeRef.current && now - lastCodeTimestampRef.current < 2000) return
            lastCodeRef.current = code
            lastCodeTimestampRef.current = now
            _controls.stop()
            handleBarcode(code)
          },
        )
        if (cancelled) {
          controls.stop()
          return
        }
        stopRef.current = () => controls.stop()
      } catch (err) {
        if (cancelled) return
        const name = err instanceof DOMException ? err.name : ''
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setPhase({ kind: 'denied' })
        } else {
          // Any other error (NotFoundError = no camera, NotReadableError = hardware busy)
          setPhase({ kind: 'denied' })
        }
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      stopRef.current?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleBarcode(barcode: string) {
    setPhase({ kind: 'looking_up', barcode })

    // 1. Check local cache first — works offline for previously scanned foods
    try {
      const localFood = await getFoodByBarcode(barcode)
      if (localFood) {
        onFoodReady(localFood)
        return
      }
    } catch {
      // DB error — fall through to OFF
    }

    // 2. Try Open Food Facts
    try {
      const parsed = await lookupBarcode(barcode)
      if (parsed) {
        setPhase({ kind: 'off_found', barcode, parsed })
      } else {
        setPhase({ kind: 'not_found', barcode, offError: false })
      }
    } catch {
      setPhase({ kind: 'not_found', barcode, offError: true })
    }
  }

  async function handleSaveFood(
    fields: DraftFields,
    barcode: string,
    source: 'off' | 'manual',
    requireGrams: boolean,
  ) {
    setPhase({ kind: 'saving' })
    try {
      const food = await draftToFood(fields, barcode, source, requireGrams)
      onFoodReady(food)
    } catch {
      // Revert to previous state on failure — unlikely
      setPhase({ kind: 'not_found', barcode, offError: false })
    }
  }

  function handleManualBarcode(barcode: string) {
    stopRef.current?.()
    void handleBarcode(barcode)
  }

  function handleScanAgain() {
    lastCodeRef.current = null
    setPhase({ kind: 'scanning' })
    // Re-start camera — unmount/remount by toggling a key would work too,
    // but since the useEffect only runs once, we need to restart the scanner.
    // The simplest approach: reload the scanner.
    stopRef.current?.()
    stopRef.current = null

    // Re-trigger the camera start by re-mounting would require a key,
    // so instead we'll do it directly here:
    if (!videoRef.current) return
    const startCamera = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current!,
          (result, _error, _controls) => {
            if (!result) return
            const code = result.getText()
            const now = Date.now()
            if (code === lastCodeRef.current && now - lastCodeTimestampRef.current < 2000) return
            lastCodeRef.current = code
            lastCodeTimestampRef.current = now
            _controls.stop()
            void handleBarcode(code)
          },
        )
        stopRef.current = () => controls.stop()
      } catch {
        setPhase({ kind: 'denied' })
      }
    }
    void startCamera()
  }

  // ── Overlay shell ──

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', background: PALETTE.ink }}>
      {/* Header */}
      <div style={OVERLAY_HEADER}>
        <button onClick={onClose} style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PALETTE.dim, background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, flexShrink: 0 }} aria-label="Cancel">
          ←
        </button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 500, color: PALETTE.fg }}>
          {phase.kind === 'off_found' ? 'Review from Open Food Facts'
            : phase.kind === 'not_found' ? 'Add food'
            : 'Scan barcode'}
        </span>
      </div>

      {/* Body */}
      {(phase.kind === 'scanning' || phase.kind === 'denied' || phase.kind === 'looking_up') && (
        <ScanningView
          phase={phase}
          videoRef={videoRef}
          onManualBarcode={handleManualBarcode}
        />
      )}

      {phase.kind === 'off_found' && (
        <FoodDraftForm
          title="From Open Food Facts"
          barcode={phase.barcode}
          initial={parsedToDraft(phase.parsed)}
          requireGrams={phase.parsed.missingServing}
          isOFF
          saving={false}
          onSave={fields => void handleSaveFood(fields, phase.barcode, 'off', phase.parsed.missingServing)}
          onCancel={() => setPhase({ kind: 'scanning' })}
        />
      )}

      {phase.kind === 'not_found' && (
        <NotFoundView
          barcode={phase.barcode}
          offError={phase.offError}
          onSave={fields => void handleSaveFood(fields, phase.barcode, 'manual', false)}
          onScanAgain={handleScanAgain}
          saving={false}
        />
      )}

      {phase.kind === 'saving' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PALETTE.mute, fontSize: 15 }}>
          Saving…
        </div>
      )}
    </div>
  )
}

// ─── ScanningView ─────────────────────────────────────────────────────────────

function ScanningView({
  phase, videoRef, onManualBarcode,
}: {
  phase: Phase & { kind: 'scanning' | 'denied' | 'looking_up' }
  videoRef: React.RefObject<HTMLVideoElement | null>
  onManualBarcode: (barcode: string) => void
}) {
  const isDenied = phase.kind === 'denied'
  const isLookingUp = phase.kind === 'looking_up'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Video viewfinder — hidden when permission denied */}
      {!isDenied && (
        <div style={{ position: 'relative', flex: 1, background: '#000', overflow: 'hidden' }}>
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            autoPlay
            playsInline
            muted
          />

          {/* Viewfinder overlay */}
          {!isLookingUp && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ width: 260, height: 140, border: '2px solid rgba(255,255,255,0.6)', borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
              <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                Point at a barcode
              </div>
            </div>
          )}

          {/* Looking-up overlay */}
          {isLookingUp && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div style={{ fontSize: 13, color: PALETTE.mute }}>Detected</div>
              <div style={{ fontSize: 17, fontWeight: 500, color: PALETTE.fg, fontFamily: 'ui-monospace, monospace' }}>
                {(phase as { kind: 'looking_up'; barcode: string }).barcode}
              </div>
              <div style={{ fontSize: 13, color: PALETTE.mute }}>Looking up…</div>
            </div>
          )}
        </div>
      )}

      {/* Permission denied explanation */}
      {isDenied && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 16px', gap: 12 }}>
          <div style={{ background: SURFACE.elevated, border: `1px solid ${BORDER.strong}`, borderRadius: 12, padding: '16px 14px' }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: PALETTE.fg, marginBottom: 8 }}>
              Camera access denied
            </div>
            <div style={{ fontSize: 14, color: PALETTE.dim, lineHeight: 1.5 }}>
              To scan barcodes, allow camera access in your browser or device settings, then reload the page.
              You can still look up any food by entering its barcode number below.
            </div>
          </div>
        </div>
      )}

      {/* Manual barcode entry — always visible */}
      {!isLookingUp && (
        <div style={{ padding: '12px 16px 24px', background: SURFACE.base, borderTop: `1px solid ${BORDER.subtle}` }}>
          <div style={{ fontSize: 12, color: PALETTE.mute, marginBottom: 8 }}>
            {isDenied ? 'Enter barcode number' : 'Having trouble? Enter barcode manually'}
          </div>
          <ManualBarcodeInput onSubmit={onManualBarcode} />
        </div>
      )}
    </div>
  )
}

// ─── NotFoundView ─────────────────────────────────────────────────────────────

function NotFoundView({
  barcode, offError, onSave, onScanAgain, saving,
}: {
  barcode: string
  offError: boolean
  onSave: (fields: DraftFields) => void
  onScanAgain: () => void
  saving: boolean
}) {
  return (
    <FoodDraftForm
      title={offError ? 'Network error — add manually' : 'Not found on Open Food Facts'}
      barcode={barcode}
      initial={{ ...EMPTY_DRAFT }}
      requireGrams={false}
      isOFF={false}
      saving={saving}
      onSave={onSave}
      onCancel={onScanAgain}
    />
  )
}
