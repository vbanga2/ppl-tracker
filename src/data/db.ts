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

export interface DbBackupSnapshot {
  id: string
  savedAt: number
  sessionCount: number
  setCount: number
  label: string
  dataJson: string
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
  brand: string | null
  source: 'off' | 'manual'
  servingDesc: string
  servingGrams: number | null
  kcal: number
  proteinG: number
  carbG: number
  fatG: number
  fiberG: number | null
  sugarG: number | null
  sodiumMg: number | null
  satFatG: number | null
  microsJson: string | null
  lastUsedAt: number
  useCount: number
  updatedAt: number
  deletedAt: number | null
}

export interface DbMealEntry {
  id: string
  date: string
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  foodId: string | null
  label: string | null
  servings: number
  kcalCached: number
  proteinCached: number
  carbCached: number
  fatCached: number
  fiberCached: number | null
  sugarCached: number | null
  sodiumCached: number | null
  updatedAt: number
  deletedAt: number | null
}

export interface DbNutritionTarget {
  id: string
  effectiveFrom: string
  kcal: number
  proteinG: number
  carbG: number
  fatG: number
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

export interface DbBodyMeasurement {
  id: string
  date: string
  chestIn: number | null
  leftArmIn: number | null
  rightArmIn: number | null
  waistIn: number | null
  hipsIn: number | null
  leftThighIn: number | null
  rightThighIn: number | null
  neckIn: number | null
  calfIn: number | null
  notes: string | null
  updatedAt: number
  deletedAt: number | null
}

export interface DbProgressPhoto {
  id: string
  date: string
  pose: 'front' | 'side' | 'back' | 'other'
  blob: Blob
  widthPx: number
  heightPx: number
  notes: string | null
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
  backups!: EntityTable<DbBackupSnapshot, 'id'>
  bodyMeasurements!: EntityTable<DbBodyMeasurement, 'id'>
  progressPhotos!: EntityTable<DbProgressPhoto, 'id'>
  nutritionTargets!: EntityTable<DbNutritionTarget, 'id'>

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
    // Version 6: adds backups table for automatic snapshots
    this.version(6).stores({
      backups: 'id, savedAt',
    })
    // Version 7: adds bodyMeasurements table
    this.version(7).stores({
      bodyMeasurements: 'id, date, deletedAt',
    })
    // Version 8: adds progressPhotos table (blobs stored natively in IndexedDB)
    this.version(8).stores({
      progressPhotos: 'id, date, pose, deletedAt',
    })
    // Version 9: nutrition targets table; extended food schema (servingDesc, servingGrams,
    // fiberG, sugarG, sodiumMg, satFatG, lastUsedAt, useCount); extended mealEntry schema
    this.version(9).stores({
      foods: 'id, barcode, lastUsedAt, useCount, deletedAt',
      nutritionTargets: 'id, effectiveFrom, deletedAt',
    }).upgrade(async tx => {
      await tx.table('foods').toCollection().modify((record: Record<string, unknown>) => {
        const g = record['servingG'] as number | undefined
        if (record['servingGrams'] === undefined) record['servingGrams'] = g ?? null
        if (record['servingDesc'] === undefined) {
          record['servingDesc'] = g ? `${g}g` : '1 serving'
        }
        if (record['fiberG'] === undefined) record['fiberG'] = null
        if (record['sugarG'] === undefined) record['sugarG'] = null
        if (record['sodiumMg'] === undefined) record['sodiumMg'] = null
        if (record['satFatG'] === undefined) record['satFatG'] = null
        if (record['microsJson'] === undefined || record['microsJson'] === '') record['microsJson'] = null
        if (record['lastUsedAt'] === undefined) record['lastUsedAt'] = record['updatedAt'] ?? Date.now()
        if (record['useCount'] === undefined) record['useCount'] = 0
        if (record['brand'] === '' || record['brand'] === undefined) record['brand'] = null
      })
      await tx.table('mealEntries').toCollection().modify((record: Record<string, unknown>) => {
        if (record['fiberCached'] === undefined) record['fiberCached'] = null
        if (record['sugarCached'] === undefined) record['sugarCached'] = null
        if (record['sodiumCached'] === undefined) record['sodiumCached'] = null
      })
    })
    // Version 10: mealEntry gets label (for quick-add); foodId becomes nullable
    this.version(10).stores({}).upgrade(async tx => {
      await tx.table('mealEntries').toCollection().modify((record: Record<string, unknown>) => {
        if (record['label'] === undefined) record['label'] = null
      })
    })
  }
}

export const db = new PPLDatabase()
