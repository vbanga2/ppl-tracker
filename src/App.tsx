import { useState, useEffect, useRef } from 'react'
import { StorageBanner } from './ui/StorageBanner'
import { InstallGate } from './ui/InstallGate'
import { UpdateBanner } from './ui/UpdateBanner'
import { Nav } from './ui/Nav'
import { WorkoutPage } from './features/workout/WorkoutPage'
import { ProgressPage } from './features/progress/ProgressPage'
import { BodyPage } from './features/body/BodyPage'
import { NutritionPage } from './features/nutrition/NutritionPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { saveAutoBackup } from './data/backup'
import type { Day } from './domain/plan'

type Tab = 'workout' | 'progress' | 'body' | 'nutrition' | 'settings'

interface AppProps {
  storageGranted: boolean
}

export default function App({ storageGranted }: AppProps) {
  const [tab, setTab] = useState<Tab>('workout')
  const [showInstallGate, setShowInstallGate] = useState(false)
  const [sessionDay, setSessionDay] = useState<Day | null>(null)
  const [calendarTarget, setCalendarTarget] = useState<string | null>(null)
  const prevTabRef = useRef<Tab>('workout')
  const sessionDayRef = useRef<Day | null>(null)
  sessionDayRef.current = sessionDay

  function openCalendar(date: string) {
    setCalendarTarget(date)
    setTab('workout')
  }

  useEffect(() => {
    const isStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (isIOS && !isStandalone && !sessionStorage.getItem('installDismissed')) {
      setShowInstallGate(true)
    }
  }, [])

  // Auto-backup when navigating away from an active workout session
  useEffect(() => {
    if (prevTabRef.current === 'workout' && tab !== 'workout' && sessionDayRef.current !== null) {
      saveAutoBackup().catch(console.error)
    }
    prevTabRef.current = tab
  }, [tab])

  function dismissInstall() {
    sessionStorage.setItem('installDismissed', '1')
    setShowInstallGate(false)
  }

  return (
    <div className="flex flex-col min-h-svh" style={{ background: '#0f1216', color: '#e8ecf1' }}>
      {!storageGranted && <StorageBanner />}
      <UpdateBanner />
      {showInstallGate && <InstallGate onDismiss={dismissInstall} />}

      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(56px + max(env(safe-area-inset-bottom), 8px))' }}
      >
        {tab === 'workout' && (
          <WorkoutPage
            onDayReady={setSessionDay}
            calendarTarget={calendarTarget}
            onCalendarClosed={() => setCalendarTarget(null)}
          />
        )}
        {tab === 'progress' && <ProgressPage onOpenDate={openCalendar} />}
        {tab === 'body' && <BodyPage />}
        {tab === 'nutrition' && <NutritionPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>

      <Nav current={tab} onChange={setTab} sessionDay={sessionDay} />
    </div>
  )
}
