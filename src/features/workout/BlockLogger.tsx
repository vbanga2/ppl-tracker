import { useState, useEffect, useRef, useMemo } from 'react'
import type { DbBlock, DbExercise, DbSession, DbSetLog } from '../../data/db'
import type { PlateInventory } from '../../domain/plates'
import { logSet, deleteSet } from '../../data/repo'
import { suggestNext } from '../../domain/progression'
import { formatRepSpec } from '../../domain/plan'
import { calculatePlates, formatPlates } from '../../domain/plates'
import { Stepper } from '../../ui/Stepper'
import { RestTimer } from './RestTimer'
import { PALETTE, blockColors, dayAccent } from '../../ui/tokens'

export interface BlockLoggerProps {
  block: DbBlock
  exercise: DbExercise
  session: DbSession
  /** Full block list — used to resolve derived-load source blocks in memory */
  allBlocks: DbBlock[]
  /** Today's logged sets keyed by blockId, pre-loaded by ExerciseCard */
  todayByBlock: Map<string, DbSetLog[]>
  /** Previous-session sets keyed by blockId, pre-loaded by ExerciseCard */
  prevSetsByBlock: Map<string, DbSetLog[]>
  inventory: PlateInventory[]
  /** Called after a set is logged or deleted so ExerciseCard can refresh */
  onSetChanged: () => Promise<void>
}

function PlateDisplay({ weight, inventory }: { weight: number; inventory: PlateInventory[] }) {
  if (weight <= 0) return null
  const { perSide, achievable, nearestBelow } = calculatePlates(weight, inventory)
  if (!achievable) {
    return (
      <p className="text-xs mt-1" style={{ color: PALETTE.mute }}>
        Can't load {weight} lb — nearest: {nearestBelow} lb ({formatPlates(perSide)} per side)
      </p>
    )
  }
  return (
    <p className="text-xs mt-1" style={{ color: PALETTE.dim }}>
      {formatPlates(perSide)} per side
    </p>
  )
}

export function BlockLogger({
  block,
  exercise,
  session,
  allBlocks,
  todayByBlock,
  prevSetsByBlock,
  inventory,
  onSetChanged,
}: BlockLoggerProps) {
  const [weight, setWeight] = useState(0)
  const [reps, setReps] = useState(1)
  const [rir, setRir] = useState(2)
  const [showTimer, setShowTimer] = useState(false)
  const [logging, setLogging] = useState(false)

  // Flipped true on first user keystroke; prevents suggestion from overwriting input.
  // Reset to false only after a set is successfully logged or when the block changes.
  const touchedRef = useRef(false)

  const todaySets = todayByBlock.get(block.id) ?? []
  const todaySetsCount = todaySets.length

  // All suggestion logic runs in memory — no DB reads.
  const suggestion = useMemo(() => {
    const today = todayByBlock.get(block.id) ?? []
    const prev = prevSetsByBlock.get(block.id) ?? []

    let srcTodaySets: DbSetLog[] | null = null
    let srcPrevSets: DbSetLog[] | null = null

    if (block.load.kind === 'derived') {
      const [exKey, blkKey] = block.load.fromBlock.split('.')
      const src = allBlocks.find(b => b.exerciseKey === exKey && b.blockKey === blkKey)
      if (src) {
        srcTodaySets = todayByBlock.get(src.id) ?? null
        srcPrevSets = prevSetsByBlock.get(src.id) ?? null
      }
    }

    return suggestNext(block, today, srcTodaySets, prev, srcPrevSets, exercise.incrementLb)
  }, [block, exercise.incrementLb, allBlocks, todayByBlock, prevSetsByBlock])

  // Reset touched when switching blocks
  useEffect(() => {
    touchedRef.current = false
  }, [block.id])

  // Initialize weight/reps from suggestion — only before the user edits and only when no sets are logged yet
  useEffect(() => {
    if (touchedRef.current) return
    if (todaySetsCount > 0) return
    setWeight(suggestion.weightLb)
    setReps(suggestion.reps)
  }, [suggestion, todaySetsCount])

  function handleWeightChange(v: number) {
    touchedRef.current = true
    setWeight(v)
  }

  function handleRepsChange(v: number) {
    touchedRef.current = true
    setReps(v)
  }

  async function handleLog() {
    if (logging) return
    setLogging(true)
    try {
      await logSet({
        id: crypto.randomUUID(),
        sessionId: session.id,
        blockId: block.id,
        setIndex: todaySets.length,
        weightLb: weight,
        reps,
        rir,
        loggedAt: Date.now(),
      })
      touchedRef.current = false
      await onSetChanged()
      setShowTimer(true)
    } catch (err) {
      alert(`Failed to save set: ${err}`)
    } finally {
      setLogging(false)
    }
  }

  async function handleDelete(setId: string) {
    await deleteSet(setId)
    await onSetChanged()
  }

  const colors = blockColors(block.label)
  const accent = dayAccent(exercise.day)
  const done = todaySets.length
  const target = block.targetSets
  const prevSets = prevSetsByBlock.get(block.id) ?? []

  return (
    <div
      className="rounded-2xl px-4 py-4"
      style={{ background: PALETTE.panel, borderLeft: `3px solid ${colors.border}` }}
    >
      {/* Block header */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-md shrink-0"
            style={{ background: colors.pillBg, color: colors.pillText }}
          >
            {block.label}
          </span>
          <p className="text-xs truncate" style={{ color: PALETTE.dim }}>
            {target} × {formatRepSpec(block.reps)} · {block.restLabel}
          </p>
        </div>
        <span
          className="text-xs shrink-0 tabular-nums"
          style={{ color: done >= target ? accent : PALETTE.mute, fontVariantNumeric: 'tabular-nums' }}
        >
          {done}/{target}
        </span>
      </div>

      {/* Previous session reference */}
      {prevSets.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {prevSets.map((s, i) => (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded"
              style={{ fontVariantNumeric: 'tabular-nums', background: PALETTE.line, color: PALETTE.mute }}
            >
              {s.weightLb} × {s.reps}
            </span>
          ))}
          <span className="text-xs self-center" style={{ color: PALETTE.mute }}>
            last session
          </span>
        </div>
      )}

      {/* Suggestion */}
      <p
        className="text-xs mb-3 rounded-xl px-3 py-2"
        style={{ color: colors.pillText || PALETTE.dim, background: colors.pillBg }}
      >
        {suggestion.message}
      </p>

      {/* Today's logged sets */}
      {todaySets.length > 0 && (
        <div className="mb-3 flex flex-col gap-1">
          {todaySets.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: PALETTE.line }}
            >
              <span className="text-xs" style={{ color: PALETTE.mute }}>
                #{i + 1}
              </span>
              <span
                className="font-medium text-sm"
                style={{ color: PALETTE.fg, fontVariantNumeric: 'tabular-nums' }}
              >
                {s.weightLb} lb × {s.reps}
              </span>
              <span className="text-xs" style={{ color: PALETTE.mute }}>
                RIR {s.rir}
              </span>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-xs ml-2 px-2"
                style={{ minHeight: 44, color: '#e05252' }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input controls */}
      <div className="flex flex-col gap-3">
        <div>
          <Stepper label="Weight" value={weight} onChange={handleWeightChange} step={exercise.incrementLb} min={0} />
          {exercise.incrementLb > 0 && <PlateDisplay weight={weight} inventory={inventory} />}
        </div>
        <Stepper label="Reps" value={reps} onChange={handleRepsChange} min={1} max={100} />
        <Stepper label="RIR" value={rir} onChange={setRir} min={0} max={10} />
      </div>

      {/* Log button */}
      <button
        onClick={handleLog}
        disabled={logging}
        className="mt-4 w-full text-white font-medium rounded-2xl text-base disabled:opacity-50"
        style={{
          minHeight: 50,
          paddingTop: 14,
          paddingBottom: 14,
          background: accent,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {exercise.isBodyweight
          ? `Log set ${done + 1} · ${reps} reps`
          : `Log set ${done + 1} · ${weight} lb × ${reps}`}
      </button>

      {showTimer && (
        <RestTimer seconds={block.restSeconds} color={accent} onDone={() => setShowTimer(false)} />
      )}
    </div>
  )
}
