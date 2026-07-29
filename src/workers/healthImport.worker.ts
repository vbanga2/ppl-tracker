/// <reference lib="webworker" />
import { Unzip, UnzipInflate } from 'fflate'

// ─── Message types ────────────────────────────────────────────────────────────

interface StartMsg { type: 'start'; file: File }

interface ProgressMsg { type: 'progress'; pct: number; phase: string }

interface SampleRow {
  type: string
  startAt: number
  endAt: number
  value: number
  unit: string
  source: string
}

interface WorkoutRow {
  workoutType: string
  startAt: number
  endAt: number
  durationMin: number
  distanceMi: number | null
  kcal: number | null
  source: string
}

interface BodyMetricRow {
  date: string
  weightLb: number | null
  bodyFatPct: number | null
  source: string
}

interface ParseResult {
  samples: SampleRow[]
  workouts: WorkoutRow[]
  bodyMetrics: BodyMetricRow[]
}

interface DoneMsg { type: 'done'; result: ParseResult }
interface ErrorMsg { type: 'error'; message: string }

type OutMsg = ProgressMsg | DoneMsg | ErrorMsg

// ─── Aggregation state ────────────────────────────────────────────────────────

const dailySteps = new Map<string, number>()
const dailyEnergy = new Map<string, number>()
const dailySleep = new Map<string, number>()
const dailyRestHR = new Map<string, { sum: number; count: number }>()
const dailyHRV = new Map<string, { sum: number; count: number }>()
const dailyLBM = new Map<string, { valueLb: number; source: string }>()
const dailyWeight = new Map<string, { weightLb: number; source: string }>()
const dailyFat = new Map<string, { pct: number; source: string }>()
const workouts: WorkoutRow[] = []

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractAttrs(tag: string): Record<string, string> {
  const result: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tag)) !== null) {
    result[m[1]] = m[2]
  }
  return result
}

function parseDateMs(s: string): number {
  // "2024-01-15 08:30:00 -0500" → ISO 8601 with colon in offset
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/)
  if (m) return new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`).getTime()
  return new Date(s).getTime()
}

// ─── Record handlers ──────────────────────────────────────────────────────────

function handleRecord(attrs: Record<string, string>): void {
  const { type, startDate, endDate, value, unit, sourceName } = attrs
  if (!type || !startDate || value === undefined) return

  const date = startDate.slice(0, 10)
  const src = sourceName ?? 'apple_health'
  const numVal = parseFloat(value)
  if (isNaN(numVal)) return

  if (type === 'HKQuantityTypeIdentifierStepCount') {
    dailySteps.set(date, (dailySteps.get(date) ?? 0) + numVal)
    return
  }

  if (type === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
    dailyEnergy.set(date, (dailyEnergy.get(date) ?? 0) + numVal)
    return
  }

  if (type === 'HKQuantityTypeIdentifierRestingHeartRate') {
    const cur = dailyRestHR.get(date) ?? { sum: 0, count: 0 }
    dailyRestHR.set(date, { sum: cur.sum + numVal, count: cur.count + 1 })
    return
  }

  if (type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') {
    const cur = dailyHRV.get(date) ?? { sum: 0, count: 0 }
    dailyHRV.set(date, { sum: cur.sum + numVal, count: cur.count + 1 })
    return
  }

  if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
    if (!value.includes('Asleep') || !endDate) return
    const durationMin = (parseDateMs(endDate) - parseDateMs(startDate)) / 60000
    if (durationMin <= 0) return
    dailySleep.set(date, (dailySleep.get(date) ?? 0) + durationMin)
    return
  }

  if (type === 'HKQuantityTypeIdentifierBodyMass') {
    let weightLb = numVal
    if (unit === 'kg') weightLb = numVal * 2.20462
    dailyWeight.set(date, { weightLb, source: src })
    return
  }

  if (type === 'HKQuantityTypeIdentifierBodyFatPercentage') {
    // Apple exports as decimal (0.15 = 15%)
    const pct = numVal <= 1 ? numVal * 100 : numVal
    dailyFat.set(date, { pct, source: src })
    return
  }

  if (type === 'HKQuantityTypeIdentifierLeanBodyMass') {
    let valueLb = numVal
    if (unit === 'kg') valueLb = numVal * 2.20462
    dailyLBM.set(date, { valueLb, source: src })
    return
  }
}

function handleWorkout(attrs: Record<string, string>): void {
  const {
    workoutActivityType, duration, durationUnit,
    totalDistance, totalDistanceUnit,
    totalEnergyBurned, startDate, endDate, sourceName,
  } = attrs
  if (!workoutActivityType || !startDate) return

  const startAt = parseDateMs(startDate)
  const endAt = endDate ? parseDateMs(endDate) : startAt

  let durationMin = parseFloat(duration ?? '0')
  if (isNaN(durationMin)) durationMin = 0
  if (durationUnit === 's' || durationUnit === 'sec') durationMin /= 60
  else if (durationUnit === 'hr') durationMin *= 60
  // default assumed min

  let distanceMi: number | null = null
  if (totalDistance) {
    const d = parseFloat(totalDistance)
    if (!isNaN(d)) {
      distanceMi = totalDistanceUnit === 'km' ? d * 0.621371 : d
    }
  }

  let kcal: number | null = null
  if (totalEnergyBurned) {
    const e = parseFloat(totalEnergyBurned)
    if (!isNaN(e)) kcal = e
  }

  workouts.push({
    workoutType: workoutActivityType,
    startAt,
    endAt,
    durationMin,
    distanceMi,
    kcal,
    source: sourceName ?? 'apple_health',
  })
}

function processLine(line: string): void {
  const trimmed = line.trimStart()
  if (trimmed.startsWith('<Record ')) {
    handleRecord(extractAttrs(trimmed))
  } else if (trimmed.startsWith('<Workout ')) {
    handleWorkout(extractAttrs(trimmed))
  }
}

function buildResult(): ParseResult {
  const samples: SampleRow[] = []

  for (const [date, total] of dailySteps) {
    const startAt = new Date(date + 'T00:00:00').getTime()
    samples.push({ type: 'HKQuantityTypeIdentifierStepCount', startAt, endAt: startAt + 86400000, value: Math.round(total), unit: 'count', source: 'apple_health' })
  }

  for (const [date, total] of dailyEnergy) {
    const startAt = new Date(date + 'T00:00:00').getTime()
    samples.push({ type: 'HKQuantityTypeIdentifierActiveEnergyBurned', startAt, endAt: startAt + 86400000, value: Math.round(total), unit: 'kcal', source: 'apple_health' })
  }

  for (const [date, totalMin] of dailySleep) {
    const startAt = new Date(date + 'T00:00:00').getTime()
    samples.push({ type: 'HKCategoryTypeIdentifierSleepAnalysis', startAt, endAt: startAt + 86400000, value: Math.round(totalMin), unit: 'min', source: 'apple_health' })
  }

  for (const [date, { sum, count }] of dailyRestHR) {
    const startAt = new Date(date + 'T00:00:00').getTime()
    samples.push({ type: 'HKQuantityTypeIdentifierRestingHeartRate', startAt, endAt: startAt + 86400000, value: Math.round(sum / count), unit: 'count/min', source: 'apple_health' })
  }

  for (const [date, { sum, count }] of dailyHRV) {
    const startAt = new Date(date + 'T00:00:00').getTime()
    samples.push({ type: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', startAt, endAt: startAt + 86400000, value: Math.round((sum / count) * 10) / 10, unit: 'ms', source: 'apple_health' })
  }

  for (const [date, { valueLb, source }] of dailyLBM) {
    const startAt = new Date(date + 'T00:00:00').getTime()
    samples.push({ type: 'HKQuantityTypeIdentifierLeanBodyMass', startAt, endAt: startAt + 86400000, value: Math.round(valueLb * 10) / 10, unit: 'lb', source })
  }

  const allDates = new Set([...dailyWeight.keys(), ...dailyFat.keys()])
  const bodyMetrics: BodyMetricRow[] = []
  for (const date of allDates) {
    const weight = dailyWeight.get(date)
    const fat = dailyFat.get(date)
    if (!weight && !fat) continue
    bodyMetrics.push({
      date,
      weightLb: weight ? Math.round(weight.weightLb * 10) / 10 : null,
      bodyFatPct: fat ? Math.round(fat.pct * 10) / 10 : null,
      source: weight?.source ?? fat?.source ?? 'apple_health',
    })
  }

  return { samples, workouts, bodyMetrics }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<StartMsg>) => {
  if (e.data.type !== 'start') return

  const { file } = e.data

  const send = (msg: OutMsg) => self.postMessage(msg)

  try {
    const tdec = new TextDecoder()
    let lineBuffer = ''
    let foundXml = false

    const unzip = new Unzip((uzFile) => {
      const name = uzFile.name.replace(/\\/g, '/')
      if (name.endsWith('export.xml')) {
        foundXml = true
        uzFile.ondata = (_err, data, final) => {
          lineBuffer += tdec.decode(data, { stream: !final })
          const nl = lineBuffer.lastIndexOf('\n')
          if (nl >= 0) {
            const complete = lineBuffer.slice(0, nl)
            lineBuffer = lineBuffer.slice(nl + 1)
            for (const line of complete.split('\n')) processLine(line)
          }
          if (final && lineBuffer) {
            processLine(lineBuffer)
            lineBuffer = ''
          }
        }
        uzFile.start()
      }
      // Other files: don't call start(), fflate skips them
    })
    unzip.register(UnzipInflate)

    const CHUNK = 1024 * 1024 // 1MB
    const total = file.size
    let offset = 0
    let lastPct = -1

    while (offset < total) {
      const end = Math.min(offset + CHUNK, total)
      const buf = await file.slice(offset, end).arrayBuffer()
      offset = end
      const isLast = offset >= total
      unzip.push(new Uint8Array(buf), isLast)

      const pct = Math.floor((offset / total) * 100)
      if (pct !== lastPct) {
        lastPct = pct
        send({ type: 'progress', pct, phase: 'parsing' })
      }
    }

    if (!foundXml) {
      send({ type: 'error', message: 'No export.xml found in the ZIP. Make sure you export from Health app → profile → Export All Health Data.' })
      return
    }

    send({ type: 'done', result: buildResult() })
  } catch (err) {
    send({ type: 'error', message: String(err) })
  }
}
