import { useState, useEffect, useRef } from 'react'
import { PALETTE } from './tokens'

interface StepperProps {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
}

function fmt(n: number): string {
  return String(n)
}

export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, label }: StepperProps) {
  const [raw, setRaw] = useState(() => fmt(value))
  const externalRef = useRef(value)

  useEffect(() => {
    if (value !== externalRef.current) {
      externalRef.current = value
      setRaw(fmt(value))
    }
  }, [value])

  function clamp(n: number): number {
    return Math.min(max, Math.max(min, n))
  }

  function push(n: number): number {
    const c = clamp(n)
    externalRef.current = c
    onChange(c)
    return c
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    if (!/^\d*\.?\d*$/.test(text)) return
    setRaw(text)
    const n = parseFloat(text)
    if (!isNaN(n)) push(n)
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.select()
  }

  function handleBlur() {
    const n = parseFloat(raw)
    const final = push(isNaN(n) ? min : n)
    setRaw(fmt(final))
  }

  function decrement() {
    const next = push(clamp(value - step))
    setRaw(fmt(next))
  }

  function increment() {
    const next = push(clamp(value + step))
    setRaw(fmt(next))
  }

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-xs w-12 shrink-0" style={{ color: PALETTE.dim }}>
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={decrement}
        className="flex items-center justify-center text-xl font-bold select-none rounded-xl"
        style={{ width: 48, height: 48, minWidth: 48, background: PALETTE.line, color: PALETTE.fg }}
        aria-label="decrease"
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={raw}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="rounded-xl text-center text-lg font-semibold focus:outline-none tabular-nums"
        style={{
          width: 72,
          height: 48,
          background: PALETTE.line,
          color: PALETTE.fg,
          fontVariantNumeric: 'tabular-nums',
        }}
      />
      <button
        type="button"
        onClick={increment}
        className="flex items-center justify-center text-xl font-bold select-none rounded-xl"
        style={{ width: 48, height: 48, minWidth: 48, background: PALETTE.line, color: PALETTE.fg }}
        aria-label="increase"
      >
        +
      </button>
    </div>
  )
}
