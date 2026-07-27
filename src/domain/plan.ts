import { BLOCKS, HEAVY_BLOCK_DEFAULT_INCREMENTS, type RepSpec, type LoadSpec, type BlockSpec } from './plan-prescriptions'
export type { RepSpec, LoadSpec }
export { HEAVY_BLOCK_DEFAULT_INCREMENTS }

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
  altVideoUrl: string | null
  imageKey: string
}

export interface Block {
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

export function formatRepSpec(reps: RepSpec): string {
  switch (reps.kind) {
    case 'range': return `${reps.low} - ${reps.high}`
    case 'fixed': return String(reps.reps)
    case 'failure': return 'F'
    case 'minToFailure': return `${reps.low} – F`
    default: throw new Error(`Unhandled reps kind: ${(reps as RepSpec).kind}`)
  }
}

// ─── Seeded Plan ─────────────────────────────────────────────────────────────
// Push = chest, shoulders, triceps
// Pull = back, traps + deadlift + cardio/sprints
// Legs = quads, glutes, calves, core

export const SEED_EXERCISES: Exercise[] = [
  // ── PUSH ──
  {
    id: 'ex-ohp',
    day: 'push',
    orderIndex: 0,
    name: 'Seated Military Press',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Anterior deltoid, triceps brachii.'],
    synMuscles: ['Lateral deltoid, upper chest.'],
    stabMuscles: ['Rotator cuff, core, upper back.'],
    formText:
      'Grab the barbell slightly outside shoulder width, elbows slightly forward in line with your wrists. Bring the bar down to touch the chest and push through your feet for stability. A slight back arch is okay — if it gets too drastic, lower the weight.',
    noteText: '',
    videoUrl: 'https://www.youtube.com/shorts/k6tzKisR3NY',
    altVideoUrl: null,
    imageKey: 'ohp',
  },
  {
    id: 'ex-bench',
    day: 'push',
    orderIndex: 1,
    name: 'Flat Bench Press',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Pectoralis major (mid / sternal).'],
    synMuscles: ['Triceps brachii, anterior deltoid.'],
    stabMuscles: ['Rotator cuff, serratus anterior, scapular retractors.'],
    formText:
      'Tuck the shoulder blades in; back arch is okay. Plant feet, glutes, upper back and head. Grip 1.5x shoulder width (wider targets chest, narrower targets triceps). Squeeze the bar hard and un-rack. Point elbows slightly in at roughly a 45º angle on the negative. Move the bar down and slightly forward to touch the chest. Press slightly back and then up while pushing your feet into the floor — bringing the bar back early in the concentric puts less stress on the anterior delts and more on the pecs.',
    noteText: '',
    videoUrl: 'https://www.youtube.com/shorts/hWbUlkb5Ms4',
    altVideoUrl: null,
    imageKey: 'bench',
  },
  {
    id: 'ex-incline',
    day: 'push',
    orderIndex: 2,
    name: 'Incline Bench Press',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Clavicular / upper, mid and lower pectoralis major.'],
    synMuscles: ['Anterior deltoid, triceps brachii.'],
    stabMuscles: ['Rotator cuff, serratus anterior, scapular retractors.'],
    formText:
      'Set the bench at 30–45º. Retract the shoulders. Grip slightly wider than shoulder width and un-rack. Do NOT flare the elbows (risk of shoulder injury) — tuck them 30–60º from the torso. Bring the bar to the lower chest, not the upper chest. Push the bar up and slightly back while pushing your feet into the floor.',
    noteText:
      'Incline bench press leads to the same lower and mid-pec growth as flat bench, plus BETTER upper pec growth. Consider switching the order of bench press periodically to do inclines before flat, and add a strength set to it (load: 0.8 x flat bench power).',
    videoUrl: 'https://www.youtube.com/shorts/98HWfiRonkE',
    altVideoUrl: null,
    imageKey: 'incline',
  },
  {
    id: 'ex-cgbp',
    day: 'push',
    orderIndex: 3,
    name: 'Close-Grip Bench Press',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Triceps brachii.'],
    synMuscles: ['Pectoralis major, anterior deltoid.'],
    stabMuscles: ['Rotator cuff, wrists / forearms.'],
    formText:
      'Grip just inside shoulder width. Retract the shoulders. Keep a slight back arch. Elbows tucked 30–45º, do NOT flare the elbows. Lower the bar to the lower chest.',
    noteText: '',
    videoUrl: 'https://www.youtube.com/shorts/xXd7sddHGa0',
    altVideoUrl: null,
    imageKey: 'cgbp',
  },
  {
    id: 'ex-sidefly',
    day: 'push',
    orderIndex: 4,
    name: "Arnold's Side & Rear Delt Fly",
    incrementLb: 2.5,
    isBodyweight: false,
    mainMuscles: ['Posterior deltoid, lateral deltoid.'],
    synMuscles: ['Infraspinatus, teres minor, middle / lower traps, rhomboids.'],
    stabMuscles: ['Core, scapular stabilizers.'],
    formText:
      'Lie on your side, bend your knees. Start with the arm hanging towards the floor, slight bend in the elbow. Lift the dumbbell up to the ceiling, pause, and slowly lower it down.',
    noteText: '',
    videoUrl: 'https://www.youtube.com/shorts/U5wTk6laXB4',
    altVideoUrl: null,
    imageKey: 'sidefly',
  },
  {
    id: 'ex-reardelt',
    day: 'push',
    orderIndex: 5,
    name: 'Bent-Over DB Rear Delt Fly',
    incrementLb: 2.5,
    isBodyweight: false,
    mainMuscles: ['Posterior deltoid, lateral deltoid.'],
    synMuscles: ['Infraspinatus, teres minor, middle / lower traps, rhomboids.'],
    stabMuscles: ['Core, scapular stabilizers.'],
    formText:
      'Rest your chest on an incline bench, slightly round the upper back (protract shoulders). Pull the dumbbells out and away from you — do NOT pull the dumbbells back, and keep the traps relaxed. Keep tension by going up until the arms are flat with the torso (not beyond), stopping before the arms are perpendicular to the ground.',
    noteText: '',
    videoUrl: 'https://www.youtube.com/shorts/vzQmQN3hpYY',
    altVideoUrl: 'https://www.youtube.com/shorts/LsT-bR_zxLo',
    imageKey: 'reardelt',
  },
  {
    id: 'ex-dips',
    day: 'push',
    orderIndex: 6,
    name: 'Weighted Dips',
    incrementLb: 2.5,
    isBodyweight: true,
    mainMuscles: ['Lower chest, triceps brachii.'],
    synMuscles: ['Anterior deltoid.'],
    stabMuscles: ['Scapular depressors, core.'],
    formText:
      'Grip just outside shoulder width. Extend elbows and bend knees. Slightly retract and depress the shoulders. Lean the torso slightly forward (NOT too far forward, but also not upright). Slowly lower the torso until the elbows are slightly past a 90º angle. Without pausing at the bottom, drive down into the handles and go back up, keeping the torso in the same position — do NOT kip. At the top of the range ensure the shoulders are still retracted and the back is still extended (do NOT round your back).',
    noteText:
      'Dips hit the ENTIRE pec to a significant degree. They activate upper chest even more than incline bench press. Arguably the GOAT chest exercise.',
    videoUrl: 'https://youtu.be/bD8z4Jyax90',
    altVideoUrl: null,
    imageKey: 'dips',
  },
  // ── PULL ──
  {
    id: 'ex-dl',
    day: 'pull',
    orderIndex: 0,
    name: 'Deadlifts (Conventional & Romanian)',
    incrementLb: 10,
    isBodyweight: false,
    mainMuscles: ['Glutes, hamstrings, spinal erectors.'],
    synMuscles: ['Traps, lats, adductors.'],
    stabMuscles: ['Core, forearms / grip.'],
    formText:
      'Keep feet at hip width. Shins 1" from the bar. The bar should cross the middle of the foot. Point toes slightly out. Set hips back with nearly straight knees (do NOT squat down to grab the bar). Grip the bar just outside the shins using an over/under grip to prevent slippage. Let the shins make contact with the bar. Pull the bar up while keeping the chest up and thrusting the hips forward. Stand up straight and lock out the hips. Lower the weight by sending the hips back and letting the knees bend.',
    noteText:
      'RDLs: shoulder width grip just outside the thighs. Brace by lifting chest and stomach up. You can use a double overhand grip (lighter weight). Un-rack the weight, keep the spine extended and maintain a straight spine bringing the weight down. On the negative push the hips straight back and keep the shins vertical with a slight bend in the knees (pretend there is a wall in front of your knees). Only lower the bar until you cannot set the hips back any further without rounding the back (usually to just below knee level / upper shin). Plates should not touch the floor on an RDL. Alternatively, you can use dumbbells.',
    videoUrl: 'https://www.youtube.com/shorts/up0sPrYCTkI',
    altVideoUrl: null,
    imageKey: 'dl',
  },
  {
    id: 'ex-shrug',
    day: 'pull',
    orderIndex: 1,
    name: 'Barbell Shrug',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Upper trapezius.'],
    synMuscles: ['Levator scapulae.'],
    stabMuscles: ['Forearms / grip, core.'],
    formText:
      'Use a wide grip. Lean slightly forward (do NOT stand upright). Shrug upwards. Keep the elbows slightly bent, do NOT use the biceps.',
    noteText: '',
    videoUrl: 'https://www.youtube.com/shorts/n4ldvAoSZiY',
    altVideoUrl: null,
    imageKey: 'shrug',
  },
  {
    id: 'ex-row',
    day: 'pull',
    orderIndex: 2,
    name: 'Barbell Rows',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Lats, rhomboids, mid traps.'],
    synMuscles: ['Rear delts, biceps, spinal erectors.'],
    stabMuscles: ['Core, glutes, hamstrings.'],
    formText:
      'Pendlay Row: keep legs about shoulder width, barbell over midfoot, keep shins vertical, push hips back. Grab the bar with a double overhand grip, gripping slightly wider than shoulder width (grip width should allow the upper and lower arm to make a 90º angle at the top end of ROM). Pop the butt out (anteriorly rotate the pelvis). Pull the bar up with arms at about a 45º angle relative to the torso (over-tucking the elbows will focus more lats, flaring out the elbows will focus more upper traps). Bring the bar to nipple level and touch the bar to the chest while squeezing the shoulder blades at the top. Lower the bar slowly and protract the shoulder blades, allowing the weights to touch the ground again before the next rep.',
    noteText: '',
    videoUrl: 'https://youtu.be/axoeDmW0oAY?t=179',
    altVideoUrl: null,
    imageKey: 'row',
  },
  {
    id: 'ex-pullup',
    day: 'pull',
    orderIndex: 3,
    name: 'Weighted Pull-Up',
    incrementLb: 2.5,
    isBodyweight: true,
    mainMuscles: ['Latissimus dorsi.'],
    synMuscles: ['Teres major, biceps, brachialis, brachioradialis, mid / lower traps.'],
    stabMuscles: ['Rectus abdominis, forearms / grip.'],
    formText:
      'Grip 1.5x shoulder width. From a dead-hang position, depress the shoulder blades, raise the chest up, keep the elbows slightly forward and pull the elbows down and in (as close to your sides as possible). Get your chin over the bar and try to touch your chest to the bar. Keep the hips extended or the core engaged to prevent kipping.',
    noteText: '',
    videoUrl: 'https://www.youtube.com/shorts/ym1V5H35IpA',
    altVideoUrl: null,
    imageKey: 'pullup',
  },
  // ── LEGS ──
  {
    id: 'ex-squat',
    day: 'legs',
    orderIndex: 0,
    name: 'Back Squat',
    incrementLb: 10,
    isBodyweight: false,
    mainMuscles: ['Quads, glutes.'],
    synMuscles: ['Adductors, hamstrings.'],
    stabMuscles: ['Trunk / erectors, calves.'],
    formText:
      'Place the bar on the upper traps (high bar targets quads) or 2–3" down for low bar (targets more glutes and lower back). Take 2–3 steps back. Keep feet just outside shoulder width, slightly flared out toes. Squat down until the hips are about parallel (if you can). The barbell should travel down in a straight line centered over the middle of your foot.',
    noteText: '',
    videoUrl: 'https://www.youtube.com/shorts/PPmvh7gBTi0',
    altVideoUrl: null,
    imageKey: 'squat',
  },
  {
    id: 'ex-calf',
    day: 'legs',
    orderIndex: 1,
    name: 'Calf Raise',
    incrementLb: 5,
    isBodyweight: false,
    mainMuscles: ['Gastrocnemius, soleus.'],
    synMuscles: ['Plantaris.'],
    stabMuscles: ['Intrinsic foot / ankle stabilizers.'],
    formText: 'Full stretch at bottom; full squeeze at top; pause both ends; no bouncing.',
    noteText: '',
    videoUrl: '',
    altVideoUrl: null,
    imageKey: 'calf',
  },
  {
    id: 'ex-hlr',
    day: 'legs',
    orderIndex: 2,
    name: 'Hanging Leg Raise',
    incrementLb: 2.5,
    isBodyweight: true,
    mainMuscles: ['Lower rectus abdominis.'],
    synMuscles: ['Iliopsoas, rectus femoris, sartorius.'],
    stabMuscles: ['Obliques, grip, shoulder stabilizers.'],
    formText:
      'Curl your butt all the way under to round your spine into a C shape (if you keep your back straight you only work your hip flexors).',
    noteText: '',
    videoUrl: 'https://www.youtube.com/shorts/2n4UqRIJyk4',
    altVideoUrl: null,
    imageKey: 'hlr',
  },
  {
    id: 'ex-crunch',
    day: 'legs',
    orderIndex: 3,
    name: 'Crunch Burnout',
    incrementLb: 0,
    isBodyweight: true,
    mainMuscles: ['Rectus abdominis (upper emphasis).'],
    synMuscles: ['Obliques, transverse abdominis.'],
    stabMuscles: ['Core.'],
    formText:
      'One set straight through all four movements, 10 reps each, adding one rep every session.',
    noteText: '',
    videoUrl: 'https://www.instagram.com/reel/DU8ZkXrjnU3/',
    altVideoUrl: null,
    imageKey: 'crunch',
  },
]

export const SEED_BLOCKS: Block[] = BLOCKS.map((spec: BlockSpec) => ({
  id: `blk-${spec.exerciseKey}-${spec.blockKey}`,
  exerciseId: `ex-${spec.exerciseKey}`,
  exerciseKey: spec.exerciseKey,
  blockKey: spec.blockKey,
  orderIndex: spec.orderIndex,
  label: spec.label,
  targetSets: spec.sets,
  reps: spec.reps,
  load: spec.load,
  restSeconds: spec.restSeconds,
  restLabel: spec.restLabel,
  setNotes: spec.setNotes ?? [],
}))
