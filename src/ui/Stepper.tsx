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
      {label && <span className="text-xs text-slate-400 w-12 shrink-0">{label}</span>}
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="w-11 h-11 rounded-xl bg-slate-700 text-xl font-bold flex items-center justify-center active:bg-slate-600 select-none"
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
        className="w-16 h-11 rounded-xl bg-slate-700 text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
        inputMode="decimal"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        className="w-11 h-11 rounded-xl bg-slate-700 text-xl font-bold flex items-center justify-center active:bg-slate-600 select-none"
        aria-label="increase"
      >
        +
      </button>
    </div>
  )
}
