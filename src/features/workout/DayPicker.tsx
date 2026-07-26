import type { Day } from '../../domain/plan'
import { PALETTE, dayAccent } from '../../ui/tokens'

const DAYS: Day[] = ['push', 'pull', 'legs']

interface DayPickerProps {
  onSelect: (day: Day) => void
  onCancel: () => void
}

export function DayPicker({ onSelect, onCancel }: DayPickerProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-end" style={{ background: 'rgba(15,18,22,0.92)' }}>
      <div className="w-full rounded-t-3xl px-4 py-6" style={{ background: PALETTE.panel }}>
        <h2 className="text-lg font-medium mb-4 text-center" style={{ color: PALETTE.fg }}>
          Choose day
        </h2>
        <div className="flex flex-col gap-3 mb-4">
          {DAYS.map(d => (
            <button
              key={d}
              onClick={() => onSelect(d)}
              className="w-full text-white font-medium py-4 rounded-2xl capitalize text-lg"
              style={{ minHeight: 56, background: dayAccent(d) }}
            >
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full py-3"
          style={{ minHeight: 44, color: PALETTE.mute }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
