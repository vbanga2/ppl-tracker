import { db } from './db'
import type { DbBlock, DbBodyMeasurement, DbBodyMetric, DbCardioLog, DbExercise, DbExerciseNote, DbFood, DbMealEntry, DbProgressPhoto, DbSession, DbSetLog } from './db'
import type { RepSpec, LoadSpec } from '../domain/plan'
import { SEED_BLOCKS, SEED_EXERCISES } from '../domain/plan'

// Bump this whenever SEED_EXERCISES or SEED_BLOCKS changes incompatibly.
// The migration runs once on any device whose stored version is lower.
const SEED_VERSION = 4

function now(): number {
  return Date.now()
}

function legacyRestLabel(s: number): string {
  if (s === 0) return '—'
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m === 0) return `${s} s`
  if (rem === 0) return `${m} min`
  return `${m} m ${rem} s`
}

/**
 * Blocks written before SEED_VERSION 4 have repLow/repHigh instead of reps/load.
 * Convert them at read time so the rest of the app never sees the old shape.
 */
export function normalizeBlock(raw: DbBlock): DbBlock {
  const r = raw as unknown as Record<string, unknown>
  if (r['reps'] != null && r['load'] != null) return raw

  const repLow = (r['repLow'] as number | undefined) ?? 1
  const repHigh = (r['repHigh'] as number | null | undefined) ?? null

  const reps: RepSpec =
    repHigh != null
      ? { kind: 'range', low: repLow, high: repHigh }
      : { kind: 'failure' }

  const load: LoadSpec = { kind: 'increment', lb: 5 }

  return {
    ...raw,
    exerciseKey:
      (r['exerciseKey'] as string | undefined) ?? raw.exerciseId.replace('ex-', ''),
    blockKey: (r['blockKey'] as string | undefined) ?? 'main',
    reps,
    load,
    restLabel:
      (r['restLabel'] as string | undefined) ?? legacyRestLabel(raw.restSeconds),
    setNotes: (r['setNotes'] as string[] | undefined) ?? [],
  }
}

// ─── Seed / Migration ─────────────────────────────────────────────────────────

export async function ensureSeedCurrent(): Promise<void> {
  const stored = await db.meta.get('seedVersion')
  const storedVersion = stored ? parseInt(stored.value, 10) : 0
  if (storedVersion >= SEED_VERSION) return

  const allOldExercises = await db.exercises.toArray()

  await db.transaction('rw', db.exercises, db.blocks, db.meta, async () => {
    const ts = now()

    // Derive a "key" from each old exercise's ID by stripping the "ex-" prefix.
    // E.g. "ex-bench" → "bench", which matches imageKey "bench" in the new seed.
    const oldByKey = new Map<string, DbExercise>()
    for (const ex of allOldExercises) {
      const key = ex.id.startsWith('ex-') ? ex.id.slice(3) : ex.id
      oldByKey.set(key, ex)
    }

    const matchedOldIds = new Set<string>()

    for (const newEx of SEED_EXERCISES) {
      const key = newEx.imageKey
      const oldEx = oldByKey.get(key)

      if (oldEx) {
        // ── Matched exercise: update content in-place, keep old ID ──
        // Keeping the ID means every setLog that references a block of this exercise
        // continues to point at the right place.
        matchedOldIds.add(oldEx.id)

        await db.exercises.update(oldEx.id, {
          day: newEx.day,
          orderIndex: newEx.orderIndex,
          name: newEx.name,
          incrementLb: newEx.incrementLb,
          isBodyweight: newEx.isBodyweight,
          mainMuscles: newEx.mainMuscles,
          synMuscles: newEx.synMuscles,
          stabMuscles: newEx.stabMuscles,
          formText: newEx.formText,
          noteText: newEx.noteText,
          videoUrl: newEx.videoUrl,
          altVideoUrl: newEx.altVideoUrl,
          imageKey: newEx.imageKey,
          updatedAt: ts,
          deletedAt: null,
        })

        // Reconcile blocks by orderIndex to preserve setLog→blockId links.
        const oldBlocks = await db.blocks.where('exerciseId').equals(oldEx.id).toArray()
        const newBlocks = SEED_BLOCKS.filter(b => b.exerciseId === newEx.id)

        const oldByOrderIndex = new Map(oldBlocks.map(b => [b.orderIndex, b]))
        const newOrderIndices = new Set(newBlocks.map(b => b.orderIndex))

        for (const newBlock of newBlocks) {
          const oldBlock = oldByOrderIndex.get(newBlock.orderIndex)
          if (oldBlock) {
            // Update in-place — setLogs referencing this blockId remain valid.
            await db.blocks.update(oldBlock.id, {
              exerciseKey: newBlock.exerciseKey,
              blockKey: newBlock.blockKey,
              label: newBlock.label,
              targetSets: newBlock.targetSets,
              reps: newBlock.reps,
              load: newBlock.load,
              restSeconds: newBlock.restSeconds,
              restLabel: newBlock.restLabel,
              setNotes: newBlock.setNotes,
              updatedAt: ts,
              deletedAt: null,
            })
          } else {
            // New block slot for this exercise (higher orderIndex than before).
            await db.blocks.add({ ...newBlock, exerciseId: oldEx.id, updatedAt: ts, deletedAt: null })
          }
        }

        // Soft-delete block slots that no longer exist in the new seed.
        // Their setLogs are kept; the UI just won't surface them in the active list.
        for (const oldBlock of oldBlocks) {
          if (!newOrderIndices.has(oldBlock.orderIndex) && oldBlock.deletedAt === null) {
            await db.blocks.update(oldBlock.id, { deletedAt: ts, updatedAt: ts })
          }
        }

      } else {
        // ── New exercise: insert fresh ──
        await db.exercises.add({ ...newEx, updatedAt: ts, deletedAt: null })
        const newBlocks = SEED_BLOCKS.filter(b => b.exerciseId === newEx.id)
        for (const block of newBlocks) {
          await db.blocks.add({ ...block, updatedAt: ts, deletedAt: null })
        }
      }
    }

    // Soft-delete old exercises that have no counterpart in the new seed.
    // Their blocks are soft-deleted too, but setLogs are left untouched.
    for (const oldEx of allOldExercises) {
      if (!matchedOldIds.has(oldEx.id) && oldEx.deletedAt === null) {
        await db.exercises.update(oldEx.id, { deletedAt: ts, updatedAt: ts })
        const orphanBlocks = await db.blocks.where('exerciseId').equals(oldEx.id).toArray()
        for (const blk of orphanBlocks) {
          if (blk.deletedAt === null) {
            await db.blocks.update(blk.id, { deletedAt: ts, updatedAt: ts })
          }
        }
      }
    }

    await db.meta.put({ key: 'seedVersion', value: String(SEED_VERSION) })
  })
}

// ─── Exercises ────────────────────────────────────────────────────────────────

export async function getExercisesByDay(day: string): Promise<DbExercise[]> {
  return db.exercises
    .where('day')
    .equals(day)
    .filter(e => e.deletedAt === null)
    .sortBy('orderIndex')
}

export async function getBlocksByExercise(exerciseId: string): Promise<DbBlock[]> {
  const blocks = await db.blocks
    .where('exerciseId')
    .equals(exerciseId)
    .filter(b => b.deletedAt === null)
    .sortBy('orderIndex')
  return blocks.map(normalizeBlock)
}

export async function getAllBlocks(): Promise<DbBlock[]> {
  const blocks = await db.blocks.filter(b => b.deletedAt === null).toArray()
  return blocks.map(normalizeBlock)
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getOrCreateTodaySession(
  day: 'push' | 'pull' | 'legs',
  todayDate: string,
): Promise<DbSession> {
  const existing = await db.sessions
    .where('date')
    .equals(todayDate)
    .filter(s => s.deletedAt === null && s.day === day)
    .first()

  if (existing) return existing

  const session: DbSession = {
    id: crypto.randomUUID(),
    date: todayDate,
    day,
    startedAt: now(),
    endedAt: null,
    notes: '',
    updatedAt: now(),
    deletedAt: null,
  }
  await db.sessions.add(session)
  return session
}

export async function endSession(sessionId: string): Promise<void> {
  const ts = now()
  await db.sessions.update(sessionId, { endedAt: ts, updatedAt: ts })
}

export async function deleteSession(sessionId: string): Promise<void> {
  const ts = now()
  await db.sessions.update(sessionId, { deletedAt: ts, updatedAt: ts })
}

export async function getRecentSessions(limit = 20): Promise<DbSession[]> {
  return db.sessions
    .orderBy('startedAt')
    .reverse()
    .filter(s => s.deletedAt === null)
    .limit(limit)
    .toArray()
}

export async function getLastSession(): Promise<DbSession | undefined> {
  return db.sessions
    .orderBy('date')
    .reverse()
    .filter(s => s.deletedAt === null)
    .first()
}

export async function getSessionsForDate(date: string): Promise<DbSession[]> {
  return db.sessions
    .where('date')
    .equals(date)
    .filter(s => s.deletedAt === null)
    .toArray()
}

export async function createSessionForDate(
  day: 'push' | 'pull' | 'legs',
  date: string,
): Promise<DbSession> {
  const session: DbSession = {
    id: crypto.randomUUID(),
    date,
    day,
    startedAt: new Date(date + 'T00:00:00').getTime(),
    endedAt: null,
    notes: '',
    updatedAt: now(),
    deletedAt: null,
  }
  await db.sessions.add(session)
  return session
}

export async function updateSessionNotes(sessionId: string, notes: string): Promise<void> {
  await db.sessions.update(sessionId, { notes, updatedAt: now() })
}

// ─── Set Logs ─────────────────────────────────────────────────────────────────

export async function logSet(set: Omit<DbSetLog, 'updatedAt' | 'deletedAt'>): Promise<void> {
  await db.setLogs.add({ ...set, updatedAt: now(), deletedAt: null })
}

export async function deleteSet(setId: string): Promise<void> {
  const ts = now()
  await db.setLogs.update(setId, { deletedAt: ts, updatedAt: ts })
}

export async function getSetsForSession(sessionId: string): Promise<DbSetLog[]> {
  return db.setLogs
    .where('sessionId')
    .equals(sessionId)
    .filter(s => s.deletedAt === null)
    .sortBy('loggedAt')
}

export async function getSetsForBlock(blockId: string, sessionId: string): Promise<DbSetLog[]> {
  return db.setLogs
    .where('blockId')
    .equals(blockId)
    .filter(s => s.deletedAt === null && s.sessionId === sessionId)
    .sortBy('setIndex')
}

export async function getPreviousSetsForBlock(
  blockId: string,
  currentSessionId: string,
): Promise<DbSetLog[]> {
  const all = await db.setLogs
    .where('blockId')
    .equals(blockId)
    .filter(s => s.deletedAt === null && s.sessionId !== currentSessionId)
    .toArray()

  if (all.length === 0) return []

  const latestSession = all.reduce((a, b) => (a.loggedAt > b.loggedAt ? a : b))
  const latestSessionId = latestSession.sessionId

  return all.filter(s => s.sessionId === latestSessionId).sort((a, b) => a.setIndex - b.setIndex)
}

// ─── Cardio ───────────────────────────────────────────────────────────────────

export async function logCardio(cardio: Omit<DbCardioLog, 'updatedAt' | 'deletedAt'>): Promise<void> {
  await db.cardioLogs.add({ ...cardio, updatedAt: now(), deletedAt: null })
}

export async function deleteCardio(cardioId: string): Promise<void> {
  const ts = now()
  await db.cardioLogs.update(cardioId, { deletedAt: ts, updatedAt: ts })
}

export async function getCardioForSession(sessionId: string): Promise<DbCardioLog[]> {
  return db.cardioLogs
    .where('sessionId')
    .equals(sessionId)
    .filter(c => c.deletedAt === null)
    .toArray()
}

export async function getLastPullSprintSets(): Promise<number | null> {
  const pullSessions = await db.sessions
    .orderBy('startedAt')
    .reverse()
    .filter(s => s.day === 'pull' && s.deletedAt === null)
    .limit(5)
    .toArray()

  for (const session of pullSessions) {
    const cardio = await db.cardioLogs
      .where('sessionId')
      .equals(session.id)
      .filter(c => c.kind === 'sprints' && c.deletedAt === null)
      .first()
    if (cardio) return cardio.sets
  }
  return null
}

// ─── Body Metrics ─────────────────────────────────────────────────────────────

export async function addBodyMetric(metric: Omit<DbBodyMetric, 'updatedAt' | 'deletedAt'>): Promise<void> {
  await db.bodyMetrics.add({ ...metric, updatedAt: now(), deletedAt: null })
}

export async function getBodyMetrics(limit = 90): Promise<DbBodyMetric[]> {
  return db.bodyMetrics
    .orderBy('date')
    .reverse()
    .filter(m => m.deletedAt === null)
    .limit(limit)
    .toArray()
}

export async function getLatestBodyWeight(): Promise<number | null> {
  const m = await db.bodyMetrics
    .orderBy('date')
    .reverse()
    .filter(m => m.deletedAt === null)
    .first()
  return m?.weightLb ?? null
}

// ─── Foods ────────────────────────────────────────────────────────────────────

export async function getAllFoods(): Promise<DbFood[]> {
  const foods = await db.foods.filter(f => f.deletedAt === null).toArray()
  return foods.sort((a, b) => {
    if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt - a.lastUsedAt
    if (b.useCount !== a.useCount) return b.useCount - a.useCount
    return a.name.localeCompare(b.name)
  })
}

export async function addFood(
  food: Omit<DbFood, 'id' | 'updatedAt' | 'deletedAt'>,
): Promise<DbFood> {
  const ts = now()
  const record: DbFood = { ...food, id: crypto.randomUUID(), updatedAt: ts, deletedAt: null }
  await db.foods.add(record)
  return record
}

export async function updateFood(
  id: string,
  fields: Partial<Omit<DbFood, 'id' | 'updatedAt' | 'deletedAt'>>,
): Promise<void> {
  await db.foods.update(id, { ...fields, updatedAt: now() })
}

export async function deleteFood(id: string): Promise<void> {
  const ts = now()
  await db.foods.update(id, { deletedAt: ts, updatedAt: ts })
}

export async function recordFoodUsed(foodId: string): Promise<void> {
  const food = await db.foods.get(foodId)
  if (!food) return
  await db.foods.update(foodId, { lastUsedAt: now(), useCount: food.useCount + 1, updatedAt: now() })
}

// ─── Meal Entries ─────────────────────────────────────────────────────────────

export async function getMealEntriesForDate(date: string): Promise<DbMealEntry[]> {
  return db.mealEntries
    .where('date')
    .equals(date)
    .filter(m => m.deletedAt === null)
    .toArray()
}

// ─── All-Sets history (for charts) ───────────────────────────────────────────

export async function getAllSetsForBlock(blockId: string): Promise<(DbSetLog & { date: string })[]> {
  const sets = await db.setLogs
    .where('blockId')
    .equals(blockId)
    .filter(s => s.deletedAt === null)
    .toArray()

  const sessionIds = [...new Set(sets.map(s => s.sessionId))]
  const sessions = await db.sessions.bulkGet(sessionIds)
  const dateMap = new Map(sessions.map(s => [s?.id, s?.date ?? '']))

  return sets.map(s => ({ ...s, date: dateMap.get(s.sessionId) ?? '' }))
}

/** All non-deleted sets for every block belonging to an exercise.
 *  Includes sets from soft-deleted blocks (historical record).
 *  Excludes sets with deletedAt set, and sets from deleted sessions.
 */
export async function getAllSetsForExercise(
  exerciseId: string,
): Promise<(DbSetLog & { date: string; day: DbSession['day'] })[]> {
  const blocks = await db.blocks.where('exerciseId').equals(exerciseId).toArray()
  if (blocks.length === 0) return []

  const allSets: DbSetLog[] = []
  for (const block of blocks) {
    const sets = await db.setLogs
      .where('blockId')
      .equals(block.id)
      .filter(s => s.deletedAt === null)
      .toArray()
    allSets.push(...sets)
  }
  if (allSets.length === 0) return []

  const sessionIds = [...new Set(allSets.map(s => s.sessionId))]
  const sessions = await db.sessions.bulkGet(sessionIds)
  const sessionMap = new Map(sessions.filter(Boolean).map(s => [s!.id, s!]))

  return allSets
    .filter(s => {
      const sess = sessionMap.get(s.sessionId)
      return sess && sess.deletedAt === null
    })
    .map(s => {
      const sess = sessionMap.get(s.sessionId)!
      return { ...s, date: sess.date, day: sess.day }
    })
}

/** All non-deleted exercises sorted by day order then orderIndex. */
export async function getAllExercises(): Promise<DbExercise[]> {
  const exs = await db.exercises.filter(e => e.deletedAt === null).toArray()
  const dayOrder: Record<string, number> = { push: 0, pull: 1, legs: 2 }
  return exs.sort((a, b) => {
    const dd = dayOrder[a.day] - dayOrder[b.day]
    return dd !== 0 ? dd : a.orderIndex - b.orderIndex
  })
}

/** All non-deleted sessions in chronological order. */
export async function getAllSessionsOrdered(): Promise<DbSession[]> {
  return db.sessions.orderBy('date').filter(s => s.deletedAt === null).toArray()
}

/** All non-deleted cardio logs. */
export async function getAllCardioLogs(): Promise<DbCardioLog[]> {
  return db.cardioLogs.filter(c => c.deletedAt === null).toArray()
}

/** All non-deleted body metrics in chronological order (oldest first). */
export async function getAllBodyMetrics(): Promise<DbBodyMetric[]> {
  return db.bodyMetrics.orderBy('date').filter(m => m.deletedAt === null).toArray()
}

export async function getBodyMetricForDate(date: string): Promise<DbBodyMetric | undefined> {
  return db.bodyMetrics
    .where('date')
    .equals(date)
    .filter(m => m.deletedAt === null)
    .first()
}

export async function deleteBodyMetric(id: string): Promise<void> {
  await db.bodyMetrics.update(id, { deletedAt: now(), updatedAt: now() })
}

export async function updateBodyMetric(
  id: string,
  fields: { date: string; weightLb: number; bodyFatPct: number | null },
): Promise<void> {
  await db.bodyMetrics.update(id, { ...fields, updatedAt: now() })
}

// ─── Exercise Notes ───────────────────────────────────────────────────────────

export async function getExerciseNote(
  sessionId: string,
  exerciseId: string,
): Promise<DbExerciseNote | undefined> {
  return db.exerciseNotes
    .where('[sessionId+exerciseId]')
    .equals([sessionId, exerciseId])
    .filter(n => n.deletedAt === null)
    .first()
    .catch(() =>
      // Fallback if compound index not yet available
      db.exerciseNotes
        .filter(n => n.sessionId === sessionId && n.exerciseId === exerciseId && n.deletedAt === null)
        .first()
    )
}

export async function saveExerciseNote(note: {
  sessionId: string
  exerciseId: string
  text: string
}): Promise<void> {
  const existing = await db.exerciseNotes
    .filter(n => n.sessionId === note.sessionId && n.exerciseId === note.exerciseId && n.deletedAt === null)
    .first()

  if (existing) {
    await db.exerciseNotes.update(existing.id, { text: note.text, updatedAt: now() })
  } else {
    const record: DbExerciseNote = {
      id: crypto.randomUUID(),
      sessionId: note.sessionId,
      exerciseId: note.exerciseId,
      text: note.text,
      updatedAt: now(),
      deletedAt: null,
    }
    await db.exerciseNotes.add(record)
  }
}

export async function getExerciseNotesForSession(sessionId: string): Promise<DbExerciseNote[]> {
  return db.exerciseNotes
    .where('sessionId')
    .equals(sessionId)
    .filter(n => n.deletedAt === null)
    .toArray()
}

// ─── Calendar bulk load ───────────────────────────────────────────────────────

export async function loadCalendarData(): Promise<{
  sessions: DbSession[]
  setLogs: DbSetLog[]
  exercises: DbExercise[]
  blocks: DbBlock[]
  bodyMetrics: DbBodyMetric[]
  cardioLogs: DbCardioLog[]
}> {
  const [sessions, setLogs, exercises, blocks, bodyMetrics, cardioLogs] = await Promise.all([
    db.sessions.filter(s => s.deletedAt === null).toArray(),
    db.setLogs.filter(s => s.deletedAt === null).toArray(),
    db.exercises.toArray(),
    db.blocks.toArray(),
    db.bodyMetrics.orderBy('date').filter(m => m.deletedAt === null).toArray(),
    db.cardioLogs.filter(c => c.deletedAt === null).toArray(),
  ])
  return { sessions, setLogs, exercises, blocks, bodyMetrics, cardioLogs }
}

// ─── Body Measurements ────────────────────────────────────────────────────────

export async function addBodyMeasurement(
  m: Omit<DbBodyMeasurement, 'updatedAt' | 'deletedAt'>,
): Promise<void> {
  await db.bodyMeasurements.add({ ...m, updatedAt: now(), deletedAt: null })
}

export async function getAllBodyMeasurements(): Promise<DbBodyMeasurement[]> {
  return db.bodyMeasurements.orderBy('date').filter(m => m.deletedAt === null).toArray()
}

export async function updateBodyMeasurement(
  id: string,
  fields: Partial<Omit<DbBodyMeasurement, 'id' | 'updatedAt' | 'deletedAt'>>,
): Promise<void> {
  await db.bodyMeasurements.update(id, { ...fields, updatedAt: now() })
}

export async function deleteBodyMeasurement(id: string): Promise<void> {
  await db.bodyMeasurements.update(id, { deletedAt: now(), updatedAt: now() })
}

export async function countBodyMetricsWithDefaultFat(): Promise<number> {
  return db.bodyMetrics.filter(m => m.deletedAt === null && m.bodyFatPct === 15).count()
}

export async function clearDefaultBodyFat(): Promise<void> {
  const ts = now()
  await db.bodyMetrics
    .filter(m => m.deletedAt === null && m.bodyFatPct === 15)
    .modify({ bodyFatPct: null, updatedAt: ts })
}

// ─── Progress Photos ──────────────────────────────────────────────────────────

export async function addProgressPhoto(
  p: Omit<DbProgressPhoto, 'updatedAt' | 'deletedAt'>,
): Promise<void> {
  await db.progressPhotos.add({ ...p, updatedAt: now(), deletedAt: null })
}

export async function getAllProgressPhotos(): Promise<DbProgressPhoto[]> {
  return db.progressPhotos.orderBy('date').filter(p => p.deletedAt === null).toArray()
}

export async function updateProgressPhoto(
  id: string,
  fields: Partial<Pick<DbProgressPhoto, 'notes' | 'pose' | 'date'>>,
): Promise<void> {
  await db.progressPhotos.update(id, { ...fields, updatedAt: now() })
}

export async function deleteProgressPhoto(id: string): Promise<void> {
  await db.progressPhotos.update(id, { deletedAt: now(), updatedAt: now() })
}

export async function getPhotoStorageBytes(): Promise<number> {
  const photos = await db.progressPhotos.filter(p => p.deletedAt === null).toArray()
  let total = 0
  for (const p of photos) {
    total += p.blob.size
  }
  return total
}
