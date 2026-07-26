import { db } from './db'

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
}

export async function exportDatabase(): Promise<BackupData> {
  const [
    exercises, blocks, sessions, setLogs, cardioLogs,
    bodyMetrics, healthSamples, routes, foods, mealEntries,
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

export async function triggerAutoBackup(): Promise<void> {
  const data = await exportDatabase()
  downloadBackup(data)
  localStorage.setItem('lastBackupAt', String(data.exportedAt))
}

export async function importDatabase(file: File): Promise<void> {
  const text = await file.text()
  const data: BackupData = JSON.parse(text)

  if (typeof data.version !== 'number') {
    throw new Error('Invalid backup file — missing version field.')
  }

  const allTables = [
    db.exercises, db.blocks, db.sessions, db.setLogs, db.cardioLogs,
    db.bodyMetrics, db.healthSamples, db.routes, db.foods, db.mealEntries,
  ]
  await db.transaction('rw', allTables, async () => {
      await db.exercises.clear()
      await db.blocks.clear()
      await db.sessions.clear()
      await db.setLogs.clear()
      await db.cardioLogs.clear()
      await db.bodyMetrics.clear()
      await db.healthSamples.clear()
      await db.routes.clear()
      await db.foods.clear()
      await db.mealEntries.clear()

      if (data.exercises?.length) await db.exercises.bulkAdd(data.exercises as never[])
      if (data.blocks?.length) await db.blocks.bulkAdd(data.blocks as never[])
      if (data.sessions?.length) await db.sessions.bulkAdd(data.sessions as never[])
      if (data.setLogs?.length) await db.setLogs.bulkAdd(data.setLogs as never[])
      if (data.cardioLogs?.length) await db.cardioLogs.bulkAdd(data.cardioLogs as never[])
      if (data.bodyMetrics?.length) await db.bodyMetrics.bulkAdd(data.bodyMetrics as never[])
      if (data.healthSamples?.length) await db.healthSamples.bulkAdd(data.healthSamples as never[])
      if (data.routes?.length) await db.routes.bulkAdd(data.routes as never[])
      if (data.foods?.length) await db.foods.bulkAdd(data.foods as never[])
      if (data.mealEntries?.length) await db.mealEntries.bulkAdd(data.mealEntries as never[])
    },
  )
}
