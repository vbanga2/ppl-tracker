import Dexie, { type EntityTable } from 'dexie'
import type { RepSpec, LoadSpec } from '../domain/plan'

export interface DbMeta {
  key: string
  value: string
}

export interface DbExercise {
  id: string
  day: 'push' | 'pull' | 'legs'
  orderIndex: number
  name: string
  incrementLb: number
  isBodyweight: boolean
  mainMuscles: string[]
  synMuscles: string[]
  stabMuscles: string[]
  formText: string
  noteText: string
  videoUrl: string
  altVideoUrl: string | null
  imageKey: string
  updatedAt: number
  deletedAt: number | null
}

export interface DbBlock {
  id: string
  exerciseId: string
  exerciseKey: string
  blockKey: string
  orderIndex: number
  label: string
  targetSets: number
  reps: RepSpec
  load: LoadSpec
  restSeconds: number
  restLabel: string
  setNotes: string[]
  updatedAt: number
  deletedAt: number | null
}

export interface DbSession {
  id: string
  date: string
  day: 'push' | 'pull' | 'legs'
  startedAt: number
  endedAt: number | null
  notes: string
  updatedAt: number
  deletedAt: number | null
}

export interface DbSetLog {
  id: string
  sessionId: string
  blockId: string
  setIndex: number
  weightLb: number
  reps: number
  rir: number
  loggedAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface DbCardioLog {
  id: string
  sessionId: string
  kind: 'sprints' | 'treadmill' | 'other'
  activityType: string
  sets: number
  minutes: number
  distanceMi: number
  caloriesBurned: number | null
  notes: string | null
  routeId: string | null
  updatedAt: number
  deletedAt: number | null
}

export interface DbBodyMetric {
  id: string
  date: string
  weightLb: number
  bodyFatPct: number | null
  source: 'manual' | 'health'
  updatedAt: number
  deletedAt: number | null
}

export interface DbHealthSample {
  id: string
  type: string
  startAt: number
  endAt: number
  value: number
  unit: string
  source: string
  updatedAt: number
  deletedAt: number | null
}

export interface DbRoute {
  id: string
  sessionId: string
  startedAt: number
  durationS: number
  distanceMi: number
  polyline: string
  pointsJson: string
  updatedAt: number
  deletedAt: number | null
}

export interface DbFood {
  id: string
  barcode: string | null
  name: string
  brand: string
  servingG: number
  kcal: number
  proteinG: number
  carbG: number
  fatG: number
  microsJson: string
  source: 'off' | 'manual'
  updatedAt: number
  deletedAt: number | null
}

export interface DbMealEntry {
  id: string
  date: string
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  foodId: string
  servings: number
  kcalCached: number
  proteinCached: number
  carbCached: number
  fatCached: number
  updatedAt: number
  deletedAt: number | null
}

export interface DbExerciseNote {
  id: string
  sessionId: string
  exerciseId: string
  text: string
  updatedAt: number
  deletedAt: number | null
}

class PPLDatabase extends Dexie {
  meta!: EntityTable<DbMeta, 'key'>
  exercises!: EntityTable<DbExercise, 'id'>
  blocks!: EntityTable<DbBlock, 'id'>
  sessions!: EntityTable<DbSession, 'id'>
  setLogs!: EntityTable<DbSetLog, 'id'>
  cardioLogs!: EntityTable<DbCardioLog, 'id'>
  bodyMetrics!: EntityTable<DbBodyMetric, 'id'>
  healthSamples!: EntityTable<DbHealthSample, 'id'>
  routes!: EntityTable<DbRoute, 'id'>
  foods!: EntityTable<DbFood, 'id'>
  mealEntries!: EntityTable<DbMealEntry, 'id'>
  exerciseNotes!: EntityTable<DbExerciseNote, 'id'>

  constructor() {
    super('ppl-tracker')
    this.version(1).stores({
      exercises: 'id, day, orderIndex, deletedAt',
      blocks: 'id, exerciseId, orderIndex, deletedAt',
      sessions: 'id, date, day, startedAt, deletedAt',
      setLogs: 'id, sessionId, blockId, setIndex, loggedAt, deletedAt',
      cardioLogs: 'id, sessionId, deletedAt',
      bodyMetrics: 'id, date, deletedAt',
      healthSamples: 'id, type, startAt, deletedAt',
      routes: 'id, sessionId, deletedAt',
      foods: 'id, barcode, deletedAt',
      mealEntries: 'id, date, slot, foodId, deletedAt',
    })
    // Version 2: adds the meta table for seed versioning
    this.version(2).stores({
      meta: 'key',
    })
    // Version 3: adds exerciseKey/blockKey indices and new reps/load fields on blocks
    this.version(3).stores({
      blocks: 'id, exerciseId, exerciseKey, blockKey, orderIndex, deletedAt',
    })
    // Version 4: adds exerciseNotes table
    this.version(4).stores({
      exerciseNotes: 'id, sessionId, exerciseId, deletedAt',
    })
    // Version 5: adds activityType, caloriesBurned, notes to cardioLogs
    this.version(5).stores({}).upgrade(async tx => {
      await tx.table('cardioLogs').toCollection().modify((record: Record<string, unknown>) => {
        if (!record['activityType']) record['activityType'] = record['kind']
        if (record['caloriesBurned'] === undefined) record['caloriesBurned'] = null
        if (record['notes'] === undefined) record['notes'] = null
      })
    })
  }
}

export const db = new PPLDatabase()
