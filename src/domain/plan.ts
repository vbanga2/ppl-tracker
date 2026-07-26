export type Day = 'push' | 'pull' | 'legs'

export interface Exercise {
  id: string
  day: Day
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
}

export interface Block {
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
}

export interface SetLog {
  id: string
  sessionId: string
  blockId: string
  setIndex: number
  weightLb: number
  reps: number
  rir: number
  loggedAt: number
}

export interface Session {
  id: string
  date: string
  day: Day
  startedAt: number
  endedAt: number | null
  notes: string
}

export const DAY_ROTATION: Day[] = ['push', 'pull', 'legs']

export function nextDay(lastDay: Day | null): Day {
  if (!lastDay) return 'push'
  const idx = DAY_ROTATION.indexOf(lastDay)
  return DAY_ROTATION[(idx + 1) % 3]
}

// ─── Seeded Plan ─────────────────────────────────────────────────────────────
// Push = chest, shoulders, triceps
// Pull = back, biceps, rear delts + cardio/sprints
// Legs = quads, hamstrings, glutes, calves

export const SEED_EXERCISES: Exercise[] = [
  // ── PUSH ──
  {
    id: 'ex-bench',
    day: 'push',
    orderIndex: 0,
    name: 'Barbell Bench Press',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Chest'],
    synMuscles: ['Front Delt', 'Triceps'],
    stabMuscles: ['Rotator Cuff'],
    formText: 'Arch naturally, feet flat, bar over mid-chest, full ROM.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-ohp',
    day: 'push',
    orderIndex: 1,
    name: 'Overhead Press',
    incrementLb: 2.5,
    isBodyweight: false,
    mainMuscles: ['Front Delt', 'Side Delt'],
    synMuscles: ['Triceps'],
    stabMuscles: ['Core', 'Rotator Cuff'],
    formText: 'Bar at upper chest, press to lockout, keep core tight.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-incline-db',
    day: 'push',
    orderIndex: 2,
    name: 'Incline DB Press',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Upper Chest'],
    synMuscles: ['Front Delt', 'Triceps'],
    stabMuscles: ['Rotator Cuff'],
    formText: '30–45° incline, DB path converges at top, full ROM.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-lat-raise',
    day: 'push',
    orderIndex: 3,
    name: 'Lateral Raise',
    incrementLb: 2.5,
    isBodyweight: false,
    mainMuscles: ['Side Delt'],
    synMuscles: [],
    stabMuscles: ['Rotator Cuff'],
    formText: 'Slight elbow bend, raise to shoulder height, controlled descent.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-tricep-pushdown',
    day: 'push',
    orderIndex: 4,
    name: 'Tricep Rope Pushdown',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Triceps'],
    synMuscles: [],
    stabMuscles: [],
    formText: 'Elbows pinned at sides, spread rope at bottom, full extension.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-dips',
    day: 'push',
    orderIndex: 5,
    name: 'Dips',
    incrementLb: 2.5,
    isBodyweight: true,
    mainMuscles: ['Triceps', 'Chest'],
    synMuscles: ['Front Delt'],
    stabMuscles: ['Core'],
    formText: 'Stay upright for tricep focus, slight lean for chest.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  // ── PULL ──
  {
    id: 'ex-deadlift',
    day: 'pull',
    orderIndex: 0,
    name: 'Deadlift',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Lats', 'Spinal Erectors'],
    synMuscles: ['Glutes', 'Hamstrings', 'Traps'],
    stabMuscles: ['Core'],
    formText: 'Neutral spine, hips hinge, bar stays close, lockout glutes.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-pullup',
    day: 'pull',
    orderIndex: 1,
    name: 'Pull-ups',
    incrementLb: 2.5,
    isBodyweight: true,
    mainMuscles: ['Lats'],
    synMuscles: ['Biceps', 'Rear Delt'],
    stabMuscles: ['Core'],
    formText: 'Dead hang start, depress scapula before pulling, chin over bar.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-barbell-row',
    day: 'pull',
    orderIndex: 2,
    name: 'Barbell Row',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Lats', 'Mid Traps'],
    synMuscles: ['Biceps', 'Rear Delt'],
    stabMuscles: ['Spinal Erectors'],
    formText: 'Hip hinge ~45°, pull to lower sternum, elbows back.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-face-pull',
    day: 'pull',
    orderIndex: 3,
    name: 'Face Pull',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Rear Delt', 'External Rotators'],
    synMuscles: ['Mid Traps'],
    stabMuscles: [],
    formText: 'Pull to forehead, hands high, elbows flared, rotate externally.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-curl',
    day: 'pull',
    orderIndex: 4,
    name: 'Barbell Curl',
    incrementLb: 2.5,
    isBodyweight: false,
    mainMuscles: ['Biceps'],
    synMuscles: ['Brachialis'],
    stabMuscles: [],
    formText: 'Elbows pinned, full supination at top, controlled descent.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-hammer-curl',
    day: 'pull',
    orderIndex: 5,
    name: 'Hammer Curl',
    incrementLb: 2.5,
    isBodyweight: false,
    mainMuscles: ['Brachialis', 'Brachioradialis'],
    synMuscles: ['Biceps'],
    stabMuscles: [],
    formText: 'Neutral grip, full ROM, no swing.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  // ── LEGS ──
  {
    id: 'ex-squat',
    day: 'legs',
    orderIndex: 0,
    name: 'Barbell Back Squat',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Quads'],
    synMuscles: ['Glutes', 'Hamstrings'],
    stabMuscles: ['Core', 'Spinal Erectors'],
    formText: 'High bar, knees track toes, crease below parallel, stay tall.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-rdl',
    day: 'legs',
    orderIndex: 1,
    name: 'Romanian Deadlift',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Hamstrings', 'Glutes'],
    synMuscles: ['Spinal Erectors'],
    stabMuscles: ['Core'],
    formText: 'Soft knee, hinge until strong stretch in hamstrings, neutral spine.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-leg-press',
    day: 'legs',
    orderIndex: 2,
    name: 'Leg Press',
    incrementLb: 10,
    isBodyweight: false,
    mainMuscles: ['Quads'],
    synMuscles: ['Glutes'],
    stabMuscles: [],
    formText: 'Feet hip-width, full ROM without losing lower back, controlled.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-leg-curl',
    day: 'legs',
    orderIndex: 3,
    name: 'Lying Leg Curl',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Hamstrings'],
    synMuscles: [],
    stabMuscles: [],
    formText: 'Hips on pad, full curl, squeeze at peak, slow negative.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
  {
    id: 'ex-calf-raise',
    day: 'legs',
    orderIndex: 4,
    name: 'Standing Calf Raise',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Calves'],
    synMuscles: [],
    stabMuscles: [],
    formText: 'Full ROM: deep stretch at bottom, peak contraction at top.',
    noteText: '',
    videoUrl: '',
    imageKey: '',
  },
]

export const SEED_BLOCKS: Block[] = [
  // ── BENCH PRESS blocks ──
  {
    id: 'blk-bench-main',
    exerciseId: 'ex-bench',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 5,
    repHigh: 8,
    restSeconds: 180,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  {
    id: 'blk-bench-backoff',
    exerciseId: 'ex-bench',
    orderIndex: 1,
    label: 'Back-off',
    targetSets: 2,
    repLow: 8,
    repHigh: 12,
    restSeconds: 120,
    deriveFromBlockId: 'blk-bench-main',
    deriveMultiplier: 0.8,
    setNotes: [],
  },
  // ── OHP blocks ──
  {
    id: 'blk-ohp-main',
    exerciseId: 'ex-ohp',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 5,
    repHigh: 8,
    restSeconds: 180,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── INCLINE DB blocks ──
  {
    id: 'blk-incline-main',
    exerciseId: 'ex-incline-db',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 8,
    repHigh: 12,
    restSeconds: 120,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── LATERAL RAISE blocks ──
  {
    id: 'blk-lat-raise-main',
    exerciseId: 'ex-lat-raise',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 4,
    repLow: 12,
    repHigh: 20,
    restSeconds: 60,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── TRICEP PUSHDOWN blocks ──
  {
    id: 'blk-pushdown-main',
    exerciseId: 'ex-tricep-pushdown',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 10,
    repHigh: 15,
    restSeconds: 90,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── DIPS blocks ──
  {
    id: 'blk-dips-main',
    exerciseId: 'ex-dips',
    orderIndex: 0,
    label: 'AMRAP sets',
    targetSets: 3,
    repLow: 5,
    repHigh: null,
    restSeconds: 120,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── DEADLIFT blocks ──
  {
    id: 'blk-deadlift-main',
    exerciseId: 'ex-deadlift',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 3,
    repHigh: 5,
    restSeconds: 240,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── PULL-UP blocks ──
  {
    id: 'blk-pullup-main',
    exerciseId: 'ex-pullup',
    orderIndex: 0,
    label: 'AMRAP sets',
    targetSets: 4,
    repLow: 5,
    repHigh: null,
    restSeconds: 120,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── BARBELL ROW blocks ──
  {
    id: 'blk-row-main',
    exerciseId: 'ex-barbell-row',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 6,
    repHigh: 10,
    restSeconds: 120,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  {
    id: 'blk-row-backoff',
    exerciseId: 'ex-barbell-row',
    orderIndex: 1,
    label: 'Back-off',
    targetSets: 2,
    repLow: 10,
    repHigh: 15,
    restSeconds: 90,
    deriveFromBlockId: 'blk-row-main',
    deriveMultiplier: 0.75,
    setNotes: [],
  },
  // ── FACE PULL blocks ──
  {
    id: 'blk-face-pull-main',
    exerciseId: 'ex-face-pull',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 15,
    repHigh: 20,
    restSeconds: 60,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── CURL blocks ──
  {
    id: 'blk-curl-main',
    exerciseId: 'ex-curl',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 8,
    repHigh: 12,
    restSeconds: 90,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── HAMMER CURL blocks ──
  {
    id: 'blk-hammer-main',
    exerciseId: 'ex-hammer-curl',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 10,
    repHigh: 15,
    restSeconds: 60,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── SQUAT blocks ──
  {
    id: 'blk-squat-main',
    exerciseId: 'ex-squat',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 5,
    repHigh: 8,
    restSeconds: 240,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  {
    id: 'blk-squat-backoff',
    exerciseId: 'ex-squat',
    orderIndex: 1,
    label: 'Back-off',
    targetSets: 2,
    repLow: 8,
    repHigh: 12,
    restSeconds: 120,
    deriveFromBlockId: 'blk-squat-main',
    deriveMultiplier: 0.8,
    setNotes: [],
  },
  // ── RDL blocks ──
  {
    id: 'blk-rdl-main',
    exerciseId: 'ex-rdl',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 8,
    repHigh: 12,
    restSeconds: 120,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── LEG PRESS blocks ──
  {
    id: 'blk-legpress-main',
    exerciseId: 'ex-leg-press',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 10,
    repHigh: 15,
    restSeconds: 120,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── LEG CURL blocks ──
  {
    id: 'blk-legcurl-main',
    exerciseId: 'ex-leg-curl',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 3,
    repLow: 10,
    repHigh: 15,
    restSeconds: 90,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
  // ── CALF RAISE blocks ──
  {
    id: 'blk-calf-main',
    exerciseId: 'ex-calf-raise',
    orderIndex: 0,
    label: 'Main sets',
    targetSets: 4,
    repLow: 12,
    repHigh: 20,
    restSeconds: 60,
    deriveFromBlockId: null,
    deriveMultiplier: null,
    setNotes: [],
  },
]
