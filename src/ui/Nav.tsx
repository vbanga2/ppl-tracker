import type { Day } from '../domain/plan'
import { PALETTE, dayAccent } from './tokens'

type Tab = 'workout' | 'progress' | 'body' | 'nutrition' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'workout', label: 'Workout', icon: '🏋️' },
  { id: 'progress', label: 'Progress', icon: '📈' },
  { id: 'body', label: 'Body', icon: '⚖️' },
  { id: 'nutrition', label: 'Nutrition', icon: '🥗' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

interface NavProps {
  current: Tab
  onChange: (tab: Tab) => void
  sessionDay?: Day | null
}

export function Nav({ current, onChange, sessionDay }: NavProps) {
  const accent = sessionDay ? dayAccent(sessionDay) : PALETTE.push

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex border-t"
      style={{
        background: PALETTE.panel,
        borderColor: PALETTE.line,
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      {TABS.map(t => {
        const active = current === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="flex-1 flex flex-col items-center justify-center py-2 pt-3 gap-0.5 text-xs"
            style={{
              minHeight: 56,
              color: active ? accent : PALETTE.mute,
              transition: 'color 0.15s',
            }}
          >
            <span className="text-xl leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
