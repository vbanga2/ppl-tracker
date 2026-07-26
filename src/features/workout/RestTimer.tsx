import { useState, useEffect, useRef } from 'react'
import { PALETTE } from '../../ui/tokens'

interface RestTimerProps {
  seconds: number
  color?: string
  onDone: () => void
}

function playDoneSound(): void {
  try {
    const ctx = new AudioContext()
    // Three ascending tones — C5, E5, G5
    const freqs = [523, 659, 784]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
      osc.start(t)
      osc.stop(t + 0.45)
    })
  } catch {
    // AudioContext unavailable — silent fallback
  }
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function RestTimer({ seconds, color, onDone }: RestTimerProps) {
  const accent = color ?? PALETTE.push
  const [remaining, setRemaining] = useState(seconds)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(intervalRef.current!)
          if (!firedRef.current) {
            firedRef.current = true
            playDoneSound()
          }
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current!)
  }, [])

  const pct = (remaining / seconds) * 100
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60

  return (
    <div
      className="mt-3 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
      style={{ background: PALETTE.panel }}
    >
      <div
        className="flex-1 h-2 rounded-full overflow-hidden"
        style={{ background: PALETTE.line }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: accent,
            transition: prefersReducedMotion ? 'none' : 'width 1s linear',
          }}
        />
      </div>
      <span
        className="text-sm font-semibold w-14 text-center"
        style={{ fontVariantNumeric: 'tabular-nums', color: accent }}
      >
        {mins}:{secs.toString().padStart(2, '0')}
      </span>
      <button
        onClick={onDone}
        className="text-sm min-h-[44px] px-2"
        style={{ color: PALETTE.mute }}
      >
        Skip
      </button>
    </div>
  )
}
