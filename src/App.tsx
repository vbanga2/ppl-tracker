import { useState, useEffect } from 'react'
import { StorageBanner } from './ui/StorageBanner'
import { InstallGate } from './ui/InstallGate'
import { Nav } from './ui/Nav'
import { WorkoutPage } from './features/workout/WorkoutPage'
import { ProgressPage } from './features/progress/ProgressPage'
import { BodyPage } from './features/body/BodyPage'
import { NutritionPage } from './features/nutrition/NutritionPage'
import { SettingsPage } from './features/settings/SettingsPage'
import type { Day } from './domain/plan'

type Tab = 'workout' | 'progress' | 'body' | 'nutrition' | 'settings'

interface AppProps {
  storageGranted: boolean
}

export default function App({ storageGranted }: AppProps) {
  const [tab, setTab] = useState<Tab>('workout')
  const [showInstallGate, setShowInstallGate] = useState(false)
  const [sessionDay, setSessionDay] = useState<Day | null>(null)

  useEffect(() => {
    const isStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (isIOS && !isStandalone && !sessionStorage.getItem('installDismissed')) {
      setShowInstallGate(true)
    }
  }, [])

  function dismissInstall() {
    sessionStorage.setItem('installDismissed', '1')
    setShowInstallGate(false)
  }

  return (
    <div className="flex flex-col min-h-svh" style={{ background: '#0f1216', color: '#e8ecf1' }}>
      {!storageGranted && <StorageBanner />}
      {showInstallGate && <InstallGate onDismiss={dismissInstall} />}

      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(56px + max(env(safe-area-inset-bottom), 8px))' }}
      >
        {tab === 'workout' && (
          <WorkoutPage onDayReady={setSessionDay} />
        )}
        {tab === 'progress' && <ProgressPage />}
        {tab === 'body' && <BodyPage />}
        {tab === 'nutrition' && <NutritionPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>

      <Nav current={tab} onChange={setTab} sessionDay={sessionDay} />
    </div>
  )
}
