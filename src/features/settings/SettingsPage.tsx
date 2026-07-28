import { useRef, useState, useEffect } from 'react'
import {
  exportDatabase,
  downloadBackup,
  downloadBackupWithPhotos,
  importDatabase,
  listBackups,
  restoreFromSnapshot,
} from '../../data/backup'
import { getPhotoStorageBytes } from '../../data/repo'
import type { DbBackupSnapshot } from '../../data/db'
import { PALETTE } from '../../ui/tokens'

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [backups, setBackups] = useState<DbBackupSnapshot[]>([])
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [includePhotos, setIncludePhotos] = useState(false)

  const lastBackup = localStorage.getItem('lastBackupAt')
  const lastAutoBackup = localStorage.getItem('lastAutoBackupAt')

  const exportIsStale = (() => {
    if (!lastBackup) return true
    const age = Date.now() - parseInt(lastBackup)
    return age > 7 * 24 * 60 * 60 * 1000
  })()

  useEffect(() => {
    listBackups().then(setBackups)
  }, [])

  async function handleExport() {
    try {
      const data = await exportDatabase()
      if (includePhotos) {
        await downloadBackupWithPhotos(data)
      } else {
        downloadBackup(data)
      }
      localStorage.setItem('lastBackupAt', String(data.exportedAt))
      setStatus(includePhotos ? 'Backup with photos downloaded (.zip).' : 'Backup downloaded (.json).')
    } catch (err) {
      setStatus(`Export failed: ${err}`)
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importDatabase(file)
      setStatus('Import successful. Your data has been merged.')
    } catch (err) {
      setStatus(`Import failed: ${err}`)
    } finally {
      e.target.value = ''
    }
  }

  async function handleRestore(id: string) {
    const snapshot = backups.find(b => b.id === id)
    if (!snapshot) return
    const ok = window.confirm(
      `Restore snapshot from ${new Date(snapshot.savedAt).toLocaleString()}?\n\nThis merges the snapshot into your current data — nothing is deleted.`,
    )
    if (!ok) return
    setRestoringId(id)
    try {
      await restoreFromSnapshot(id)
      setStatus('Snapshot restored. Refresh to see your data.')
    } catch (err) {
      setStatus(`Restore failed: ${err}`)
    } finally {
      setRestoringId(null)
    }
  }

  const buildDate = __BUILD_DATE__
    ? new Date(__BUILD_DATE__).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'
  const buildSha = typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : '—'

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-medium mb-6" style={{ color: PALETTE.fg }}>
        Settings
      </h1>

      <Section title="Data backup">
        {/* iOS warning */}
        <div
          className="rounded-xl px-4 py-3 mb-4 text-sm"
          style={{ background: '#2a1a00', border: '1px solid #b85a00', color: '#fbe4c7' }}
        >
          <strong>Do not delete this app from your home screen</strong> — iOS deletes your
          training data with it. To update, close the app and reopen it. Use export below to
          keep an external backup.
        </div>

        {/* Export */}
        {exportIsStale && (
          <p className="text-xs mb-2" style={{ color: '#f5c518' }}>
            ⚠ No backup in the last 7 days — export one now.
          </p>
        )}
        {lastBackup && !exportIsStale && (
          <p className="text-xs mb-3" style={{ color: PALETTE.mute }}>
            Last export: {new Date(parseInt(lastBackup)).toLocaleString()}
          </p>
        )}

        {/* Include photos toggle */}
        <label
          className="flex items-center gap-3 mb-3 cursor-pointer"
          style={{ color: PALETTE.fg }}
        >
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={e => setIncludePhotos(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: PALETTE.push, cursor: 'pointer' }}
          />
          <span className="text-sm">Include progress photos (produces a .zip)</span>
        </label>
        {!includePhotos && (
          <p className="text-xs mb-3" style={{ color: PALETTE.mute }}>
            Photos are not included. A text-only backup does not preserve your progress photos.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <ActionButton onClick={handleExport} primary>
            Export backup {includePhotos ? '(.zip)' : '(JSON)'}
          </ActionButton>
          <ActionButton onClick={() => fileRef.current?.click()}>
            Import / merge backup
          </ActionButton>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.zip"
            className="hidden"
            onChange={handleImport}
          />
        </div>
        {status && (
          <p className="mt-3 text-sm rounded-xl px-4 py-3" style={{ background: PALETTE.panel, color: PALETTE.dim }}>
            {status}
          </p>
        )}

        {/* Auto-backup snapshots */}
        {backups.length > 0 && (
          <div className="mt-6">
            <p className="text-xs mb-2" style={{ color: PALETTE.mute }}>
              Automatic snapshots (last {backups.length})
              {lastAutoBackup && (
                <> · last saved {new Date(parseInt(lastAutoBackup)).toLocaleString()}</>
              )}
            </p>
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}` }}
            >
              {backups.map((snap, i) => (
                <div
                  key={snap.id}
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    borderBottom: i < backups.length - 1 ? `1px solid ${PALETTE.line}` : undefined,
                  }}
                >
                  <span className="text-sm" style={{ color: PALETTE.fg }}>
                    {snap.label}
                  </span>
                  <button
                    onClick={() => void handleRestore(snap.id)}
                    disabled={restoringId === snap.id}
                    className="text-xs px-3 py-1 rounded-lg"
                    style={{
                      minHeight: 32,
                      background: PALETTE.line,
                      color: PALETTE.dim,
                      opacity: restoringId === snap.id ? 0.5 : 1,
                    }}
                  >
                    {restoringId === snap.id ? 'Restoring…' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Storage">
        <StorageInfo />
      </Section>

      <Section title="About">
        <p className="text-sm mb-4" style={{ color: PALETTE.mute }}>
          PPL Tracker — personal edition. No account, no server, no cost.
        </p>
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}` }}
        >
          <p className="text-xs mb-1" style={{ color: PALETTE.dim }}>
            <span style={{ color: PALETTE.mute }}>Built </span>{buildDate}
          </p>
          <p className="text-xs font-mono" style={{ color: PALETTE.dim }}>
            <span style={{ color: PALETTE.mute }}>SHA </span>{buildSha}
          </p>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-medium mb-3" style={{ color: PALETTE.dim }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function ActionButton({
  onClick,
  primary,
  children,
}: {
  onClick: () => void
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="w-full font-medium py-4 rounded-2xl text-base"
      style={{
        minHeight: 56,
        background: primary ? PALETTE.push : PALETTE.panel,
        color: primary ? '#ffffff' : PALETTE.fg,
        border: primary ? 'none' : `1px solid ${PALETTE.line}`,
      }}
    >
      {children}
    </button>
  )
}

function StorageInfo() {
  const [info, setInfo] = useState<string | null>(null)
  const [photoMb, setPhotoMb] = useState<number | null>(null)

  async function check() {
    const [est, photoBytesResult] = await Promise.all([
      navigator.storage?.estimate?.(),
      getPhotoStorageBytes().catch(() => 0),
    ])
    const used = (((est?.usage ?? 0)) / 1024 / 1024).toFixed(1)
    const quota = (((est?.quota ?? 0)) / 1024 / 1024).toFixed(0)
    const persisted = await navigator.storage?.persisted?.()
    setInfo(`Used: ${used} MB / ${quota} MB — Durable: ${persisted ? 'yes' : 'no'}`)
    const mb = photoBytesResult / 1024 / 1024
    setPhotoMb(mb)
  }

  return (
    <div>
      <button
        onClick={check}
        className="font-medium py-3 px-6 rounded-xl text-sm"
        style={{ minHeight: 44, background: PALETTE.panel, color: PALETTE.fg, border: `1px solid ${PALETTE.line}` }}
      >
        Check storage
      </button>
      {info && (
        <p className="mt-2 text-xs" style={{ color: PALETTE.mute }}>
          {info}
        </p>
      )}
      {photoMb !== null && (
        <p
          className="mt-1 text-xs"
          style={{ color: photoMb > 200 ? '#f87171' : PALETTE.mute }}
        >
          Progress photos: {photoMb.toFixed(1)} MB
          {photoMb > 200 && ' — approaching limit, consider exporting and deleting old photos'}
        </p>
      )}
    </div>
  )
}
