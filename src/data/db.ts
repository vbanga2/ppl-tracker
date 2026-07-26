import Dexie, { type EntityTable } from 'dexie'

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
  imageKey: string
  updatedAt: number
  deletedAt: number | null
}

export interface DbBlock {
  id: string
  exerciseId: string
  orderIndex: number
  label: string
  targetSets: number
  repLow: number
  repHigh: number | null
  restSeconds: number
  deriveFromBlockId: string | null
  deriveMultiplier: number | null
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
  sets: number
  minutes: number
  distanceMi: number
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

class PPLDatabase extends Dexie {
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
  }
}

export const db = new PPLDatabase()
