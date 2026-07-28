import type { Day } from '../domain/plan'
import { PALETTE, dayAccent } from './tokens'
import workoutIcon from '../assets/nav-icons/workout.png'
import progressIcon from '../assets/nav-icons/progress.png'
import bodyIcon from '../assets/nav-icons/body.png'
import nutritionIcon from '../assets/nav-icons/nutrition.png'
import settingsIcon from '../assets/nav-icons/settings.png'

type Tab = 'workout' | 'progress' | 'body' | 'nutrition' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'workout', label: 'Workout', icon: workoutIcon },
  { id: 'progress', label: 'Progress', icon: progressIcon },
  { id: 'body', label: 'Body', icon: bodyIcon },
  { id: 'nutrition', label: 'Nutrition', icon: nutritionIcon },
  { id: 'settings', label: 'Settings', icon: settingsIcon },
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
            className="flex-1 flex flex-col items-center justify-center py-2 pt-3 gap-1 text-xs"
            style={{
              minHeight: 56,
              color: active ? accent : PALETTE.mute,
              transition: 'color 0.15s, opacity 0.15s',
            }}
          >
            <img
              src={t.icon}
              alt=""
              width={32}
              height={32}
              style={{
                opacity: active ? 1 : 0.55,
                filter: active ? 'none' : 'saturate(0.6)',
                transition: 'opacity 0.15s, filter 0.15s',
              }}
            />
            <span
              style={{
                display: 'block',
                borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
                paddingBottom: 1,
                transition: 'border-color 0.15s',
              }}
            >
              {t.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
