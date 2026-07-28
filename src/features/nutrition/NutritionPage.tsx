import { useState, useEffect, useMemo, useRef } from 'react'
import type { DbFood } from '../../data/db'
import { getAllFoods, addFood, updateFood, deleteFood } from '../../data/repo'
import { PALETTE } from '../../ui/tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type FormMode =
  | { kind: 'hidden' }
  | { kind: 'add' }
  | { kind: 'edit'; food: DbFood }
  | { kind: 'duplicate'; source: DbFood }

interface FoodFields {
  name: string
  brand: string
  servingDesc: string
  servingGrams: string
  kcal: string
  proteinG: string
  carbG: string
  fatG: string
  fiberG: string
  sugarG: string
  sodiumMg: string
  satFatG: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNum(s: string): number {
  return parseFloat(s) || 0
}

function toOptNum(s: string): number | null {
  const v = parseFloat(s)
  return s.trim() === '' || isNaN(v) ? null : v
}

function fieldsFromFood(f: DbFood): FoodFields {
  return {
    name: f.name,
    brand: f.brand ?? '',
    servingDesc: f.servingDesc,
    servingGrams: f.servingGrams !== null ? String(f.servingGrams) : '',
    kcal: String(f.kcal),
    proteinG: String(f.proteinG),
    carbG: String(f.carbG),
    fatG: String(f.fatG),
    fiberG: f.fiberG !== null ? String(f.fiberG) : '',
    sugarG: f.sugarG !== null ? String(f.sugarG) : '',
    sodiumMg: f.sodiumMg !== null ? String(f.sodiumMg) : '',
    satFatG: f.satFatG !== null ? String(f.satFatG) : '',
  }
}

const EMPTY_FIELDS: FoodFields = {
  name: '', brand: '', servingDesc: '', servingGrams: '',
  kcal: '', proteinG: '', carbG: '', fatG: '',
  fiberG: '', sugarG: '', sodiumMg: '', satFatG: '',
}

function kcalWarning(fields: FoodFields): string | null {
  const kcal = toNum(fields.kcal)
  const p = toNum(fields.proteinG)
  const c = toNum(fields.carbG)
  const f = toNum(fields.fatG)
  if (!kcal) return null
  const calc = 4 * p + 4 * c + 9 * f
  if (calc === 0) return null
  if (Math.abs(kcal - calc) / calc > 0.2) {
    return `Stated kcal (${kcal}) differs by >20% from 4×${p}g + 4×${c}g + 9×${f}g = ${Math.round(calc)} kcal. Check your values.`
  }
  return null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: PALETTE.ink,
  border: `1px solid ${PALETTE.line}`,
  borderRadius: 8,
  padding: '10px 12px',
  color: PALETTE.fg,
  fontSize: 16,
  outline: 'none',
}

const MONO_INPUT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  fontFamily: 'ui-monospace, monospace',
  fontVariantNumeric: 'tabular-nums',
}

interface FieldProps {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}

function Field({ label, required, hint, error, children }: FieldProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: PALETTE.dim, fontWeight: 500 }}>{label}</span>
        {required && <span style={{ fontSize: 11, color: PALETTE.mute }}>required</span>}
        {hint && <span style={{ fontSize: 11, color: PALETTE.mute }}>{hint}</span>}
      </div>
      {children}
      {error && <p style={{ marginTop: 4, fontSize: 12, color: '#e57373' }}>{error}</p>}
    </div>
  )
}

interface SectionProps {
  label: string
  children: React.ReactNode
}

function Section({ label, children }: SectionProps) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{label}</p>
      {children}
    </div>
  )
}

// ─── FoodForm ─────────────────────────────────────────────────────────────────

interface FoodFormProps {
  mode: FormMode
  onSave: (fields: FoodFields) => Promise<void>
  onCancel: () => void
}

function FoodForm({ mode, onSave, onCancel }: FoodFormProps) {
  const initFields = useMemo((): FoodFields => {
    if (mode.kind === 'edit') return fieldsFromFood(mode.food)
    if (mode.kind === 'duplicate') return { ...fieldsFromFood(mode.source), name: mode.source.name + ' (copy)' }
    return EMPTY_FIELDS
  }, [mode])

  const [fields, setFields] = useState<FoodFields>(initFields)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FoodFields, string>>>({})
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const warning = kcalWarning(fields)
  const title = mode.kind === 'edit' ? 'Edit food' : mode.kind === 'duplicate' ? 'Duplicate food' : 'Add food'

  function set(key: keyof FoodFields, val: string) {
    setFields(prev => ({ ...prev, [key]: val }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  async function handleSubmit() {
    const errs: Partial<Record<keyof FoodFields, string>> = {}
    if (!fields.name.trim()) errs.name = 'Required'
    if (!fields.servingDesc.trim()) errs.servingDesc = 'Required'
    const kcalVal = parseFloat(fields.kcal)
    if (fields.kcal.trim() === '' || isNaN(kcalVal)) errs.kcal = 'Required'
    const proteinVal = parseFloat(fields.proteinG)
    if (fields.proteinG.trim() === '' || isNaN(proteinVal)) errs.proteinG = 'Required'
    const carbVal = parseFloat(fields.carbG)
    if (fields.carbG.trim() === '' || isNaN(carbVal)) errs.carbG = 'Required'
    const fatVal = parseFloat(fields.fatG)
    if (fields.fatG.trim() === '' || isNaN(fatVal)) errs.fatG = 'Required'
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    try { await onSave(fields) } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: PALETTE.ink }}>
      {/* Header */}
      <div style={{ background: PALETTE.panel, borderBottom: `1px solid ${PALETTE.line}`, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minHeight: 56 }}>
        <button
          onClick={onCancel}
          style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PALETTE.dim, background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, flexShrink: 0 }}
          aria-label="Cancel"
        >
          ←
        </button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 500, color: PALETTE.fg }}>{title}</span>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{ minHeight: 36, padding: '0 18px', background: PALETTE.push, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 500, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, fontSize: 15 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 40px' }}>
        <Section label="Food identity">
          <Field label="Name" required error={errors.name}>
            <input
              ref={nameRef}
              value={fields.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Chicken breast"
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Brand" hint="optional">
            <input
              value={fields.brand}
              onChange={e => set('brand', e.target.value)}
              placeholder="e.g. Kirkland"
              style={INPUT_STYLE}
            />
          </Field>
        </Section>

        <Section label="Serving">
          <Field label="Description" required error={errors.servingDesc}>
            <input
              value={fields.servingDesc}
              onChange={e => set('servingDesc', e.target.value)}
              placeholder="e.g. 1 cup, 100g, 1 slice"
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Weight (g)" hint="optional">
            <input
              value={fields.servingGrams}
              onChange={e => set('servingGrams', e.target.value)}
              placeholder="—"
              inputMode="decimal"
              style={MONO_INPUT_STYLE}
            />
          </Field>
        </Section>

        <Section label="Macros per serving">
          {warning && (
            <div style={{ padding: '10px 12px', background: '#1a1500', border: `1px solid #6b5000`, borderRadius: 8, color: '#c89b00', fontSize: 13, marginBottom: 14, lineHeight: 1.4 }}>
              {warning}
            </div>
          )}
          <Field label="Calories (kcal)" required error={errors.kcal}>
            <input value={fields.kcal} onChange={e => set('kcal', e.target.value)} inputMode="decimal" placeholder="0" style={MONO_INPUT_STYLE} />
          </Field>
          <Field label="Protein (g)" required error={errors.proteinG}>
            <input value={fields.proteinG} onChange={e => set('proteinG', e.target.value)} inputMode="decimal" placeholder="0" style={MONO_INPUT_STYLE} />
          </Field>
          <Field label="Carbs (g)" required error={errors.carbG}>
            <input value={fields.carbG} onChange={e => set('carbG', e.target.value)} inputMode="decimal" placeholder="0" style={MONO_INPUT_STYLE} />
          </Field>
          <Field label="Fat (g)" required error={errors.fatG}>
            <input value={fields.fatG} onChange={e => set('fatG', e.target.value)} inputMode="decimal" placeholder="0" style={MONO_INPUT_STYLE} />
          </Field>
        </Section>

        <Section label="Optional">
          <Field label="Fiber (g)">
            <input value={fields.fiberG} onChange={e => set('fiberG', e.target.value)} inputMode="decimal" placeholder="—" style={MONO_INPUT_STYLE} />
          </Field>
          <Field label="Sugar (g)">
            <input value={fields.sugarG} onChange={e => set('sugarG', e.target.value)} inputMode="decimal" placeholder="—" style={MONO_INPUT_STYLE} />
          </Field>
          <Field label="Sodium (mg)">
            <input value={fields.sodiumMg} onChange={e => set('sodiumMg', e.target.value)} inputMode="decimal" placeholder="—" style={MONO_INPUT_STYLE} />
          </Field>
          <Field label="Sat fat (g)">
            <input value={fields.satFatG} onChange={e => set('satFatG', e.target.value)} inputMode="decimal" placeholder="—" style={MONO_INPUT_STYLE} />
          </Field>
        </Section>

        <p style={{ fontSize: 12, color: PALETTE.mute, textAlign: 'center', marginTop: 8 }}>
          Data from <a href="https://world.openfoodfacts.org" style={{ color: PALETTE.dim, textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer">Open Food Facts</a>
        </p>
      </div>
    </div>
  )
}

// ─── FoodRow ──────────────────────────────────────────────────────────────────

interface FoodRowProps {
  food: DbFood
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

function FoodRow({ food, selected, onSelect, onEdit, onDuplicate, onDelete }: FoodRowProps) {
  return (
    <div style={{ background: PALETTE.panel, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <button
        onClick={onSelect}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 14px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: PALETTE.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {food.name}
          </div>
          <div style={{ fontSize: 13, color: PALETTE.dim, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[food.brand, food.servingDesc].filter(Boolean).join(' · ')}
          </div>
          <div style={{ fontSize: 12, color: PALETTE.mute, marginTop: 4, fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' }}>
            {food.kcal} kcal · {food.proteinG}g P · {food.carbG}g C · {food.fatG}g F
          </div>
        </div>
        <span style={{ color: PALETTE.mute, fontSize: 14, flexShrink: 0, transform: selected ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▼</span>
      </button>

      {selected && (
        <div style={{ display: 'flex', borderTop: `1px solid ${PALETTE.line}` }}>
          <ActionBtn label="Edit" onClick={onEdit} />
          <div style={{ width: 1, background: PALETTE.line }} />
          <ActionBtn label="Duplicate" onClick={onDuplicate} />
          <div style={{ width: 1, background: PALETTE.line }} />
          <ActionBtn label="Delete" onClick={onDelete} danger />
        </div>
      )}
    </div>
  )
}

interface ActionBtnProps {
  label: string
  onClick: () => void
  danger?: boolean
}

function ActionBtn({ label, onClick, danger }: ActionBtnProps) {
  return (
    <button
      onClick={onClick}
      style={{ flex: 1, minHeight: 44, background: 'none', border: 'none', cursor: 'pointer', color: danger ? '#e57373' : PALETTE.dim, fontSize: 14, fontWeight: 500 }}
    >
      {label}
    </button>
  )
}

// ─── DeleteConfirm ────────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  food: DbFood
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirm({ food, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div
        style={{ width: '100%', background: PALETTE.panel, borderRadius: '14px 14px 0 0', padding: '20px 16px 32px' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ fontSize: 15, fontWeight: 500, color: PALETTE.fg, marginBottom: 6 }}>Delete "{food.name}"?</p>
        <p style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 20 }}>Already-logged meals are not affected.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, minHeight: 48, background: PALETTE.line, border: 'none', borderRadius: 10, color: PALETTE.fg, fontWeight: 500, cursor: 'pointer', fontSize: 15 }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ flex: 1, minHeight: 48, background: '#8b1a1a', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 500, cursor: 'pointer', fontSize: 15 }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── NutritionPage ────────────────────────────────────────────────────────────

export function NutritionPage() {
  const [foods, setFoods] = useState<DbFood[]>([])
  const [query, setQuery] = useState('')
  const [formMode, setFormMode] = useState<FormMode>({ kind: 'hidden' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DbFood | null>(null)

  useEffect(() => {
    getAllFoods().then(setFoods)
  }, [])

  const visible = useMemo(() => {
    if (!query.trim()) return foods
    const q = query.toLowerCase()
    return foods.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.brand?.toLowerCase().includes(q) ?? false),
    )
  }, [foods, query])

  function openAdd() { setFormMode({ kind: 'add' }); setSelectedId(null) }
  function openEdit(food: DbFood) { setFormMode({ kind: 'edit', food }); setSelectedId(null) }
  function openDuplicate(food: DbFood) { setFormMode({ kind: 'duplicate', source: food }); setSelectedId(null) }
  function closeForm() { setFormMode({ kind: 'hidden' }) }

  function toggleSelect(id: string) {
    setSelectedId(prev => (prev === id ? null : id))
  }

  async function handleSave(fields: FoodFields) {
    const payload = {
      barcode: null as string | null,
      source: 'manual' as const,
      name: fields.name.trim(),
      brand: fields.brand.trim() || null,
      servingDesc: fields.servingDesc.trim(),
      servingGrams: toOptNum(fields.servingGrams),
      kcal: toNum(fields.kcal),
      proteinG: toNum(fields.proteinG),
      carbG: toNum(fields.carbG),
      fatG: toNum(fields.fatG),
      fiberG: toOptNum(fields.fiberG),
      sugarG: toOptNum(fields.sugarG),
      sodiumMg: toOptNum(fields.sodiumMg),
      satFatG: toOptNum(fields.satFatG),
      microsJson: null as string | null,
      lastUsedAt: Date.now(),
      useCount: 0,
    }

    if (formMode.kind === 'edit') {
      await updateFood(formMode.food.id, payload)
      setFoods(prev => prev.map(f => f.id === formMode.food.id ? { ...f, ...payload, updatedAt: Date.now() } : f))
    } else {
      const record = await addFood(payload)
      setFoods(prev => [record, ...prev])
    }
    closeForm()
  }

  async function handleDelete(food: DbFood) {
    await deleteFood(food.id)
    setFoods(prev => prev.filter(f => f.id !== food.id))
    setDeleteTarget(null)
    setSelectedId(null)
  }

  if (formMode.kind !== 'hidden') {
    return (
      <FoodForm
        mode={formMode}
        onSave={handleSave}
        onCancel={closeForm}
      />
    )
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ flex: 1, fontSize: 22, fontWeight: 500, color: PALETTE.fg, margin: 0 }}>Nutrition</h1>
        <button
          onClick={openAdd}
          style={{ minWidth: 44, minHeight: 44, background: PALETTE.push, border: 'none', borderRadius: 10, color: '#fff', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          aria-label="Add food"
        >
          +
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '0 16px 12px' }}>
        <input
          type="search"
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedId(null) }}
          placeholder="Search food library…"
          style={{ ...INPUT_STYLE, fontSize: 15 }}
        />
      </div>

      {/* Food library */}
      <div style={{ padding: '0 16px' }}>
        {foods.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: PALETTE.mute }}>
            <p style={{ fontSize: 15, marginBottom: 8 }}>No foods yet</p>
            <p style={{ fontSize: 13 }}>Add your first food using the + button.</p>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 40, color: PALETTE.mute }}>
            <p style={{ fontSize: 15 }}>No foods match "{query}"</p>
          </div>
        ) : (
          visible.map(food => (
            <FoodRow
              key={food.id}
              food={food}
              selected={selectedId === food.id}
              onSelect={() => toggleSelect(food.id)}
              onEdit={() => openEdit(food)}
              onDuplicate={() => openDuplicate(food)}
              onDelete={() => { setDeleteTarget(food); setSelectedId(null) }}
            />
          ))
        )}

        {visible.length > 0 && (
          <p style={{ textAlign: 'center', fontSize: 12, color: PALETTE.mute, marginTop: 16 }}>
            Data from{' '}
            <a href="https://world.openfoodfacts.org" style={{ color: PALETTE.dim, textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer">
              Open Food Facts
            </a>
          </p>
        )}
      </div>

      {deleteTarget && (
        <DeleteConfirm
          food={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
