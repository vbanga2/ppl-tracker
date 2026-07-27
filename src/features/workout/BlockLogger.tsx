import { useState, useEffect, useCallback } from 'react'
import type { DbBlock, DbExercise, DbSession, DbSetLog } from '../../data/db'
import {
  getSetsForBlock,
  getPreviousSetsForBlock,
  logSet,
  deleteSet,
  getAllBlocks,
  getSetsForSession,
  getPlateInventory,
} from '../../data/repo'
import { suggestNext } from '../../domain/progression'
import { formatRepSpec } from '../../domain/plan'
import { calculatePlates, formatPlates } from '../../domain/plates'
import type { PlateInventory } from '../../domain/plates'
import { Stepper } from '../../ui/Stepper'
import { RestTimer } from './RestTimer'
import { PALETTE, blockColors, dayAccent } from '../../ui/tokens'

interface BlockLoggerProps {
  block: DbBlock
  exercise: DbExercise
  session: DbSession
  onProgressUpdate?: (blockId: string, count: number) => void
}

function PlateDisplay({
  weight,
  inventory,
}: {
  weight: number
  inventory: PlateInventory[]
}) {
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

export function BlockLogger({ block, exercise, session, onProgressUpdate }: BlockLoggerProps) {
  const [todaySets, setTodaySets] = useState<DbSetLog[]>([])
  const [prevSets, setPrevSets] = useState<DbSetLog[]>([])
  const [weight, setWeight] = useState(0)
  const [reps, setReps] = useState(1)
  const [rir, setRir] = useState(2)
  const [suggestion, setSuggestion] = useState<{ message: string } | null>(null)
  const [showTimer, setShowTimer] = useState(false)
  const [logging, setLogging] = useState(false)
  const [inventory, setInventory] = useState<PlateInventory[]>([])

  useEffect(() => {
    getPlateInventory().then(setInventory)
  }, [])

  const loadSets = useCallback(async () => {
    const [today, prev] = await Promise.all([
      getSetsForBlock(block.id, session.id),
      getPreviousSetsForBlock(block.id, session.id),
    ])
    setTodaySets(today)
    setPrevSets(prev)
    onProgressUpdate?.(block.id, today.length)

    let sourceBlockTodaySets: DbSetLog[] | null = null
    let sourceBlockPrevSets: DbSetLog[] | null = null

    if (block.load.kind === 'derived') {
      const [fromExKey, fromBlkKey] = block.load.fromBlock.split('.')
      const allBlocks = await getAllBlocks()
      const sourceBlock = allBlocks.find(b => b.exerciseKey === fromExKey && b.blockKey === fromBlkKey)
      if (sourceBlock) {
        const allSessionSets = await getSetsForSession(session.id)
        sourceBlockTodaySets = allSessionSets.filter(s => s.blockId === sourceBlock.id)
        sourceBlockPrevSets = await getPreviousSetsForBlock(sourceBlock.id, session.id)
      }
    }

    const s = suggestNext(block, today, sourceBlockTodaySets, prev, sourceBlockPrevSets, exercise.incrementLb)
    setSuggestion(s)
    if (today.length === 0) {
      setWeight(s.weightLb)
      setReps(s.reps)
    }
  }, [block, session.id, exercise.incrementLb, onProgressUpdate])

  useEffect(() => {
    loadSets()
  }, [loadSets])

  async function handleLog() {
    if (logging) return
    setLogging(true)
    try {
      const set: Omit<DbSetLog, 'updatedAt' | 'deletedAt'> = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        blockId: block.id,
        setIndex: todaySets.length,
        weightLb: weight,
        reps,
        rir,
        loggedAt: Date.now(),
      }
      await logSet(set)
      await loadSets()
      setShowTimer(true)
    } catch (err) {
      alert(`Failed to save set: ${err}`)
    } finally {
      setLogging(false)
    }
  }

  async function handleDelete(setId: string) {
    await deleteSet(setId)
    await loadSets()
  }

  const colors = blockColors(block.label)
  const accent = dayAccent(exercise.day)
  const done = todaySets.length
  const target = block.targetSets

  return (
    <div
      className="rounded-2xl px-4 py-4"
      style={{
        background: PALETTE.panel,
        borderLeft: `3px solid ${colors.border}`,
      }}
    >
      {/* Block header — label pill + prescription */}
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
              style={{
                fontVariantNumeric: 'tabular-nums',
                background: PALETTE.line,
                color: PALETTE.mute,
              }}
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
      {suggestion && (
        <p
          className="text-xs mb-3 rounded-xl px-3 py-2"
          style={{ color: colors.pillText || PALETTE.dim, background: colors.pillBg }}
        >
          {suggestion.message}
        </p>
      )}

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
          <Stepper label="Weight" value={weight} onChange={setWeight} step={exercise.incrementLb} min={0} />
          {exercise.incrementLb > 0 && (
            <PlateDisplay weight={weight} inventory={inventory} />
          )}
        </div>
        <Stepper label="Reps" value={reps} onChange={setReps} min={1} max={100} />
        <Stepper label="RIR" value={rir} onChange={setRir} min={0} max={10} />
      </div>

      {/* Log button — states the full action */}
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
        <RestTimer
          seconds={block.restSeconds}
          color={accent}
          onDone={() => setShowTimer(false)}
        />
      )}
    </div>
  )
}
