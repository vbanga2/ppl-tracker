// Open Food Facts barcode API utility
// Data is ODbL licensed — always show attribution on screens displaying this data.

const USER_AGENT = 'PPLTracker/1.0 (personal-fitness-pwa; github.com/vbanga2/ppl-tracker)'
const BARCODE_URL = (code: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,quantity,serving_size,nutriments`

interface OFFNutriments {
  'energy-kcal_100g'?: number
  'energy-kcal_serving'?: number
  'proteins_100g'?: number
  'proteins_serving'?: number
  'carbohydrates_100g'?: number
  'carbohydrates_serving'?: number
  'fat_100g'?: number
  'fat_serving'?: number
  'fiber_100g'?: number
  'fiber_serving'?: number
  'sugars_100g'?: number
  'sugars_serving'?: number
  'sodium_100g'?: number
  'sodium_serving'?: number
  'saturated-fat_100g'?: number
  'saturated-fat_serving'?: number
}

interface OFFProduct {
  code?: string
  product_name?: string
  brands?: string
  quantity?: string
  serving_size?: string
  nutriments?: OFFNutriments
}

/** Parsed representation returned to callers. All macro fields are null when the record lacks them. */
export interface OFFParsed {
  barcode: string
  name: string
  brand: string | null
  servingDesc: string | null    // null = product has no serving info; user must provide grams
  servingGrams: number | null
  missingServing: boolean
  kcal: number | null
  proteinG: number | null
  carbG: number | null
  fatG: number | null
  fiberG: number | null
  sugarG: number | null
  sodiumMg: number | null
  satFatG: number | null
}

/** Look up a barcode on Open Food Facts. Returns null if not found, throws on network/server error. */
export async function lookupBarcode(barcode: string): Promise<OFFParsed | null> {
  const res = await fetch(BARCODE_URL(barcode), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(12000),
  })

  if (res.status === 404) return null
  if (!res.ok) throw new Error(`OFF returned ${res.status}`)

  const data = (await res.json()) as { status: number; product?: OFFProduct }
  if (data.status !== 1 || !data.product) return null

  return parseProduct(data.product, barcode)
}

function parseProduct(p: OFFProduct, barcode: string): OFFParsed {
  const n = p.nutriments ?? {}

  // Use per-serving values when the product has a serving size AND the serving kcal is present.
  const hasServing = !!(p.serving_size?.trim() && n['energy-kcal_serving'] !== undefined)

  function pick(per100: keyof OFFNutriments, perServing: keyof OFFNutriments): number | null {
    const v = hasServing ? (n[perServing] as number | undefined) : (n[per100] as number | undefined)
    return v !== undefined ? v : null
  }

  const sodiumRaw = pick('sodium_100g', 'sodium_serving')  // OFF stores sodium in g, not mg

  return {
    barcode,
    name: p.product_name?.trim() || 'Unknown product',
    brand: p.brands ? p.brands.split(',')[0].trim() || null : null,
    servingDesc: p.serving_size?.trim() || null,
    servingGrams: !p.serving_size ? 100 : null,
    missingServing: !p.serving_size,
    kcal: round1(pick('energy-kcal_100g', 'energy-kcal_serving')),
    proteinG: round1(pick('proteins_100g', 'proteins_serving')),
    carbG: round1(pick('carbohydrates_100g', 'carbohydrates_serving')),
    fatG: round1(pick('fat_100g', 'fat_serving')),
    fiberG: round1(pick('fiber_100g', 'fiber_serving')),
    sugarG: round1(pick('sugars_100g', 'sugars_serving')),
    sodiumMg: sodiumRaw !== null ? Math.round(sodiumRaw * 1000) : null,
    satFatG: round1(pick('saturated-fat_100g', 'saturated-fat_serving')),
  }
}

function round1(v: number | null): number | null {
  return v !== null ? Math.round(v * 10) / 10 : null
}

/** Returns a warning string if kcal deviates >20% from macro sum. Null if values are fine or incomplete. */
export function kcalSanityWarning(
  kcal: number | null,
  protein: number | null,
  carb: number | null,
  fat: number | null,
): string | null {
  if (kcal === null || protein === null || carb === null || fat === null) return null
  const calc = 4 * protein + 4 * carb + 9 * fat
  if (calc === 0) return null
  if (Math.abs(kcal - calc) / calc > 0.2) {
    return `Stated kcal (${kcal}) differs by more than 20% from 4×${protein}g P + 4×${carb}g C + 9×${fat}g F = ${Math.round(calc)} kcal. Check the values.`
  }
  return null
}
