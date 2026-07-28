import { useState, useEffect, useMemo, useRef } from 'react'
import type { DbFood, DbMealEntry } from '../../data/db'
import {
  getMealEntriesForDate,
  getMealEntriesForDates,
  addMealEntry,
  updateMealEntry,
  deleteMealEntry,
  recordFoodUsed,
} from '../../data/repo'
import { Stepper } from '../../ui/Stepper'
import { PALETTE } from '../../ui/tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'
const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']
const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

type Overlay =
  | { kind: 'none' }
  | { kind: 'pickFood'; slot: MealSlot }
  | { kind: 'setServings'; food: DbFood; slot: MealSlot }
  | { kind: 'quickAdd'; slot: MealSlot }
  | { kind: 'copyDay' }
  | { kind: 'copySlot'; targetSlot: MealSlot }

export interface MealDiaryProps {
  foods: DbFood[]
  onOpenLibrary: () => void
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function formatDiaryDate(dateStr: string, today: string): string {
  if (dateStr === today) return 'Today'
  if (dateStr === shiftDate(today, -1)) return 'Yesterday'
  if (dateStr === shiftDate(today, 1)) return 'Tomorrow'
  const [, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(dateStr)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[dt.getDay()]}, ${months[m - 1]} ${d}`
}

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[dt.getDay()]}, ${months[m - 1]} ${d} ${y}`
}

// ─── Macro math ───────────────────────────────────────────────────────────────

interface Macros { kcal: number; protein: number; carb: number; fat: number }

function sumMacros(entries: DbMealEntry[]): Macros {
  return entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcalCached,
      protein: acc.protein + e.proteinCached,
      carb: acc.carb + e.carbCached,
      fat: acc.fat + e.fatCached,
    }),
    { kcal: 0, protein: 0, carb: 0, fat: 0 },
  )
}

function foodMacrosAt(food: DbFood, servings: number): Macros {
  return {
    kcal: food.kcal * servings,
    protein: food.proteinG * servings,
    carb: food.carbG * servings,
    fat: food.fatG * servings,
  }
}

function r(n: number): number { return Math.round(n) }

// ─── Shared styles ────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%',
  background: PALETTE.ink,
  border: `1px solid ${PALETTE.line}`,
  borderRadius: 8,
  padding: '10px 12px',
  color: PALETTE.fg,
  fontSize: 16,
  outline: 'none',
}

const MONO_INPUT: React.CSSProperties = {
  ...INPUT,
  fontFamily: 'ui-monospace, monospace',
  fontVariantNumeric: 'tabular-nums',
}

const OVERLAY_HEADER: React.CSSProperties = {
  background: PALETTE.panel,
  borderBottom: `1px solid ${PALETTE.line}`,
  padding: '0 16px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
  minHeight: 56,
}

const BACK_BTN: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: PALETTE.dim,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 20,
  flexShrink: 0,
}

// ─── EntryRow ─────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: DbMealEntry
  food: DbFood | undefined
  expanded: boolean
  onToggle: () => void
  onUpdateServings: (id: string, servings: number, macros: Macros, food: DbFood) => void
  onDelete: (entry: DbMealEntry) => void
}

function EntryRow({ entry, food, expanded, onToggle, onUpdateServings, onDelete }: EntryRowProps) {
  const [pendingServings, setPendingServings] = useState(entry.servings)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setPendingServings(entry.servings) }, [entry.servings])

  const isQuickAdd = entry.foodId === null
  const displayName = isQuickAdd ? (entry.label ?? 'Quick add') : (food?.name ?? 'Unknown food')
  const preview = useMemo(
    () => food ? foodMacrosAt(food, pendingServings) : null,
    [food, pendingServings],
  )

  async function saveServings() {
    if (!preview || !food || pendingServings === entry.servings) return
    setSaving(true)
    try {
      await updateMealEntry(entry.id, {
        servings: pendingServings,
        kcalCached: preview.kcal,
        proteinCached: preview.protein,
        carbCached: preview.carb,
        fatCached: preview.fat,
        fiberCached: food.fiberG !== null ? food.fiberG * pendingServings : null,
        sugarCached: food.sugarG !== null ? food.sugarG * pendingServings : null,
        sodiumCached: food.sodiumMg !== null ? food.sodiumMg * pendingServings : null,
      })
      onUpdateServings(entry.id, pendingServings, preview, food)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: PALETTE.panel, borderRadius: 10, overflow: 'hidden', marginBottom: 6 }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 12px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: PALETTE.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayName}
          </div>
          <div style={{ fontSize: 12, color: PALETTE.dim, marginTop: 2 }}>
            {isQuickAdd
              ? `${r(entry.kcalCached)} kcal · ${r(entry.proteinCached)}g P · ${r(entry.carbCached)}g C · ${r(entry.fatCached)}g F`
              : `${entry.servings !== 1 ? `${entry.servings}× ` : ''}${food?.servingDesc ?? ''}`
            }
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: PALETTE.fg, fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' }}>
            {r(entry.kcalCached)} kcal
          </div>
          {!isQuickAdd && (
            <div style={{ fontSize: 11, color: PALETTE.mute, fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' }}>
              {r(entry.proteinCached)}P · {r(entry.carbCached)}C · {r(entry.fatCached)}F
            </div>
          )}
        </div>
        <span style={{ color: PALETTE.mute, fontSize: 11, flexShrink: 0, marginLeft: 4, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>▼</span>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${PALETTE.line}`, padding: '12px 12px 14px' }}>
          {isQuickAdd ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => onDelete(entry)} style={{ minHeight: 40, padding: '0 16px', background: 'none', border: `1px solid #e57373`, borderRadius: 8, color: '#e57373', fontSize: 14, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: PALETTE.dim }}>Servings</span>
                <Stepper value={pendingServings} onChange={setPendingServings} min={0.25} step={0.25} />
              </div>
              {food && (
                <div style={{ fontSize: 12, color: PALETTE.mute, marginBottom: 8 }}>
                  per {food.servingDesc}: {food.kcal} kcal · {food.proteinG}g P · {food.carbG}g C · {food.fatG}g F
                </div>
              )}
              {preview && pendingServings !== entry.servings && (
                <div style={{ fontSize: 12, color: PALETTE.dim, fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>
                  → {r(preview.kcal)} kcal · {r(preview.protein)}g P · {r(preview.carb)}g C · {r(preview.fat)}g F
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => onDelete(entry)} style={{ minHeight: 40, padding: '0 16px', background: 'none', border: `1px solid #e57373`, borderRadius: 8, color: '#e57373', fontSize: 14, cursor: 'pointer' }}>
                  Delete
                </button>
                {pendingServings !== entry.servings && (
                  <button onClick={saveServings} disabled={saving} style={{ minHeight: 40, padding: '0 16px', background: PALETTE.push, border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 500, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SlotSection ──────────────────────────────────────────────────────────────

interface SlotSectionProps {
  slot: MealSlot
  entries: DbMealEntry[]
  foodMap: Map<string, DbFood>
  expandedId: string | null
  onToggleEntry: (id: string) => void
  onUpdateServings: (id: string, servings: number, macros: Macros, food: DbFood) => void
  onDeleteEntry: (entry: DbMealEntry) => void
  onAddFood: (slot: MealSlot) => void
  onQuickAdd: (slot: MealSlot) => void
  onCopySlot: (slot: MealSlot) => void
}

function SlotSection({
  slot, entries, foodMap, expandedId, onToggleEntry, onUpdateServings,
  onDeleteEntry, onAddFood, onQuickAdd, onCopySlot,
}: SlotSectionProps) {
  const totals = useMemo(() => sumMacros(entries), [entries])
  const hasEntries = entries.length > 0

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 16px', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: PALETTE.dim }}>{SLOT_LABELS[slot]}</span>
        {hasEntries && (
          <span style={{ fontSize: 12, color: PALETTE.mute, fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' }}>
            {r(totals.kcal)} kcal · {r(totals.protein)}g P · {r(totals.carb)}g C · {r(totals.fat)}g F
          </span>
        )}
      </div>

      {hasEntries && (
        <div style={{ padding: '0 16px' }}>
          {entries.map(entry => (
            <EntryRow
              key={entry.id}
              entry={entry}
              food={entry.foodId ? foodMap.get(entry.foodId) : undefined}
              expanded={expandedId === entry.id}
              onToggle={() => onToggleEntry(entry.id)}
              onUpdateServings={onUpdateServings}
              onDelete={onDeleteEntry}
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, padding: '4px 16px 0' }}>
        <button onClick={() => onAddFood(slot)} style={{ flex: 1, minHeight: 40, background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, color: PALETTE.fg, fontSize: 13, cursor: 'pointer' }}>
          + Add food
        </button>
        <button onClick={() => onQuickAdd(slot)} style={{ minHeight: 40, padding: '0 12px', background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, color: PALETTE.dim, fontSize: 13, cursor: 'pointer' }}>
          Quick add
        </button>
        {hasEntries && (
          <button onClick={() => onCopySlot(slot)} style={{ minHeight: 40, padding: '0 10px', background: 'none', border: 'none', color: PALETTE.mute, fontSize: 13, cursor: 'pointer' }}>
            Copy
          </button>
        )}
      </div>
    </div>
  )
}

// ─── DayTotals ────────────────────────────────────────────────────────────────

function DayTotals({ entries }: { entries: DbMealEntry[] }) {
  const totals = useMemo(() => sumMacros(entries), [entries])
  if (entries.length === 0) return null

  return (
    <div style={{ margin: '0 16px', background: PALETTE.panel, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: PALETTE.mute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Day total</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        {[
          { label: 'Calories', value: r(totals.kcal), unit: 'kcal' },
          { label: 'Protein', value: r(totals.protein), unit: 'g' },
          { label: 'Carbs', value: r(totals.carb), unit: 'g' },
          { label: 'Fat', value: r(totals.fat), unit: 'g' },
        ].map(({ label, value, unit }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 500, color: PALETTE.fg, fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' }}>
              {value}<span style={{ fontSize: 10, color: PALETTE.mute, marginLeft: 1 }}>{unit}</span>
            </div>
            <div style={{ fontSize: 11, color: PALETTE.mute }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── UndoToast ────────────────────────────────────────────────────────────────

function UndoToast({ entry, food, onUndo }: { entry: DbMealEntry; food: DbFood | undefined; onUndo: () => void }) {
  const name = entry.foodId === null ? (entry.label ?? 'Quick add') : (food?.name ?? 'Entry')
  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(56px + max(env(safe-area-inset-bottom), 8px) + 8px)',
      left: 16, right: 16, zIndex: 80,
      background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 12,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ flex: 1, fontSize: 14, color: PALETTE.fg }}>{name} removed</span>
      <button onClick={onUndo} style={{ minHeight: 36, padding: '0 16px', background: PALETTE.push, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>Undo</button>
    </div>
  )
}

// ─── FoodPickerView ───────────────────────────────────────────────────────────

interface FoodPickerViewProps {
  slot: MealSlot
  foods: DbFood[]
  onPick: (food: DbFood) => void
  onQuickAdd: () => void
  onOpenLibrary: () => void
  onClose: () => void
}

function FoodPickerView({ slot, foods, onPick, onQuickAdd, onOpenLibrary, onClose }: FoodPickerViewProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return foods
    const q = query.toLowerCase()
    return foods.filter(f => f.name.toLowerCase().includes(q) || (f.brand?.toLowerCase().includes(q) ?? false))
  }, [foods, query])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: PALETTE.ink }}>
      <div style={OVERLAY_HEADER}>
        <button onClick={onClose} style={BACK_BTN} aria-label="Cancel">←</button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 500, color: PALETTE.fg }}>Add to {SLOT_LABELS[slot]}</span>
        <button onClick={onOpenLibrary} style={{ minHeight: 36, padding: '0 12px', background: PALETTE.line, border: 'none', borderRadius: 8, color: PALETTE.dim, fontSize: 13, cursor: 'pointer' }}>
          Manage library
        </button>
      </div>

      <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
        <input ref={inputRef} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search food library…" style={{ ...INPUT, fontSize: 15 }} />
      </div>

      <div style={{ padding: '0 16px 8px', flexShrink: 0 }}>
        <button onClick={onQuickAdd} style={{ width: '100%', minHeight: 44, background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 10, color: PALETTE.dim, fontSize: 14, cursor: 'pointer', textAlign: 'left', padding: '0 14px' }}>
          Quick add — log bare macros without a food record
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 32px' }}>
        {foods.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 40, color: PALETTE.mute }}>
            <p style={{ fontSize: 14, marginBottom: 6 }}>No foods in your library yet</p>
            <p style={{ fontSize: 13 }}>Tap "Manage library" to add foods.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 24, color: PALETTE.mute, fontSize: 14 }}>
            No foods match "{query}"
          </div>
        ) : (
          filtered.map(food => (
            <button key={food.id} onClick={() => onPick(food)} style={{ width: '100%', background: PALETTE.panel, border: 'none', borderRadius: 10, cursor: 'pointer', padding: '12px 14px', textAlign: 'left', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: PALETTE.fg }}>{food.name}</div>
              {food.brand && <div style={{ fontSize: 12, color: PALETTE.dim }}>{food.brand}</div>}
              <div style={{ fontSize: 12, color: PALETTE.mute, fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' }}>
                {food.kcal} kcal · {food.proteinG}g P · {food.carbG}g C · {food.fatG}g F per {food.servingDesc}
              </div>
            </button>
          ))
        )}
        <p style={{ fontSize: 12, color: PALETTE.mute, textAlign: 'center', marginTop: 16 }}>
          Data from{' '}
          <a href="https://world.openfoodfacts.org" style={{ color: PALETTE.dim, textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer">
            Open Food Facts
          </a>
        </p>
      </div>
    </div>
  )
}

// ─── ServingsView ─────────────────────────────────────────────────────────────

interface ServingsViewProps {
  food: DbFood
  slot: MealSlot
  onLog: (servings: number) => Promise<void>
  onCancel: () => void
}

function ServingsView({ food, slot, onLog, onCancel }: ServingsViewProps) {
  const [servings, setServings] = useState(1)
  const [logging, setLogging] = useState(false)
  const preview = useMemo(() => foodMacrosAt(food, servings), [food, servings])

  async function handleLog() {
    setLogging(true)
    try { await onLog(servings) } finally { setLogging(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', background: PALETTE.ink }}>
      <div style={OVERLAY_HEADER}>
        <button onClick={onCancel} style={BACK_BTN} aria-label="Back">←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: PALETTE.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{food.name}</div>
          {food.brand && <div style={{ fontSize: 12, color: PALETTE.mute }}>{food.brand}</div>}
        </div>
        <button onClick={handleLog} disabled={logging} style={{ minHeight: 40, padding: '0 18px', background: PALETTE.push, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 500, fontSize: 15, cursor: logging ? 'default' : 'pointer', opacity: logging ? 0.7 : 1 }}>
          {logging ? 'Adding…' : `Add to ${SLOT_LABELS[slot]}`}
        </button>
      </div>

      <div style={{ flex: 1, padding: '24px 16px', overflowY: 'auto' }}>
        <div style={{ background: PALETTE.panel, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 12 }}>Servings</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Stepper value={servings} onChange={setServings} min={0.25} step={0.25} />
          </div>
          <div style={{ fontSize: 12, color: PALETTE.mute, textAlign: 'center' }}>
            per serving: {food.servingDesc}{food.servingGrams ? ` · ${food.servingGrams}g` : ''}
          </div>
        </div>

        <div style={{ background: PALETTE.panel, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 10 }}>
            Total for {servings === 1 ? '1 serving' : `${servings} servings`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Calories', value: r(preview.kcal), unit: 'kcal' },
              { label: 'Protein', value: r(preview.protein), unit: 'g' },
              { label: 'Carbs', value: r(preview.carb), unit: 'g' },
              { label: 'Fat', value: r(preview.fat), unit: 'g' },
            ].map(({ label, value, unit }) => (
              <div key={label} style={{ background: PALETTE.ink, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: PALETTE.mute }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: PALETTE.fg, fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' }}>
                  {value}<span style={{ fontSize: 11, color: PALETTE.mute, marginLeft: 1 }}>{unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── QuickAddForm ─────────────────────────────────────────────────────────────

interface QuickAddFormProps {
  slot: MealSlot
  onLog: (kcal: number, protein: number, carb: number, fat: number, label: string) => Promise<void>
  onCancel: () => void
}

function QuickAddField({ name, label, value, onChange, error, onClearError }: {
  name: string; label: string; value: string
  onChange: (v: string) => void; error?: string; onClearError: (name: string) => void
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 6 }}>{label}</div>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); if (error) onClearError(name) }}
        inputMode="decimal"
        placeholder="0"
        style={MONO_INPUT}
      />
      {error && <p style={{ marginTop: 4, fontSize: 12, color: '#e57373' }}>{error}</p>}
    </div>
  )
}

function QuickAddForm({ slot, onLog, onCancel }: QuickAddFormProps) {
  const [label, setLabel] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [carb, setCarb] = useState('')
  const [fat, setFat] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [logging, setLogging] = useState(false)
  const labelRef = useRef<HTMLInputElement>(null)
  useEffect(() => { labelRef.current?.focus() }, [])

  function clearError(name: string) { setErrors(prev => { const n = { ...prev }; delete n[name]; return n }) }

  async function handleLog() {
    const errs: Record<string, string> = {}
    const kv = parseFloat(kcal); if (!kcal.trim() || isNaN(kv)) errs.kcal = 'Required'
    const pv = parseFloat(protein); if (!protein.trim() || isNaN(pv)) errs.protein = 'Required'
    const cv = parseFloat(carb); if (!carb.trim() || isNaN(cv)) errs.carb = 'Required'
    const fv = parseFloat(fat); if (!fat.trim() || isNaN(fv)) errs.fat = 'Required'
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setLogging(true)
    try { await onLog(kv, pv, cv, fv, label.trim() || 'Quick add') } finally { setLogging(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', background: PALETTE.ink }}>
      <div style={OVERLAY_HEADER}>
        <button onClick={onCancel} style={BACK_BTN} aria-label="Cancel">←</button>
        <span style={{ flex: 1, fontSize: 17, fontWeight: 500, color: PALETTE.fg }}>Quick add — {SLOT_LABELS[slot]}</span>
        <button onClick={handleLog} disabled={logging} style={{ minHeight: 36, padding: '0 18px', background: PALETTE.push, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 500, fontSize: 15, cursor: logging ? 'default' : 'pointer', opacity: logging ? 0.7 : 1 }}>
          {logging ? 'Adding…' : 'Add'}
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 40px' }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 6 }}>Label (optional)</div>
          <input ref={labelRef} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Lunch at restaurant" style={INPUT} />
        </div>
        <QuickAddField name="kcal" label="Calories (kcal)" value={kcal} onChange={setKcal} error={errors.kcal} onClearError={clearError} />
        <QuickAddField name="protein" label="Protein (g)" value={protein} onChange={setProtein} error={errors.protein} onClearError={clearError} />
        <QuickAddField name="carb" label="Carbs (g)" value={carb} onChange={setCarb} error={errors.carb} onClearError={clearError} />
        <QuickAddField name="fat" label="Fat (g)" value={fat} onChange={setFat} error={errors.fat} onClearError={clearError} />
      </div>
    </div>
  )
}

// ─── CopyDaySheet ─────────────────────────────────────────────────────────────

function CopyDaySheet({ currentDate, onCopy, onClose }: {
  currentDate: string
  onCopy: (date: string) => Promise<void>
  onClose: () => void
}) {
  const [options, setOptions] = useState<{ date: string; count: number }[] | null>(null)
  const [copying, setCopying] = useState<string | null>(null)

  useEffect(() => {
    const dates: string[] = []
    for (let i = 1; i <= 60; i++) dates.push(shiftDate(currentDate, -i))
    getMealEntriesForDates(dates).then(all => {
      const map = new Map<string, number>()
      for (const e of all) map.set(e.date, (map.get(e.date) ?? 0) + 1)
      setOptions(
        Array.from(map.entries())
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => b.date.localeCompare(a.date)),
      )
    })
  }, [currentDate])

  async function handleCopy(date: string) {
    setCopying(date)
    try { await onCopy(date) } finally { setCopying(null) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div style={{ width: '100%', background: PALETTE.panel, borderRadius: '14px 14px 0 0', maxHeight: '70vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${PALETTE.line}`, position: 'sticky', top: 0, background: PALETTE.panel }}>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 500, color: PALETTE.fg }}>Copy day from</span>
          <button onClick={onClose} style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: PALETTE.mute, fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {options === null ? (
          <div style={{ padding: 32, textAlign: 'center', color: PALETTE.mute, fontSize: 14 }}>Loading…</div>
        ) : options.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: PALETTE.mute, fontSize: 14 }}>No past days with entries found.</div>
        ) : (
          <div style={{ paddingBottom: 32 }}>
            {options.map(opt => (
              <button key={opt.date} onClick={() => handleCopy(opt.date)} disabled={copying === opt.date} style={{ width: '100%', background: copying === opt.date ? PALETTE.line : 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${PALETTE.line}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, color: PALETTE.fg }}>{formatShortDate(opt.date)}</div>
                  <div style={{ fontSize: 12, color: PALETTE.mute, marginTop: 2 }}>{opt.count} {opt.count === 1 ? 'entry' : 'entries'}</div>
                </div>
                <span style={{ color: PALETTE.mute, fontSize: 18 }}>{copying === opt.date ? '…' : '›'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CopySlotSheet ────────────────────────────────────────────────────────────

function CopySlotSheet({ targetSlot, currentDate, onCopy, onClose }: {
  targetSlot: MealSlot
  currentDate: string
  onCopy: (date: string, slot: MealSlot) => Promise<void>
  onClose: () => void
}) {
  const [options, setOptions] = useState<{ date: string; slot: MealSlot; count: number }[] | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const slotOrder: Record<MealSlot, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }

  useEffect(() => {
    const dates: string[] = []
    for (let i = 1; i <= 60; i++) dates.push(shiftDate(currentDate, -i))
    getMealEntriesForDates(dates).then(all => {
      const map = new Map<string, number>()
      for (const e of all) {
        const key = `${e.date}|${e.slot}`
        map.set(key, (map.get(key) ?? 0) + 1)
      }
      setOptions(
        Array.from(map.entries())
          .map(([key, count]) => { const [d, s] = key.split('|'); return { date: d, slot: s as MealSlot, count } })
          .sort((a, b) => b.date !== a.date ? b.date.localeCompare(a.date) : slotOrder[a.slot] - slotOrder[b.slot]),
      )
    })
  }, [currentDate])

  async function handleCopy(date: string, slot: MealSlot) {
    const key = `${date}|${slot}`
    setCopying(key)
    try { await onCopy(date, slot) } finally { setCopying(null) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div style={{ width: '100%', background: PALETTE.panel, borderRadius: '14px 14px 0 0', maxHeight: '70vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${PALETTE.line}`, position: 'sticky', top: 0, background: PALETTE.panel }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: PALETTE.fg }}>Copy to {SLOT_LABELS[targetSlot]} from</div>
            <div style={{ fontSize: 12, color: PALETTE.mute, marginTop: 2 }}>Entries will be added to your {SLOT_LABELS[targetSlot]}</div>
          </div>
          <button onClick={onClose} style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: PALETTE.mute, fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {options === null ? (
          <div style={{ padding: 32, textAlign: 'center', color: PALETTE.mute, fontSize: 14 }}>Loading…</div>
        ) : options.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: PALETTE.mute, fontSize: 14 }}>No past slots with entries found.</div>
        ) : (
          <div style={{ paddingBottom: 32 }}>
            {options.map(opt => {
              const key = `${opt.date}|${opt.slot}`
              return (
                <button key={key} onClick={() => handleCopy(opt.date, opt.slot)} disabled={copying === key} style={{ width: '100%', background: copying === key ? PALETTE.line : 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${PALETTE.line}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: PALETTE.fg }}>{SLOT_LABELS[opt.slot]} · {formatShortDate(opt.date)}</div>
                    <div style={{ fontSize: 12, color: PALETTE.mute, marginTop: 2 }}>{opt.count} {opt.count === 1 ? 'entry' : 'entries'}</div>
                  </div>
                  <span style={{ color: PALETTE.mute, fontSize: 18 }}>{copying === key ? '…' : '›'}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MealDiary ────────────────────────────────────────────────────────────────

export function MealDiary({ foods, onOpenLibrary }: MealDiaryProps) {
  const today = useMemo(todayStr, [])
  const [date, setDate] = useState(today)
  const [entries, setEntries] = useState<DbMealEntry[]>([])
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [undoEntry, setUndoEntry] = useState<DbMealEntry | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const foodMap = useMemo(() => new Map(foods.map(f => [f.id, f])), [foods])

  useEffect(() => {
    getMealEntriesForDate(date).then(setEntries)
    setExpandedId(null)
  }, [date])

  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }, [])

  const slotEntries = useMemo(() => {
    const map: Record<MealSlot, DbMealEntry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] }
    for (const e of entries) map[e.slot].push(e)
    return map
  }, [entries])

  // ── Undo delete ──

  function handleDeleteEntry(entry: DbMealEntry) {
    if (undoEntry && undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
      deleteMealEntry(undoEntry.id).catch(console.error)
    }
    setEntries(prev => prev.filter(e => e.id !== entry.id))
    setExpandedId(null)
    setUndoEntry(entry)
    undoTimerRef.current = setTimeout(() => {
      deleteMealEntry(entry.id).catch(console.error)
      setUndoEntry(null)
    }, 5000)
  }

  function handleUndo() {
    if (!undoEntry || !undoTimerRef.current) return
    clearTimeout(undoTimerRef.current)
    setEntries(prev => [...prev, undoEntry].sort((a, b) => a.updatedAt - b.updatedAt))
    setUndoEntry(null)
  }

  // ── Servings update ──

  function handleUpdateServings(id: string, servings: number, macros: Macros, food: DbFood) {
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e
      return {
        ...e,
        servings,
        kcalCached: macros.kcal,
        proteinCached: macros.protein,
        carbCached: macros.carb,
        fatCached: macros.fat,
        fiberCached: food.fiberG !== null ? food.fiberG * servings : null,
        sugarCached: food.sugarG !== null ? food.sugarG * servings : null,
        sodiumCached: food.sodiumMg !== null ? food.sodiumMg * servings : null,
      }
    }))
    setExpandedId(null)
  }

  // ── Add food from picker ──

  async function handleLogFood(food: DbFood, slot: MealSlot, servings: number) {
    const entry = await addMealEntry({
      date, slot,
      foodId: food.id,
      label: null,
      servings,
      kcalCached: food.kcal * servings,
      proteinCached: food.proteinG * servings,
      carbCached: food.carbG * servings,
      fatCached: food.fatG * servings,
      fiberCached: food.fiberG !== null ? food.fiberG * servings : null,
      sugarCached: food.sugarG !== null ? food.sugarG * servings : null,
      sodiumCached: food.sodiumMg !== null ? food.sodiumMg * servings : null,
    })
    await recordFoodUsed(food.id)
    setEntries(prev => [...prev, entry])
    setOverlay({ kind: 'none' })
  }

  // ── Quick add ──

  async function handleQuickAdd(slot: MealSlot, kcal: number, protein: number, carb: number, fat: number, label: string) {
    const entry = await addMealEntry({
      date, slot,
      foodId: null,
      label,
      servings: 1,
      kcalCached: kcal,
      proteinCached: protein,
      carbCached: carb,
      fatCached: fat,
      fiberCached: null,
      sugarCached: null,
      sodiumCached: null,
    })
    setEntries(prev => [...prev, entry])
    setOverlay({ kind: 'none' })
  }

  // ── Copy day ──

  async function handleCopyDay(sourceDate: string) {
    const sourceEntries = await getMealEntriesForDate(sourceDate)
    if (sourceEntries.length === 0) { setOverlay({ kind: 'none' }); return }
    const newEntries: DbMealEntry[] = []
    for (const e of sourceEntries) {
      const record = await addMealEntry({
        date, slot: e.slot,
        foodId: e.foodId, label: e.label,
        servings: e.servings,
        kcalCached: e.kcalCached, proteinCached: e.proteinCached,
        carbCached: e.carbCached, fatCached: e.fatCached,
        fiberCached: e.fiberCached, sugarCached: e.sugarCached, sodiumCached: e.sodiumCached,
      })
      newEntries.push(record)
      if (e.foodId) recordFoodUsed(e.foodId).catch(console.error)
    }
    setEntries(prev => [...prev, ...newEntries])
    setOverlay({ kind: 'none' })
  }

  // ── Copy slot ──

  async function handleCopySlot(sourceDate: string, sourceSlot: MealSlot, targetSlot: MealSlot) {
    const sourceEntries = await getMealEntriesForDate(sourceDate)
    const slotSrc = sourceEntries.filter(e => e.slot === sourceSlot)
    if (slotSrc.length === 0) { setOverlay({ kind: 'none' }); return }
    const newEntries: DbMealEntry[] = []
    for (const e of slotSrc) {
      const record = await addMealEntry({
        date, slot: targetSlot,
        foodId: e.foodId, label: e.label,
        servings: e.servings,
        kcalCached: e.kcalCached, proteinCached: e.proteinCached,
        carbCached: e.carbCached, fatCached: e.fatCached,
        fiberCached: e.fiberCached, sugarCached: e.sugarCached, sodiumCached: e.sodiumCached,
      })
      newEntries.push(record)
      if (e.foodId) recordFoodUsed(e.foodId).catch(console.error)
    }
    setEntries(prev => [...prev, ...newEntries])
    setOverlay({ kind: 'none' })
  }

  // ── Full-screen overlays ──

  if (overlay.kind === 'pickFood') {
    return (
      <FoodPickerView
        slot={overlay.slot}
        foods={foods}
        onPick={food => setOverlay({ kind: 'setServings', food, slot: (overlay as { kind: 'pickFood'; slot: MealSlot }).slot })}
        onQuickAdd={() => setOverlay({ kind: 'quickAdd', slot: (overlay as { kind: 'pickFood'; slot: MealSlot }).slot })}
        onOpenLibrary={onOpenLibrary}
        onClose={() => setOverlay({ kind: 'none' })}
      />
    )
  }

  if (overlay.kind === 'setServings') {
    const { food, slot } = overlay
    return (
      <ServingsView
        food={food}
        slot={slot}
        onLog={servings => handleLogFood(food, slot, servings)}
        onCancel={() => setOverlay({ kind: 'pickFood', slot })}
      />
    )
  }

  if (overlay.kind === 'quickAdd') {
    const { slot } = overlay
    return (
      <QuickAddForm
        slot={slot}
        onLog={(kcal, protein, carb, fat, label) => handleQuickAdd(slot, kcal, protein, carb, fat, label)}
        onCancel={() => setOverlay({ kind: 'none' })}
      />
    )
  }

  // ── Main diary view ──

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <h1 style={{ flex: 1, fontSize: 22, fontWeight: 500, color: PALETTE.fg, margin: 0 }}>Nutrition</h1>
        <button onClick={onOpenLibrary} style={{ minHeight: 36, padding: '0 14px', background: PALETTE.panel, border: `1px solid ${PALETTE.line}`, borderRadius: 8, color: PALETTE.dim, fontSize: 13, cursor: 'pointer' }}>
          Library
        </button>
      </div>

      {/* Date navigation */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 4px 12px' }}>
        <button
          onClick={() => setDate(d => shiftDate(d, -1))}
          style={{ minWidth: 48, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: PALETTE.dim, fontSize: 24 }}
          aria-label="Previous day"
        >
          ‹
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 500, color: PALETTE.fg }}>
          {formatDiaryDate(date, today)}
        </span>
        <button
          onClick={() => setDate(d => shiftDate(d, 1))}
          disabled={date >= today}
          style={{ minWidth: 48, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: date >= today ? 'default' : 'pointer', color: date >= today ? PALETTE.line : PALETTE.dim, fontSize: 24 }}
          aria-label="Next day"
        >
          ›
        </button>
        {date !== today && (
          <button
            onClick={() => setDate(today)}
            style={{ minHeight: 32, padding: '0 10px', background: 'none', border: `1px solid ${PALETTE.line}`, borderRadius: 6, color: PALETTE.mute, fontSize: 12, cursor: 'pointer', flexShrink: 0, marginRight: 4 }}
          >
            Today
          </button>
        )}
      </div>

      {/* Day totals */}
      {entries.length > 0 && <DayTotals entries={entries} />}

      {/* Meal slots */}
      <div style={{ marginTop: 16 }}>
        {SLOTS.map(slot => (
          <SlotSection
            key={slot}
            slot={slot}
            entries={slotEntries[slot]}
            foodMap={foodMap}
            expandedId={expandedId}
            onToggleEntry={id => setExpandedId(prev => prev === id ? null : id)}
            onUpdateServings={handleUpdateServings}
            onDeleteEntry={handleDeleteEntry}
            onAddFood={s => setOverlay({ kind: 'pickFood', slot: s })}
            onQuickAdd={s => setOverlay({ kind: 'quickAdd', slot: s })}
            onCopySlot={s => setOverlay({ kind: 'copySlot', targetSlot: s })}
          />
        ))}
      </div>

      {/* Copy day button */}
      <div style={{ padding: '8px 16px 0' }}>
        <button
          onClick={() => setOverlay({ kind: 'copyDay' })}
          style={{ width: '100%', minHeight: 44, background: 'none', border: `1px solid ${PALETTE.line}`, borderRadius: 10, color: PALETTE.mute, fontSize: 14, cursor: 'pointer' }}
        >
          Copy day from…
        </button>
      </div>

      {/* Bottom-sheet modals */}
      {overlay.kind === 'copyDay' && (
        <CopyDaySheet
          currentDate={date}
          onCopy={handleCopyDay}
          onClose={() => setOverlay({ kind: 'none' })}
        />
      )}
      {overlay.kind === 'copySlot' && (
        <CopySlotSheet
          targetSlot={overlay.targetSlot}
          currentDate={date}
          onCopy={(srcDate, srcSlot) => handleCopySlot(srcDate, srcSlot, overlay.targetSlot)}
          onClose={() => setOverlay({ kind: 'none' })}
        />
      )}

      {/* Undo toast */}
      {undoEntry && (
        <UndoToast
          entry={undoEntry}
          food={undoEntry.foodId ? foodMap.get(undoEntry.foodId) : undefined}
          onUndo={handleUndo}
        />
      )}
    </div>
  )
}
