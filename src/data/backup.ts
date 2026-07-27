import { db } from './db'
import type { DbBackupSnapshot } from './db'

export interface BackupData {
  version: number
  exportedAt: number
  exercises: unknown[]
  blocks: unknown[]
  sessions: unknown[]
  setLogs: unknown[]
  cardioLogs: unknown[]
  bodyMetrics: unknown[]
  healthSamples: unknown[]
  routes: unknown[]
  foods: unknown[]
  mealEntries: unknown[]
  exerciseNotes: unknown[]
}

export async function exportDatabase(): Promise<BackupData> {
  const [
    exercises, blocks, sessions, setLogs, cardioLogs,
    bodyMetrics, healthSamples, routes, foods, mealEntries, exerciseNotes,
  ] = await Promise.all([
    db.exercises.toArray(),
    db.blocks.toArray(),
    db.sessions.toArray(),
    db.setLogs.toArray(),
    db.cardioLogs.toArray(),
    db.bodyMetrics.toArray(),
    db.healthSamples.toArray(),
    db.routes.toArray(),
    db.foods.toArray(),
    db.mealEntries.toArray(),
    db.exerciseNotes.toArray(),
  ])

  return {
    version: 1,
    exportedAt: Date.now(),
    exercises,
    blocks,
    sessions,
    setLogs,
    cardioLogs,
    bodyMetrics,
    healthSamples,
    routes,
    foods,
    mealEntries,
    exerciseNotes,
  }
}

export function downloadBackup(data: BackupData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date(data.exportedAt).toISOString().slice(0, 10)
  a.href = url
  a.download = `ppl-tracker-backup-${date}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Merge import — never truncates. Keeps the row with the newer updatedAt on conflict.
async function mergeBackupData(data: BackupData): Promise<void> {
  if (typeof data.version !== 'number') {
    throw new Error('Invalid backup file — missing version field.')
  }

  type Row = { id: string; updatedAt: number }

  async function mergeTable(
    table: (typeof db)[keyof typeof db],
    rows: unknown[],
  ): Promise<void> {
    if (!rows?.length) return
    const typedRows = rows as Row[]
    const existing = await (table as { bulkGet: (ids: string[]) => Promise<(Row | undefined)[]> }).bulkGet(
      typedRows.map(r => r.id),
    )
    const toUpsert = typedRows.filter((row, i) => {
      const ex = existing[i]
      return !ex || row.updatedAt >= ex.updatedAt
    })
    if (toUpsert.length > 0) {
      await (table as { bulkPut: (rows: unknown[]) => Promise<unknown> }).bulkPut(toUpsert)
    }
  }

  await db.transaction(
    'rw',
    [db.exercises, db.blocks, db.sessions, db.setLogs, db.cardioLogs,
      db.bodyMetrics, db.healthSamples, db.routes, db.foods, db.mealEntries, db.exerciseNotes],
    async () => {
      await mergeTable(db.exercises, data.exercises ?? [])
      await mergeTable(db.blocks, data.blocks ?? [])
      await mergeTable(db.sessions, data.sessions ?? [])
      await mergeTable(db.setLogs, data.setLogs ?? [])
      await mergeTable(db.cardioLogs, data.cardioLogs ?? [])
      await mergeTable(db.bodyMetrics, data.bodyMetrics ?? [])
      await mergeTable(db.healthSamples, data.healthSamples ?? [])
      await mergeTable(db.routes, data.routes ?? [])
      await mergeTable(db.foods, data.foods ?? [])
      await mergeTable(db.mealEntries, data.mealEntries ?? [])
      await mergeTable(db.exerciseNotes, data.exerciseNotes ?? [])
    },
  )
}

export async function importDatabase(file: File): Promise<void> {
  const text = await file.text()
  const data: BackupData = JSON.parse(text)
  await mergeBackupData(data)
}

// ─── Auto-backup to IndexedDB (keeps last 10) ────────────────────────────────

export async function saveAutoBackup(): Promise<void> {
  const data = await exportDatabase()
  const sessions = (data.sessions as { deletedAt: number | null }[]).filter(s => !s.deletedAt)
  const sets = (data.setLogs as { deletedAt: number | null }[]).filter(s => !s.deletedAt)

  const d = new Date(data.exportedAt)
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const label = `${dateStr} · ${sessions.length} session${sessions.length !== 1 ? 's' : ''} · ${sets.length} set${sets.length !== 1 ? 's' : ''}`

  const snapshot: DbBackupSnapshot = {
    id: crypto.randomUUID(),
    savedAt: data.exportedAt,
    sessionCount: sessions.length,
    setCount: sets.length,
    label,
    dataJson: JSON.stringify(data),
  }

  await db.backups.add(snapshot)

  // Evict oldest beyond 10
  const all = await db.backups.orderBy('savedAt').toArray()
  if (all.length > 10) {
    const toEvict = all.slice(0, all.length - 10).map(b => b.id)
    await db.backups.bulkDelete(toEvict)
  }

  localStorage.setItem('lastAutoBackupAt', String(data.exportedAt))
}

export async function listBackups(): Promise<DbBackupSnapshot[]> {
  return db.backups.orderBy('savedAt').reverse().toArray()
}

export async function restoreFromSnapshot(snapshotId: string): Promise<void> {
  const snapshot = await db.backups.get(snapshotId)
  if (!snapshot) throw new Error('Snapshot not found.')
  const data: BackupData = JSON.parse(snapshot.dataJson)
  await mergeBackupData(data)
}
