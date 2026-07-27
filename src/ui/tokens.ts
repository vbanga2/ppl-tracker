import type { Day } from '../domain/plan'

export const PALETTE = {
  // Day identity — sampled from owner's PPL_Workout_plan.pdf
  push: '#3264d8',
  pull: '#0f7c72',
  legs: '#b40d42',

  // Muscle role badges
  mainBg: '#fde2e2',
  mainText: '#4b1528',
  synBg: '#fff0cc',
  synText: '#412402',
  stabBg: '#ddf4ea',
  stabText: '#04342c',

  // Prescription block semantics
  powerBg: '#dbe7ff',
  powerBorder: '#3264d8',
  powerText: '#1a3a7a',
  hyperBg: '#d9f2df',
  hyperBorder: '#1d8a42',
  hyperText: '#1a5e2e',

  // App surfaces
  ink: '#0f1216',
  panel: '#161b22',
  line: '#232a32',
  fg: '#e8ecf1',
  dim: '#b9c2cc',
  mute: '#7b8794',
  plate: '#ffffff',

  // Personal record
  pr: '#f5c518',

  // Cardio — purple, matches plan PDF bar; used regardless of day type
  cardioPillBg: '#efe7ff',
  cardioPillText: '#4c2ac7',
  cardioBorder: '#8b5cf6',
} as const

export function dayAccent(day: Day): string {
  return PALETTE[day]
}

export function blockColors(label: string): {
  border: string
  pillBg: string
  pillText: string
} {
  const l = label.toLowerCase()
  if (l === 'power' || l === 'strength') {
    return { border: PALETTE.powerBorder, pillBg: PALETTE.powerBg, pillText: PALETTE.powerText }
  }
  if (l === 'hypertrophy') {
    return { border: PALETTE.hyperBorder, pillBg: PALETTE.hyperBg, pillText: PALETTE.hyperText }
  }
  return { border: PALETTE.line, pillBg: PALETTE.line, pillText: PALETTE.dim }
}
