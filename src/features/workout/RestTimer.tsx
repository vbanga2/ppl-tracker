import { useState, useEffect, useRef } from 'react'

interface RestTimerProps {
  seconds: number
  onDone: () => void
}

export function RestTimer({ seconds, onDone }: RestTimerProps) {
  const [remaining, setRemaining] = useState(seconds)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(intervalRef.current!)
          // Vibrate when done
          if (navigator.vibrate) navigator.vibrate([200, 100, 200])
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
    <div className="mt-3 bg-slate-700/80 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex-1 h-2 bg-slate-600 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-400 transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-sm font-semibold text-blue-300 w-14 text-center">
        {mins}:{secs.toString().padStart(2, '0')}
      </span>
      <button
        onClick={onDone}
        className="text-slate-400 text-sm min-h-[44px] px-2"
      >
        Skip
      </button>
    </div>
  )
}
