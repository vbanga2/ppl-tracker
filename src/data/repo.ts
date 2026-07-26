import { db } from './db'
import type { DbBlock, DbBodyMetric, DbCardioLog, DbExercise, DbMealEntry, DbSession, DbSetLog } from './db'
import { SEED_BLOCKS, SEED_EXERCISES } from '../domain/plan'

function now(): number {
  return Date.now()
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

export async function seedPlanIfEmpty(): Promise<void> {
  const count = await db.exercises.count()
  if (count > 0) return

  const ts = now()
  await db.transaction('rw', db.exercises, db.blocks, async () => {
    await db.exercises.bulkAdd(
      SEED_EXERCISES.map(e => ({ ...e, updatedAt: ts, deletedAt: null })),
    )
    await db.blocks.bulkAdd(
      SEED_BLOCKS.map(b => ({ ...b, updatedAt: ts, deletedAt: null })),
    )
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
