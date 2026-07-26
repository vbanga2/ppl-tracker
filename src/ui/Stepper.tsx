import { PALETTE } from './tokens'

interface StepperProps {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
}

export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, label }: StepperProps) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-xs w-12 shrink-0" style={{ color: PALETTE.dim }}>
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex items-center justify-center text-xl font-bold select-none rounded-xl"
        style={{ width: 48, height: 48, minWidth: 48, background: PALETTE.line, color: PALETTE.fg }}
        aria-label="decrease"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={e => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
        className="rounded-xl text-center text-lg font-semibold focus:outline-none tabular-nums"
        style={{
          width: 72,
          height: 48,
          background: PALETTE.line,
          color: PALETTE.fg,
          fontVariantNumeric: 'tabular-nums',
        }}
        inputMode="decimal"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        className="flex items-center justify-center text-xl font-bold select-none rounded-xl"
        style={{ width: 48, height: 48, minWidth: 48, background: PALETTE.line, color: PALETTE.fg }}
        aria-label="increase"
      >
        +
      </button>
    </div>
  )
}
