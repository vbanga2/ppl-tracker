import { useRef, useState, useEffect } from 'react'
import { exportDatabase, downloadBackup, importDatabase } from '../../data/backup'
import { getPlateInventory, savePlateInventory } from '../../data/repo'
import { DEFAULT_PLATES, type PlateInventory } from '../../domain/plates'
import { PALETTE } from '../../ui/tokens'

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
      <h1 className="text-2xl font-medium mb-6" style={{ color: PALETTE.fg }}>
        Settings
      </h1>

      <Section title="Plate inventory">
        <PlateEditor />
      </Section>

      <Section title="Data backup">
        {lastBackup && (
          <p className="text-xs mb-3" style={{ color: PALETTE.mute }}>
            Last backup: {new Date(parseInt(lastBackup)).toLocaleString()}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <ActionButton onClick={handleExport} primary>
            Export backup (JSON)
          </ActionButton>
          <ActionButton onClick={() => fileRef.current?.click()}>
            Import backup
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
      </Section>

      <Section title="Storage">
        <StorageInfo />
      </Section>

      <Section title="About">
        <p className="text-sm" style={{ color: PALETTE.mute }}>
          PPL Tracker — personal edition. No account, no server, no cost.
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
