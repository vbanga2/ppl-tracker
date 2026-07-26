import { useRef, useState } from 'react'
import { exportDatabase, downloadBackup, importDatabase } from '../../data/backup'

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const lastBackup = localStorage.getItem('lastBackupAt')

  async function handleExport() {
    try {
      const data = await exportDatabase()
      downloadBackup(data)
      localStorage.setItem('lastBackupAt', String(data.exportedAt))
      setStatus('Backup downloaded.')
    } catch (err) {
      setStatus(`Export failed: ${err}`)
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importDatabase(file)
      setStatus('Import successful. Refresh to see your data.')
    } catch (err) {
      setStatus(`Import failed: ${err}`)
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-slate-300">Data Backup</h2>
        {lastBackup && (
          <p className="text-xs text-slate-400 mb-3">
            Last backup: {new Date(parseInt(lastBackup)).toLocaleString()}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleExport}
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-4 rounded-2xl text-base min-h-[56px]"
          >
            Export Backup (JSON)
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white font-semibold py-4 rounded-2xl text-base min-h-[56px]"
          >
            Import Backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
        {status && (
          <p className="mt-3 text-sm text-slate-300 bg-slate-800 rounded-xl px-4 py-3">{status}</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-slate-300">Storage</h2>
        <StorageInfo />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3 text-slate-300">About</h2>
        <p className="text-slate-400 text-sm">PPL Tracker — personal edition. No account, no server, no cost.</p>
      </section>
    </div>
  )
}

function StorageInfo() {
  const [info, setInfo] = useState<string | null>(null)

  async function check() {
    if (!navigator.storage?.estimate) {
      setInfo('Storage estimate not available.')
      return
    }
    const est = await navigator.storage.estimate()
    const used = ((est.usage ?? 0) / 1024 / 1024).toFixed(1)
    const quota = ((est.quota ?? 0) / 1024 / 1024).toFixed(0)
    const persisted = await navigator.storage.persisted()
    setInfo(`Used: ${used} MB / ${quota} MB — Durable: ${persisted ? 'yes' : 'no'}`)
  }

  return (
    <div>
      <button
        onClick={check}
        className="bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white font-semibold py-3 px-6 rounded-xl text-sm min-h-[44px]"
      >
        Check storage
      </button>
      {info && <p className="mt-2 text-xs text-slate-400">{info}</p>}
    </div>
  )
}
