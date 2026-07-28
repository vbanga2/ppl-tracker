import { strFromU8, strToU8, zip, unzip } from 'fflate'
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
  bodyMeasurements: unknown[]
  nutritionTargets: unknown[]
}

export async function exportDatabase(): Promise<BackupData> {
  const [
    exercises, blocks, sessions, setLogs, cardioLogs,
    bodyMetrics, healthSamples, routes, foods, mealEntries, exerciseNotes,
    bodyMeasurements, nutritionTargets,
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
    db.bodyMeasurements.toArray(),
    db.nutritionTargets.toArray(),
  ])

  return {
    version: 3,
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
    bodyMeasurements,
    nutritionTargets,
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

// Export with photos — produces a ZIP: data.json + photos/<id>.webp
export async function downloadBackupWithPhotos(data: BackupData): Promise<void> {
  const photos = await db.progressPhotos.filter(p => p.deletedAt === null).toArray()

  const files: Record<string, Uint8Array> = {}
  files['data.json'] = strToU8(JSON.stringify(data, null, 2))

  const photoMeta: Array<{
    id: string
    date: string
    pose: string
    widthPx: number
    heightPx: number
    notes: string | null
    updatedAt: number
    deletedAt: number | null
    file: string
  }> = []

  for (const p of photos) {
    const ab = await p.blob.arrayBuffer()
    const fname = `photos/${p.id}.webp`
    files[fname] = new Uint8Array(ab)
    photoMeta.push({
      id: p.id,
      date: p.date,
      pose: p.pose,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
      notes: p.notes,
      updatedAt: p.updatedAt,
      deletedAt: p.deletedAt,
      file: fname,
    })
  }

  files['photos.json'] = strToU8(JSON.stringify(photoMeta, null, 2))

  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, (err, data) => (err ? reject(err) : resolve(data))),
  )

  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date(data.exportedAt).toISOString().slice(0, 10)
  a.href = url
  a.download = `ppl-tracker-backup-${date}.zip`
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
      db.bodyMetrics, db.healthSamples, db.routes, db.foods, db.mealEntries,
      db.exerciseNotes, db.bodyMeasurements, db.nutritionTargets],
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
      await mergeTable(db.bodyMeasurements, data.bodyMeasurements ?? [])
      await mergeTable(db.nutritionTargets, data.nutritionTargets ?? [])
    },
  )
}

async function importZipWithPhotos(file: File): Promise<void> {
  const ab = await file.arrayBuffer()
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(new Uint8Array(ab), (err, data) => (err ? reject(err) : resolve(data))),
  )

  if (!entries['data.json']) throw new Error('Invalid backup zip — missing data.json.')
  const data: BackupData = JSON.parse(strFromU8(entries['data.json']))
  await mergeBackupData(data)

  if (entries['photos.json']) {
    type PhotoMeta = {
      id: string; date: string; pose: 'front' | 'side' | 'back' | 'other'
      widthPx: number; heightPx: number; notes: string | null
      updatedAt: number; deletedAt: number | null; file: string
    }
    const photoMeta: PhotoMeta[] = JSON.parse(strFromU8(entries['photos.json']))

    for (const meta of photoMeta) {
      const photoData = entries[meta.file]
      if (!photoData) continue
      const blob = new Blob([photoData.buffer as ArrayBuffer], { type: 'image/webp' })
      const existing = await db.progressPhotos.get(meta.id)
      if (!existing || meta.updatedAt >= existing.updatedAt) {
        await db.progressPhotos.put({
          id: meta.id,
          date: meta.date,
          pose: meta.pose,
          blob,
          widthPx: meta.widthPx,
          heightPx: meta.heightPx,
          notes: meta.notes,
          updatedAt: meta.updatedAt,
          deletedAt: meta.deletedAt,
        })
      }
    }
  }
}

export async function importDatabase(file: File): Promise<void> {
  if (file.name.endsWith('.zip')) {
    await importZipWithPhotos(file)
  } else {
    const text = await file.text()
    const data: BackupData = JSON.parse(text)
    await mergeBackupData(data)
  }
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
