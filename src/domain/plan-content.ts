/**
 * PPL plan card content — extracted from the owner's PPL_Workout_plan.pdf.
 *
 * Video URLs are the ACTUAL hyperlinks embedded in the owner's PDF, recovered from
 * the file's link annotations. Do not substitute, "improve", or search for
 * replacements. If a field is null, the owner's plan has no link for it.
 *
 * `imageKey` maps to /src/assets/exercises/<imageKey>.png (shipped alongside this file).
 *
 * Order within each day is the owner's deliberate training order. Preserve it.
 */

export interface ExerciseContent {
  key: string
  day: 'push' | 'pull' | 'legs'
  orderIndex: number
  name: string
  imageKey: string
  videoUrl: string | null
  altVideoUrl?: string | null
  mainMuscles: string
  synMuscles: string
  stabMuscles: string
  formText: string
  noteText?: string
}

export const EXERCISE_CONTENT: ExerciseContent[] = [
  // ---------------- PUSH ----------------
  {
    key: 'ohp', day: 'push', orderIndex: 0,
    name: 'Seated Military Press',
    imageKey: 'ohp',
    videoUrl: 'https://www.youtube.com/shorts/k6tzKisR3NY',
    mainMuscles: 'Anterior deltoid, triceps brachii.',
    synMuscles: 'Lateral deltoid, upper chest.',
    stabMuscles: 'Rotator cuff, core, upper back.',
    formText:
      'Grab the barbell slightly outside shoulder width, elbows slightly forward in line with your wrists. Bring the bar down to touch the chest and push through your feet for stability. A slight back arch is okay — if it gets too drastic, lower the weight.',
  },
  {
    key: 'bench', day: 'push', orderIndex: 1,
    name: 'Flat Bench Press',
    imageKey: 'bench',
    videoUrl: 'https://www.youtube.com/shorts/hWbUlkb5Ms4',
    mainMuscles: 'Pectoralis major (mid / sternal).',
    synMuscles: 'Triceps brachii, anterior deltoid.',
    stabMuscles: 'Rotator cuff, serratus anterior, scapular retractors.',
    formText:
      'Tuck the shoulder blades in; back arch is okay. Plant feet, glutes, upper back and head. Grip 1.5x shoulder width (wider targets chest, narrower targets triceps). Squeeze the bar hard and un-rack. Point elbows slightly in at roughly a 45º angle on the negative. Move the bar down and slightly forward to touch the chest. Press slightly back and then up while pushing your feet into the floor — bringing the bar back early in the concentric puts less stress on the anterior delts and more on the pecs.',
  },
  {
    key: 'incline', day: 'push', orderIndex: 2,
    name: 'Incline Bench Press',
    imageKey: 'incline',
    videoUrl: 'https://www.youtube.com/shorts/98HWfiRonkE',
    mainMuscles: 'Clavicular / upper, mid and lower pectoralis major.',
    synMuscles: 'Anterior deltoid, triceps brachii.',
    stabMuscles: 'Rotator cuff, serratus anterior, scapular retractors.',
    formText:
      'Set the bench at 30–45º. Retract the shoulders. Grip slightly wider than shoulder width and un-rack. Do NOT flare the elbows (risk of shoulder injury) — tuck them 30–60º from the torso. Bring the bar to the lower chest, not the upper chest. Push the bar up and slightly back while pushing your feet into the floor.',
    noteText:
      'Incline bench press leads to the same lower and mid-pec growth as flat bench, plus BETTER upper pec growth. Consider switching the order of bench press periodically to do inclines before flat, and add a strength set to it (load: 0.8 x flat bench power).',
  },
  {
    key: 'cgbp', day: 'push', orderIndex: 3,
    name: 'Close-Grip Bench Press',
    imageKey: 'cgbp',
    videoUrl: 'https://www.youtube.com/shorts/xXd7sddHGa0',
    mainMuscles: 'Triceps brachii.',
    synMuscles: 'Pectoralis major, anterior deltoid.',
    stabMuscles: 'Rotator cuff, wrists / forearms.',
    formText:
      'Grip just inside shoulder width. Retract the shoulders. Keep a slight back arch. Elbows tucked 30–45º, do NOT flare the elbows. Lower the bar to the lower chest.',
  },
  {
    key: 'sidefly', day: 'push', orderIndex: 4,
    name: "Arnold's Side & Rear Delt Fly",
    imageKey: 'sidefly',
    videoUrl: 'https://www.youtube.com/shorts/U5wTk6laXB4',
    mainMuscles: 'Posterior deltoid, lateral deltoid.',
    synMuscles: 'Infraspinatus, teres minor, middle / lower traps, rhomboids.',
    stabMuscles: 'Core, scapular stabilizers.',
    formText:
      'Lie on your side, bend your knees. Start with the arm hanging towards the floor, slight bend in the elbow. Lift the dumbbell up to the ceiling, pause, and slowly lower it down.',
  },
  {
    key: 'reardelt', day: 'push', orderIndex: 5,
    name: 'Bent-Over DB Rear Delt Fly',
    imageKey: 'reardelt',
    videoUrl: 'https://www.youtube.com/shorts/vzQmQN3hpYY',
    altVideoUrl: 'https://www.youtube.com/shorts/LsT-bR_zxLo',
    mainMuscles: 'Posterior deltoid, lateral deltoid.',
    synMuscles: 'Infraspinatus, teres minor, middle / lower traps, rhomboids.',
    stabMuscles: 'Core, scapular stabilizers.',
    formText:
      'Rest your chest on an incline bench, slightly round the upper back (protract shoulders). Pull the dumbbells out and away from you — do NOT pull the dumbbells back, and keep the traps relaxed. Keep tension by going up until the arms are flat with the torso (not beyond), stopping before the arms are perpendicular to the ground.',
  },
  {
    key: 'dips', day: 'push', orderIndex: 6,
    name: 'Weighted Dips',
    imageKey: 'dips',
    videoUrl: 'https://youtu.be/bD8z4Jyax90',
    mainMuscles: 'Lower chest, triceps brachii.',
    synMuscles: 'Anterior deltoid.',
    stabMuscles: 'Scapular depressors, core.',
    formText:
      'Grip just outside shoulder width. Extend elbows and bend knees. Slightly retract and depress the shoulders. Lean the torso slightly forward (NOT too far forward, but also not upright). Slowly lower the torso until the elbows are slightly past a 90º angle. Without pausing at the bottom, drive down into the handles and go back up, keeping the torso in the same position — do NOT kip. At the top of the range ensure the shoulders are still retracted and the back is still extended (do NOT round your back).',
    noteText:
      'Dips hit the ENTIRE pec to a significant degree. They activate upper chest even more than incline bench press. Arguably the GOAT chest exercise.',
  },

  // ---------------- PULL ----------------
  {
    key: 'dl', day: 'pull', orderIndex: 0,
    name: 'Deadlifts (Conventional & Romanian)',
    imageKey: 'dl',
    videoUrl: 'https://www.youtube.com/shorts/up0sPrYCTkI',
    mainMuscles: 'Glutes, hamstrings, spinal erectors.',
    synMuscles: 'Traps, lats, adductors.',
    stabMuscles: 'Core, forearms / grip.',
    formText:
      'Keep feet at hip width. Shins 1" from the bar. The bar should cross the middle of the foot. Point toes slightly out. Set hips back with nearly straight knees (do NOT squat down to grab the bar). Grip the bar just outside the shins using an over/under grip to prevent slippage. Let the shins make contact with the bar. Pull the bar up while keeping the chest up and thrusting the hips forward. Stand up straight and lock out the hips. Lower the weight by sending the hips back and letting the knees bend.',
    noteText:
      'RDLs: shoulder width grip just outside the thighs. Brace by lifting chest and stomach up. You can use a double overhand grip (lighter weight). Un-rack the weight, keep the spine extended and maintain a straight spine bringing the weight down. On the negative push the hips straight back and keep the shins vertical with a slight bend in the knees (pretend there is a wall in front of your knees). Only lower the bar until you cannot set the hips back any further without rounding the back (usually to just below knee level / upper shin). Plates should not touch the floor on an RDL. Alternatively, you can use dumbbells.',
  },
  {
    key: 'shrug', day: 'pull', orderIndex: 1,
    name: 'Barbell Shrug',
    imageKey: 'shrug',
    videoUrl: 'https://www.youtube.com/shorts/n4ldvAoSZiY',
    mainMuscles: 'Upper trapezius.',
    synMuscles: 'Levator scapulae.',
    stabMuscles: 'Forearms / grip, core.',
    formText:
      'Use a wide grip. Lean slightly forward (do NOT stand upright). Shrug upwards. Keep the elbows slightly bent, do NOT use the biceps.',
  },
  {
    key: 'row', day: 'pull', orderIndex: 2,
    name: 'Barbell Rows',
    imageKey: 'row',
    videoUrl: 'https://youtu.be/axoeDmW0oAY?t=179',
    mainMuscles: 'Lats, rhomboids, mid traps.',
    synMuscles: 'Rear delts, biceps, spinal erectors.',
    stabMuscles: 'Core, glutes, hamstrings.',
    formText:
      'Pendlay Row: keep legs about shoulder width, barbell over midfoot, keep shins vertical, push hips back. Grab the bar with a double overhand grip, gripping slightly wider than shoulder width (grip width should allow the upper and lower arm to make a 90º angle at the top end of ROM). Pop the butt out (anteriorly rotate the pelvis). Pull the bar up with arms at about a 45º angle relative to the torso (over-tucking the elbows will focus more lats, flaring out the elbows will focus more upper traps). Bring the bar to nipple level and touch the bar to the chest while squeezing the shoulder blades at the top. Lower the bar slowly and protract the shoulder blades, allowing the weights to touch the ground again before the next rep.',
  },
  {
    key: 'pullup', day: 'pull', orderIndex: 3,
    name: 'Weighted Pull-Up',
    imageKey: 'pullup',
    videoUrl: 'https://www.youtube.com/shorts/ym1V5H35IpA',
    mainMuscles: 'Latissimus dorsi.',
    synMuscles: 'Teres major, biceps, brachialis, brachioradialis, mid / lower traps.',
    stabMuscles: 'Rectus abdominis, forearms / grip.',
    formText:
      'Grip 1.5x shoulder width. From a dead-hang position, depress the shoulder blades, raise the chest up, keep the elbows slightly forward and pull the elbows down and in (as close to your sides as possible). Get your chin over the bar and try to touch your chest to the bar. Keep the hips extended or the core engaged to prevent kipping.',
  },

  // ---------------- LEGS ----------------
  {
    key: 'squat', day: 'legs', orderIndex: 0,
    name: 'Back Squat',
    imageKey: 'squat',
    videoUrl: 'https://www.youtube.com/shorts/PPmvh7gBTi0',
    mainMuscles: 'Quads, glutes.',
    synMuscles: 'Adductors, hamstrings.',
    stabMuscles: 'Trunk / erectors, calves.',
    formText:
      'Place the bar on the upper traps (high bar targets quads) or 2–3" down for low bar (targets more glutes and lower back). Take 2–3 steps back. Keep feet just outside shoulder width, slightly flared out toes. Squat down until the hips are about parallel (if you can). The barbell should travel down in a straight line centered over the middle of your foot.',
  },
  {
    key: 'calf', day: 'legs', orderIndex: 1,
    name: 'Calf Raise',
    imageKey: 'calf',
    videoUrl: null,
    mainMuscles: 'Gastrocnemius, soleus.',
    synMuscles: 'Plantaris.',
    stabMuscles: 'Intrinsic foot / ankle stabilizers.',
    formText:
      'Full stretch at bottom; full squeeze at top; pause both ends; no bouncing.',
  },
  {
    key: 'hlr', day: 'legs', orderIndex: 2,
    name: 'Hanging Leg Raise',
    imageKey: 'hlr',
    videoUrl: 'https://www.youtube.com/shorts/2n4UqRIJyk4',
    mainMuscles: 'Lower rectus abdominis.',
    synMuscles: 'Iliopsoas, rectus femoris, sartorius.',
    stabMuscles: 'Obliques, grip, shoulder stabilizers.',
    formText:
      'Curl your butt all the way under to round your spine into a C shape (if you keep your back straight you only work your hip flexors).',
  },
  {
    key: 'crunch', day: 'legs', orderIndex: 3,
    name: 'Crunch Burnout',
    imageKey: 'crunch',
    videoUrl: 'https://www.instagram.com/reel/DU8ZkXrjnU3/',
    mainMuscles: 'Rectus abdominis (upper emphasis).',
    synMuscles: 'Obliques, transverse abdominis.',
    stabMuscles: 'Core.',
    formText:
      'One set straight through all four movements, 10 reps each, adding one rep every session.',
  },
]
