import { useState, useEffect } from 'react'
import { StorageBanner } from './ui/StorageBanner'
import { InstallGate } from './ui/InstallGate'
import { Nav } from './ui/Nav'
import { WorkoutPage } from './features/workout/WorkoutPage'
import { ProgressPage } from './features/progress/ProgressPage'
import { BodyPage } from './features/body/BodyPage'
import { NutritionPage } from './features/nutrition/NutritionPage'
import { SettingsPage } from './features/settings/SettingsPage'

type Tab = 'workout' | 'progress' | 'body' | 'nutrition' | 'settings'

interface AppProps {
  storageGranted: boolean
}

export default function App({ storageGranted }: AppProps) {
  const [tab, setTab] = useState<Tab>('workout')
  const [showInstallGate, setShowInstallGate] = useState(false)

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
    <div className="flex flex-col min-h-svh bg-slate-900 text-slate-100">
      {!storageGranted && <StorageBanner />}
      {showInstallGate && <InstallGate onDismiss={dismissInstall} />}

      <main className="flex-1 overflow-y-auto pb-20">
        {tab === 'workout' && <WorkoutPage />}
        {tab === 'progress' && <ProgressPage />}
        {tab === 'body' && <BodyPage />}
        {tab === 'nutrition' && <NutritionPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>

      <Nav current={tab} onChange={setTab} />
    </div>
  )
}
