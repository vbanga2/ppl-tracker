import { useRef, useState, useEffect } from 'react'
import {
  exportDatabase,
  downloadBackup,
  importDatabase,
  listBackups,
  restoreFromSnapshot,
} from '../../data/backup'
import type { DbBackupSnapshot } from '../../data/db'
import { getPlateInventory, savePlateInventory } from '../../data/repo'
import { DEFAULT_PLATES, type PlateInventory } from '../../domain/plates'
import { PALETTE } from '../../ui/tokens'

declare const __BUILD_DATE__: string

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [backups, setBackups] = useState<DbBackupSnapshot[]>([])
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const lastBackup = localStorage.getItem('lastBackupAt')
  const lastAutoBackup = localStorage.getItem('lastAutoBackupAt')

  // Show export nudge if no manual export in 7 days or any session since last export
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

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-medium mb-6" style={{ color: PALETTE.fg }}>
        Settings
      </h1>

      <Section title="Plate inventory">
        <PlateEditor />
      </Section>

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
        <div className="flex flex-col gap-3">
          <ActionButton onClick={handleExport} primary>
            Export backup (JSON)
          </ActionButton>
          <ActionButton onClick={() => fileRef.current?.click()}>
            Import / merge backup
          </ActionButton>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
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
        <p className="text-sm mb-2" style={{ color: PALETTE.mute }}>
          PPL Tracker — personal edition. No account, no server, no cost.
        </p>
        <p className="text-xs" style={{ color: PALETTE.mute }}>
          Build: {buildDate}
        </p>
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

function PlateEditor() {
  const [inventory, setInventory] = useState<PlateInventory[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getPlateInventory().then(setInventory)
  }, [])

  function setPairs(lb: number, pairs: number) {
    setInventory(inv => inv.map(p => (p.lb === lb ? { ...p, pairs } : p)))
    setSaved(false)
  }

  async function handleSave() {
    await savePlateInventory(inventory)
    setSaved(true)
  }

  async function handleReset() {
    setInventory(DEFAULT_PLATES)
    await savePlateInventory(DEFAULT_PLATES)
    setSaved(true)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: PALETTE.mute }}>
        Pairs of each plate available at your gym. Used to show loading instructions per side.
      </p>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.line}` }}
      >
        {inventory.map((plate, i) => (
          <div
            key={plate.lb}
            className="flex items-center justify-between px-4 py-3"
            style={{
              borderBottom: i < inventory.length - 1 ? `1px solid ${PALETTE.line}` : undefined,
            }}
          >
            <span className="text-sm font-medium" style={{ color: PALETTE.fg, fontVariantNumeric: 'tabular-nums' }}>
              {plate.lb} lb
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPairs(plate.lb, Math.max(0, plate.pairs - 1))}
                className="flex items-center justify-center text-lg font-bold rounded-lg"
                style={{ width: 36, height: 36, background: PALETTE.line, color: PALETTE.fg }}
                aria-label="remove pair"
              >
                −
              </button>
              <span
                className="text-sm font-medium w-8 text-center"
                style={{ color: PALETTE.fg, fontVariantNumeric: 'tabular-nums' }}
              >
                {plate.pairs}
              </span>
              <button
                type="button"
                onClick={() => setPairs(plate.lb, plate.pairs + 1)}
                className="flex items-center justify-center text-lg font-bold rounded-lg"
                style={{ width: 36, height: 36, background: PALETTE.line, color: PALETTE.fg }}
                aria-label="add pair"
              >
                +
              </button>
              <span className="text-xs w-10" style={{ color: PALETTE.mute }}>
                pairs
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 font-medium py-3 rounded-xl text-sm"
          style={{ minHeight: 44, background: PALETTE.push, color: '#ffffff' }}
        >
          {saved ? 'Saved' : 'Save inventory'}
        </button>
        <button
          onClick={handleReset}
          className="font-medium py-3 px-4 rounded-xl text-sm"
          style={{ minHeight: 44, background: PALETTE.line, color: PALETTE.dim }}
        >
          Reset
        </button>
      </div>
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
    </div>
  )
}
