import { useState, useEffect, useCallback } from 'react'
import type { DbBlock, DbExercise, DbSession, DbSetLog } from '../../data/db'
import {
  getSetsForBlock,
  getPreviousSetsForBlock,
  logSet,
  deleteSet,
  getAllBlocks,
  getSetsForSession,
} from '../../data/repo'
import { suggestNext } from '../../domain/progression'
import { Stepper } from '../../ui/Stepper'
import { RestTimer } from './RestTimer'

interface BlockLoggerProps {
  block: DbBlock
  exercise: DbExercise
  session: DbSession
}

export function BlockLogger({ block, exercise, session }: BlockLoggerProps) {
  const [todaySets, setTodaySets] = useState<DbSetLog[]>([])
  const [weight, setWeight] = useState(0)
  const [reps, setReps] = useState(block.repLow)
  const [rir, setRir] = useState(2)
  const [suggestion, setSuggestion] = useState<{ message: string } | null>(null)
  const [showTimer, setShowTimer] = useState(false)
  const [logging, setLogging] = useState(false)

  const loadSets = useCallback(async () => {
    const [today, prev] = await Promise.all([
      getSetsForBlock(block.id, session.id),
      getPreviousSetsForBlock(block.id, session.id),
    ])
    setTodaySets(today)

    // Build suggestion
    let sourceBlockTodaySets: DbSetLog[] | null = null
    let sourceBlockPrevSets: DbSetLog[] | null = null

    if (block.deriveFromBlockId) {
      const allBlocks = await getAllBlocks()
      const sourceBlock = allBlocks.find(b => b.id === block.deriveFromBlockId)
      if (sourceBlock) {
        const allSessionSets = await getSetsForSession(session.id)
        sourceBlockTodaySets = allSessionSets.filter(s => s.blockId === block.deriveFromBlockId)
        sourceBlockPrevSets = await getPreviousSetsForBlock(block.deriveFromBlockId, session.id)
      }
    }

    const s = suggestNext(block, today, sourceBlockTodaySets, prev, sourceBlockPrevSets, exercise.incrementLb)
    setSuggestion(s)
    if (today.length === 0) {
      setWeight(s.weightLb)
      setReps(s.reps)
    }
  }, [block, session.id])

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

  const targetLabel = block.repHigh
    ? `${block.repLow}–${block.repHigh} reps`
    : `${block.repLow}+ reps (AMRAP)`

  return (
    <div className="bg-slate-800 rounded-2xl px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-medium text-sm">{block.label}</p>
          <p className="text-xs text-slate-400">
            {block.targetSets} sets · {targetLabel} · {block.restSeconds}s rest
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {todaySets.length}/{block.targetSets}
        </span>
      </div>

      {suggestion && (
        <p className="text-xs text-blue-300 mb-3 bg-blue-900/30 rounded-xl px-3 py-2">
          {suggestion.message}
        </p>
      )}

      {/* Logged sets */}
      {todaySets.length > 0 && (
        <div className="mb-3 flex flex-col gap-1">
          {todaySets.map((s, i) => (
            <div key={s.id} className="flex items-center justify-between text-sm bg-slate-700/60 rounded-lg px-3 py-2">
              <span className="text-slate-400 text-xs">#{i + 1}</span>
              <span className="font-semibold">{s.weightLb} lb × {s.reps}</span>
              <span className="text-slate-400 text-xs">RIR {s.rir}</span>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-red-400 text-xs ml-2 min-h-[44px] px-2"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex flex-col gap-3">
        <Stepper label="Weight" value={weight} onChange={setWeight} step={exercise.incrementLb} min={0} />
        <Stepper label="Reps" value={reps} onChange={setReps} min={1} max={100} />
        <Stepper label="RIR" value={rir} onChange={setRir} min={0} max={10} />
      </div>

      <button
        onClick={handleLog}
        disabled={logging}
        className="mt-4 w-full bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-base min-h-[56px]"
      >
        Log Set
      </button>

      {showTimer && (
        <RestTimer
          seconds={block.restSeconds}
          onDone={() => setShowTimer(false)}
        />
      )}
    </div>
  )
}
