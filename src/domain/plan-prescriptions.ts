/**
 * PPL plan PRESCRIPTIONS — extracted verbatim from the owner's PPL_Workout_plan.pdf.
 *
 * This file is the single source of truth for sets, reps, rest and load derivation.
 * It was missing from the earlier `plan-content.ts` handoff, which is why the seeded
 * prescriptions drifted from the owner's plan. Replace the seed blocks with these.
 *
 * DO NOT adjust these values for "reasonableness". They are the owner's own programming.
 * The `pdfText` field on each block is the literal string printed in his plan — a test
 * asserts the seeded block renders back to it.
 */

export type RepSpec =
  | { kind: 'range'; low: number; high: number }   // e.g. 3 - 6
  | { kind: 'fixed'; reps: number }                // e.g. 3 x 5
  | { kind: 'failure' }                            // "3 x F"  — to failure, NO rep floor
  | { kind: 'minToFailure'; low: number };         // "3 x 8 - F" — at least 8, then to failure

export type LoadSpec =
  | { kind: 'increment'; lb: number }               // "+5 lb when maxxed"
  | { kind: 'heavy' }                               // "LOAD heavy"
  | { kind: 'bodyweight' }                          // "Body - Weight"
  | { kind: 'derived'; fromBlock: string; mult: number } // "LOAD 0.8 x power"
  | { kind: 'repProgression'; repsPerSession: number };  // "+1 rep each session"

export interface BlockSpec {
  exerciseKey: string;
  blockKey: string;
  label: string;            // display label — owner's vocabulary only
  orderIndex: number;
  sets: number;
  reps: RepSpec;
  load: LoadSpec;
  restSeconds: number;      // lower bound of the printed range
  restLabel: string;        // printed range, e.g. "2 – 3 min"
  setNotes?: string[];
  pdfText: string;          // literal line from the plan, for the conformance test
}

export const BLOCKS: BlockSpec[] = [
  // ================= PUSH =================
  { exerciseKey: 'ohp', blockKey: 'power', label: 'Power', orderIndex: 0,
    sets: 3, reps: { kind: 'range', low: 3, high: 6 },
    load: { kind: 'increment', lb: 5 }, restSeconds: 120, restLabel: '2 – 3 min',
    pdfText: 'Power  SETS 3 x 3 - 6  + 5 lb when maxxed  REST 2 – 3 min' },
  { exerciseKey: 'ohp', blockKey: 'hypertrophy', label: 'Hypertrophy', orderIndex: 1,
    sets: 3, reps: { kind: 'failure' },
    load: { kind: 'derived', fromBlock: 'ohp.power', mult: 0.8 },
    restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Hyper  SETS 3 x F  LOAD 0.8 x power  REST 1 – 2 min' },

  { exerciseKey: 'bench', blockKey: 'power', label: 'Power', orderIndex: 0,
    sets: 3, reps: { kind: 'range', low: 3, high: 6 },
    load: { kind: 'increment', lb: 5 }, restSeconds: 120, restLabel: '2 – 3 min',
    pdfText: 'Power  SETS 3 x 3 - 6  + 5 lb when maxxed  REST 2 – 3 min' },
  { exerciseKey: 'bench', blockKey: 'hypertrophy', label: 'Hypertrophy', orderIndex: 1,
    sets: 3, reps: { kind: 'failure' },
    load: { kind: 'derived', fromBlock: 'bench.power', mult: 0.8 },
    restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Hyper  SETS 3 x F  LOAD 0.8 x power  REST 1 – 2 min' },

  { exerciseKey: 'incline', blockKey: 'hypertrophy', label: 'Hypertrophy', orderIndex: 0,
    sets: 3, reps: { kind: 'failure' },
    load: { kind: 'derived', fromBlock: 'bench.power', mult: 0.65 },
    restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Hyper  SETS 3 x F  LOAD 0.65 x FB power  REST 1 – 2 min' },

  { exerciseKey: 'cgbp', blockKey: 'hypertrophy', label: 'Hypertrophy', orderIndex: 0,
    sets: 3, reps: { kind: 'range', low: 8, high: 12 },
    load: { kind: 'increment', lb: 5 }, restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Hyper  SETS 3 x 8-12  + 5 lb when maxxed  REST 1 – 2 min' },

  // Delt flies: the plan prints ONE prescription covering BOTH exercises 5 and 6.
  { exerciseKey: 'sidefly', blockKey: 'power', label: 'Power set', orderIndex: 0,
    sets: 3, reps: { kind: 'fixed', reps: 5 },
    load: { kind: 'increment', lb: 2.5 }, restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Both  Power Set 3 x 5 → Hypertrophy Drop - Set 3 x 10  + 2.5 lb  REST 1 – 2 min' },
  { exerciseKey: 'sidefly', blockKey: 'drop', label: 'Hypertrophy drop-set', orderIndex: 1,
    sets: 3, reps: { kind: 'fixed', reps: 10 },
    load: { kind: 'increment', lb: 2.5 }, restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Both  Power Set 3 x 5 → Hypertrophy Drop - Set 3 x 10  + 2.5 lb  REST 1 – 2 min' },
  { exerciseKey: 'reardelt', blockKey: 'power', label: 'Power set', orderIndex: 0,
    sets: 3, reps: { kind: 'fixed', reps: 5 },
    load: { kind: 'increment', lb: 2.5 }, restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Both  Power Set 3 x 5 → Hypertrophy Drop - Set 3 x 10  + 2.5 lb  REST 1 – 2 min' },
  { exerciseKey: 'reardelt', blockKey: 'drop', label: 'Hypertrophy drop-set', orderIndex: 1,
    sets: 3, reps: { kind: 'fixed', reps: 10 },
    load: { kind: 'increment', lb: 2.5 }, restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Both  Power Set 3 x 5 → Hypertrophy Drop - Set 3 x 10  + 2.5 lb  REST 1 – 2 min' },

  { exerciseKey: 'dips', blockKey: 'power', label: 'Power', orderIndex: 0,
    sets: 3, reps: { kind: 'range', low: 5, high: 8 },
    load: { kind: 'increment', lb: 2.5 }, restSeconds: 120, restLabel: '2 – 3 min',
    pdfText: 'Power  SETS 3 x 5 - 8  + 2.5 lb when maxxed  REST 2 – 3 min' },
  { exerciseKey: 'dips', blockKey: 'hypertrophy', label: 'Hypertrophy', orderIndex: 1,
    sets: 3, reps: { kind: 'failure' },
    load: { kind: 'bodyweight' }, restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Hyper  SETS 3 x F  Body - Weight  REST 1 – 2 min' },

  // ================= PULL =================
  { exerciseKey: 'dl', blockKey: 'strength', label: 'Strength', orderIndex: 0,
    sets: 3, reps: { kind: 'range', low: 3, high: 5 },
    load: { kind: 'heavy' }, restSeconds: 120, restLabel: '2 – 3 min',
    pdfText: 'Strength  SETS 3 x 3 – 5  LOAD heavy  REST 2 – 3 min' },
  { exerciseKey: 'dl', blockKey: 'hypertrophy', label: 'Hypertrophy', orderIndex: 1,
    sets: 3, reps: { kind: 'minToFailure', low: 8 },
    load: { kind: 'derived', fromBlock: 'dl.strength', mult: 0.8 },
    restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Hyper  SETS 3 x 8 – F  LOAD 0.8 x strength  REST 1 – 2 min' },
  { exerciseKey: 'dl', blockKey: 'rdl', label: 'RDLs', orderIndex: 2,
    sets: 3, reps: { kind: 'minToFailure', low: 8 },
    load: { kind: 'derived', fromBlock: 'dl.hypertrophy', mult: 1 },
    restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'RDLs  SETS 3 x 8 – F  LOAD same for Hyper  REST 1 – 2 min  (Emphasizes glutes & hamstrings)' },

  { exerciseKey: 'shrug', blockKey: 'hypertrophy', label: 'Hypertrophy', orderIndex: 0,
    sets: 3, reps: { kind: 'minToFailure', low: 8 },
    load: { kind: 'derived', fromBlock: 'dl.strength', mult: 1 },
    restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Hyper  SETS 3 x 8 – F  LOAD same as Deadlift Power  REST 1 – 2 min' },

  { exerciseKey: 'row', blockKey: 'strength', label: 'Strength', orderIndex: 0,
    sets: 3, reps: { kind: 'range', low: 3, high: 5 },
    load: { kind: 'heavy' }, restSeconds: 120, restLabel: '2 – 3 min',
    pdfText: 'Strength  SETS 3 x 3 – 5  LOAD heavy  REST 2 – 3 min' },
  { exerciseKey: 'row', blockKey: 'hypertrophy', label: 'Hypertrophy', orderIndex: 1,
    sets: 3, reps: { kind: 'minToFailure', low: 8 },
    load: { kind: 'derived', fromBlock: 'row.strength', mult: 0.8 },
    restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Hyper  SETS 3 x 8 – F  LOAD 0.8 x strength  REST 1 – 2 min' },
  { exerciseKey: 'row', blockKey: 'highrow', label: 'High row', orderIndex: 2,
    sets: 3, reps: { kind: 'minToFailure', low: 8 },
    load: { kind: 'derived', fromBlock: 'row.hypertrophy', mult: 1 },
    restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'High Row  SETS 3 x 8 – F  LOAD same as Hyper  REST 1 – 2 min  (Emphasizes upper traps & rear delts)' },

  // Pull-up weighted: the plan prints wide-grip THEN reverse-grip, both 3 x 5 – 8.
  { exerciseKey: 'pullup', blockKey: 'weighted_wide', label: 'Weighted · wide grip', orderIndex: 0,
    sets: 3, reps: { kind: 'range', low: 5, high: 8 },
    load: { kind: 'increment', lb: 2.5 }, restSeconds: 120, restLabel: '2 – 3 min',
    pdfText: 'Weighted  Wide – Grip: 3 x 5 – 8 → Reverse Grip: 3 x 5 – 8  +2.5 lb when maxed  REST 2 – 3 min' },
  { exerciseKey: 'pullup', blockKey: 'weighted_reverse', label: 'Weighted · reverse grip', orderIndex: 1,
    sets: 3, reps: { kind: 'range', low: 5, high: 8 },
    load: { kind: 'increment', lb: 2.5 }, restSeconds: 120, restLabel: '2 – 3 min',
    pdfText: 'Weighted  Wide – Grip: 3 x 5 – 8 → Reverse Grip: 3 x 5 – 8  +2.5 lb when maxed  REST 2 – 3 min' },
  { exerciseKey: 'pullup', blockKey: 'bodyweight', label: 'Bodyweight', orderIndex: 2,
    sets: 3, reps: { kind: 'failure' },
    load: { kind: 'bodyweight' }, restSeconds: 60, restLabel: '1 – 2 min',
    setNotes: ['Wide grip', 'Neutral grip', 'Reverse grip'],
    pdfText: 'Bodyweight  SETS 3 x F  REST 1 – 2 min  1 Set Wide – Grip, 1 Neutral, 1 Reverse' },

  // ================= LEGS =================
  { exerciseKey: 'squat', blockKey: 'power', label: 'Power', orderIndex: 0,
    sets: 3, reps: { kind: 'range', low: 3, high: 5 },
    load: { kind: 'heavy' }, restSeconds: 120, restLabel: '2 – 3 min',
    pdfText: 'Power  SETS 3 x 3 – 5  LOAD heavy  REST 2 – 3 min' },
  { exerciseKey: 'squat', blockKey: 'hypertrophy', label: 'Hypertrophy', orderIndex: 1,
    sets: 3, reps: { kind: 'minToFailure', low: 8 },
    load: { kind: 'derived', fromBlock: 'squat.power', mult: 0.8 },
    restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Hyper  SETS 3 x 8 – F  LOAD 0.8 x strength  REST 1 – 2 min' },

  { exerciseKey: 'calf', blockKey: 'hypertrophy', label: 'Hypertrophy', orderIndex: 0,
    sets: 3, reps: { kind: 'range', low: 8, high: 12 },
    load: { kind: 'heavy' }, restSeconds: 60, restLabel: '1 – 2 min',
    setNotes: ['Toes inward', 'Toes straight', 'Toes outward'],
    pdfText: 'Hyper  SETS 3 x 8 – 12  LOAD heavy  REST 1 – 2 min  1 Set Toes Inward, 1 Toes Straight, 1 Toes Outward' },

  { exerciseKey: 'hlr', blockKey: 'work', label: 'Work', orderIndex: 0,
    sets: 3, reps: { kind: 'range', low: 8, high: 15 },
    load: { kind: 'increment', lb: 2.5 }, restSeconds: 60, restLabel: '1 – 2 min',
    pdfText: 'Work  SETS 3 x 8 – 15  + 2.5 lbs  REST 1 – 2 min' },

  { exerciseKey: 'crunch', blockKey: 'burnout', label: 'Burnout', orderIndex: 0,
    sets: 4, reps: { kind: 'fixed', reps: 10 },
    load: { kind: 'repProgression', repsPerSession: 1 }, restSeconds: 60, restLabel: '—',
    setNotes: [
      'Weighted ab crunches · upper abs',
      'Side-to-side wall touches · obliques',
      'Alt elbow-to-knee · V-line',
      'Both elbows-to-knees · upper abs',
    ],
    pdfText: '1 Set  + 1 rep each session  (4 movements x10 each)' },
];

/**
 * Cardio, from the day footers.
 */
export const CARDIO = {
  push: { kind: 'optional' as const, pdfText: 'CARDIO  Optional' },
  pull: {
    kind: 'sprints' as const,
    distanceM: 100, jogBackM: 100, startSets: 4, incrementPerSession: 1, capSets: 10,
    restSeconds: 120, restLabel: '2 – 3 min',
    pdfText: 'CARDIO  Sprint 100 m · Jog back 100 m · Start at 4 Sets each · + 1 set every session (cap is 10 sets each) · rest 2 – 3 min',
  },
  legs: { kind: 'treadmill' as const, minutes: 60, pdfText: 'CARDIO  Treadmill 1 hr' },
};

/**
 * OPEN QUESTION for the owner — do not guess.
 *
 * Blocks marked `{ kind: 'heavy' }` (deadlift strength, barbell row strength, back squat
 * power, calf raise) print "LOAD heavy" with no increment in the plan. Page 5 says only:
 * "Power sets — add load only after all sets reach the top rep target with clean form."
 *
 * The app therefore needs an increment for these that the plan does not state. Make it a
 * per-exercise setting the owner can edit, seeded with these placeholders and clearly
 * labelled as editable defaults rather than plan values:
 *   deadlift 10 lb · barbell row 5 lb · back squat 10 lb · calf raise 5 lb
 */
export const HEAVY_BLOCK_DEFAULT_INCREMENTS: Record<string, number> = {
  dl: 10,
  row: 5,
  squat: 10,
  calf: 5,
};
