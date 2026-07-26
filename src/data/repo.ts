import { db } from './db'
import type { DbBlock, DbBodyMetric, DbCardioLog, DbExercise, DbMealEntry, DbSession, DbSetLog } from './db'
import { SEED_BLOCKS, SEED_EXERCISES } from '../domain/plan'

// Bump this whenever SEED_EXERCISES or SEED_BLOCKS changes incompatibly.
// The migration runs once on any device whose stored version is lower.
const SEED_VERSION = 2

function now(): number {
  return Date.now()
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
              label: newBlock.label,
              targetSets: newBlock.targetSets,
              repLow: newBlock.repLow,
              repHigh: newBlock.repHigh,
              restSeconds: newBlock.restSeconds,
              deriveFromBlockId: newBlock.deriveFromBlockId,
              deriveMultiplier: newBlock.deriveMultiplier,
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
  return db.blocks
    .where('exerciseId')
    .equals(exerciseId)
    .filter(b => b.deletedAt === null)
    .sortBy('orderIndex')
}

export async function getAllBlocks(): Promise<DbBlock[]> {
  return db.blocks.filter(b => b.deletedAt === null).toArray()
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getOrCreateTodaySession(
  day: 'push' | 'pull' | 'legs',
  todayDate: string,
): Promise<DbSession> {
  const existing = await db.sessions
    .where('date')
    .equals(todayDate)
    .filter(s => s.deletedAt === null)
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
    .orderBy('startedAt')
    .reverse()
    .filter(s => s.deletedAt === null)
    .first()
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
