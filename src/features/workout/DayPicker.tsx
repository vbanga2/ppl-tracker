import type { Day } from '../../domain/plan'

const DAYS: Day[] = ['push', 'pull', 'legs']

interface DayPickerProps {
  onSelect: (day: Day) => void
  onCancel: () => void
}

export function DayPicker({ onSelect, onCancel }: DayPickerProps) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/90 flex items-end">
      <div className="w-full bg-slate-800 rounded-t-3xl px-4 py-6">
        <h2 className="text-lg font-semibold mb-4 text-center">Choose Day</h2>
        <div className="flex flex-col gap-3 mb-4">
          {DAYS.map(d => (
            <button
              key={d}
              onClick={() => onSelect(d)}
              className="w-full bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white font-semibold py-4 rounded-2xl capitalize text-lg min-h-[56px]"
            >
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full text-slate-400 py-3 min-h-[44px]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
