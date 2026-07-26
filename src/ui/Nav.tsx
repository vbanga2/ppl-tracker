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
}

export function Nav({ current, onChange }: NavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 flex safe-bottom">
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 flex flex-col items-center justify-center py-2 pt-3 min-h-[56px] text-xs gap-0.5 transition-colors ${
            current === t.id
              ? 'text-blue-400'
              : 'text-slate-400 active:text-slate-200'
          }`}
        >
          <span className="text-xl leading-none">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
