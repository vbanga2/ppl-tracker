export function round(value: number, increment: number): number {
  return Math.round(value / increment) * increment
}

export function lbToKg(lb: number): number {
  return lb * 0.453592
}

export function kgToLb(kg: number): number {
  return kg * 2.20462
}
