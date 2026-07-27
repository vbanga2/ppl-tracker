import { useState, useEffect, useMemo, useCallback } from 'react'
import type { DbExercise, DbBlock, DbSession, DbSetLog } from '../../data/db'
import type { PlateInventory } from '../../domain/plates'
import {
  getAllBlocks,
  getSetsForSession,
  getPreviousSetsForBlock,
  getPlateInventory,
} from '../../data/repo'
import { formatRepSpec } from '../../domain/plan'
import { BlockLogger } from './BlockLogger'
import { EXERCISE_IMAGES } from '../../assets/exercises/index'
import { PALETTE, dayAccent } from '../../ui/tokens'

export interface SessionData {
  allBlocks: DbBlock[]
  todayByBlock: Map<string, DbSetLog[]>
  prevSetsByBlock: Map<string, DbSetLog[]>
  inventory: PlateInventory[]
}

interface ExerciseCardProps {
  exercise: DbExercise
  blocks: DbBlock[]
  session: DbSession
  index: number
}

interface MuscleBadgeProps {
  role: string
  muscles: string[]
  bg: string
  text: string
}

function MuscleBadge({ role, muscles, bg, text }: MuscleBadgeProps) {
  return (
    <div className="flex gap-2 items-start">
      <span
        className="shrink-0 rounded px-1.5 py-0.5 font-medium"
        style={{ fontSize: 11, background: bg, color: text }}
      >
        {role}
      </span>
      <span className="text-xs leading-snug" style={{ color: PALETTE.dim }}>
        {muscles.join(', ')}
      </span>
    </div>
  )
}

export function ExerciseCard({ exercise, blocks, session, index }: ExerciseCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [blockSetCounts, setBlockSetCounts] = useState<Map<string, number>>(new Map())
  const [lastTop, setLastTop] = useState<{ lb: number; reps: number } | null>(null)
  const [sessionData, setSessionData] = useState<SessionData | null>(null)

  const imageUrl = EXERCISE_IMAGES[exercise.imageKey]
  const accent = dayAccent(exercise.day)

  const blockIds = useMemo(() => new Set(blocks.map(b => b.id)), [blocks])
  const totalTarget = blocks.reduce((s, b) => s + b.targetSets, 0)
  const totalDone = [...blockSetCounts.values()].reduce((s, n) => s + n, 0)

  // Initial set-count load for the collapsed progress badge
  useEffect(() => {
    getSetsForSession(session.id).then(all => {
      const m = new Map<string, number>()
      for (const s of all) {
        if (blockIds.has(s.blockId)) m.set(s.blockId, (m.get(s.blockId) ?? 0) + 1)
      }
      setBlockSetCounts(m)
    })
  }, [session.id, blockIds])

  // Last-top load for the collapsed preview row
  useEffect(() => {
    if (blocks.length === 0) return
    Promise.all(blocks.map(b => getPreviousSetsForBlock(b.id, session.id))).then(results => {
      const all = results.flat()
      if (all.length === 0) return
      const top = all.reduce((best, s) => (s.weightLb > best.weightLb ? s : best))
      if (top.weightLb > 0) setLastTop({ lb: top.weightLb, reps: top.reps })
    })
  }, [blocks, session.id])

  /**
   * Single IndexedDB read for all data the expanded card needs.
   * Called once on expand and after every set log/delete.
   */
  const loadSessionData = useCallback(async () => {
    const [allBlocks, allSessionSets, inventory] = await Promise.all([
      getAllBlocks(),
      getSetsForSession(session.id),
      getPlateInventory(),
    ])

    const todayByBlock = new Map<string, DbSetLog[]>()
    for (const set of allSessionSets) {
      const arr = todayByBlock.get(set.blockId) ?? []
      arr.push(set)
      todayByBlock.set(set.blockId, arr)
    }

    // Collect block IDs we need prev sets for: own blocks + derived source blocks
    const prevBlockIds = new Set<string>(blocks.map(b => b.id))
    for (const block of blocks) {
      if (block.load.kind === 'derived') {
        const [exKey, blkKey] = block.load.fromBlock.split('.')
        const src = allBlocks.find(b => b.exerciseKey === exKey && b.blockKey === blkKey)
        if (src) prevBlockIds.add(src.id)
      }
    }

    const prevEntries = await Promise.all(
      [...prevBlockIds].map(async id => {
        const prev = await getPreviousSetsForBlock(id, session.id)
        return [id, prev] as [string, DbSetLog[]]
      }),
    )
    const prevSetsByBlock = new Map(prevEntries)

    // Keep the collapsed-view count badge in sync
    const newCounts = new Map<string, number>()
    for (const block of blocks) {
      newCounts.set(block.id, todayByBlock.get(block.id)?.length ?? 0)
    }
    setBlockSetCounts(newCounts)

    setSessionData({ allBlocks, todayByBlock, prevSetsByBlock, inventory })
  }, [blocks, session.id])

  useEffect(() => {
    if (expanded) loadSessionData()
    else setSessionData(null)
  }, [expanded, loadSessionData])

  const handleSetChanged = useCallback((): Promise<void> => loadSessionData(), [loadSessionData])

  const firstBlock = blocks[0]
  const repRange = firstBlock ? formatRepSpec(firstBlock.reps) : ''

  return (
    <div className="border-b" style={{ borderColor: PALETTE.line }}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left"
        style={{ minHeight: 56 }}
      >
        {!expanded && (
          <div className="flex items-center gap-3 px-4 py-3">
            {imageUrl && (
              <div
                className="shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
                style={{ width: 40, height: 40, background: PALETTE.plate }}
              >
                <img src={imageUrl} alt="" aria-hidden className="w-full h-full object-contain" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm leading-tight" style={{ color: PALETTE.fg }}>
                {index + 1}. {exercise.name}
              </p>
              {firstBlock && (
                <p className="text-xs mt-0.5" style={{ color: PALETTE.dim }}>
                  {firstBlock.label} · {firstBlock.targetSets} × {repRange}
                  {lastTop && (
                    <span
                      className="ml-2"
                      style={{ color: PALETTE.mute, fontVariantNumeric: 'tabular-nums' }}
                    >
                      · last {lastTop.lb} lb × {lastTop.reps}
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {totalDone > 0 && (
                <span
                  className="text-xs"
                  style={{
                    color: totalDone >= totalTarget ? accent : PALETTE.mute,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {totalDone}/{totalTarget}
                </span>
              )}
              <span style={{ color: PALETTE.mute }}>›</span>
            </div>
          </div>
        )}

        {expanded && (
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: accent }}>
            <span
              className="text-sm font-medium shrink-0"
              style={{ color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}
            >
              {index + 1}
            </span>
            <h3 className="flex-1 font-medium text-base text-white leading-tight">
              {exercise.name}
            </h3>
            <span
              className="text-sm shrink-0 text-white"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {totalDone}/{totalTarget} sets
            </span>
          </div>
        )}
      </button>

      {expanded && (
        <div>
          {imageUrl && (
            <div className="flex items-center justify-center" style={{ background: PALETTE.plate }}>
              <img
                src={imageUrl}
                alt={exercise.name}
                className="w-full object-contain"
                style={{ maxHeight: 224 }}
              />
            </div>
          )}

          <div className="px-4 py-4 flex flex-col gap-4">
            {sessionData ? (
              blocks.map(block => (
                <BlockLogger
                  key={block.id}
                  block={block}
                  exercise={exercise}
                  session={session}
                  allBlocks={sessionData.allBlocks}
                  todayByBlock={sessionData.todayByBlock}
                  prevSetsByBlock={sessionData.prevSetsByBlock}
                  inventory={sessionData.inventory}
                  onSetChanged={handleSetChanged}
                />
              ))
            ) : (
              <div className="py-4 text-center" style={{ color: PALETTE.mute, fontSize: 14 }}>
                Loading…
              </div>
            )}
          </div>

          <div className="px-4 py-3 flex flex-col gap-2 border-t" style={{ borderColor: PALETTE.line }}>
            <MuscleBadge
              role="Main"
              muscles={exercise.mainMuscles}
              bg={PALETTE.mainBg}
              text={PALETTE.mainText}
            />
            <MuscleBadge
              role="Syn"
              muscles={exercise.synMuscles}
              bg={PALETTE.synBg}
              text={PALETTE.synText}
            />
            <MuscleBadge
              role="Stab"
              muscles={exercise.stabMuscles}
              bg={PALETTE.stabBg}
              text={PALETTE.stabText}
            />
          </div>

          <div
            className="px-4 pb-4 flex gap-2 border-t pt-3"
            style={{ borderColor: PALETTE.line }}
          >
            {exercise.videoUrl && (
              <a
                href={exercise.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center text-sm font-medium rounded-xl"
                style={{
                  minHeight: 44,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: PALETTE.line,
                  color: PALETTE.dim,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Watch form
              </a>
            )}
            {exercise.altVideoUrl && (
              <a
                href={exercise.altVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center text-sm font-medium rounded-xl"
                style={{
                  minHeight: 44,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: PALETTE.line,
                  color: PALETTE.mute,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Alt video
              </a>
            )}
            {exercise.formText && (
              <button
                onClick={() => setShowForm(f => !f)}
                className="flex-1 text-sm font-medium rounded-xl"
                style={{
                  minHeight: 44,
                  background: PALETTE.line,
                  color: showForm ? PALETTE.fg : PALETTE.dim,
                }}
              >
                {showForm ? 'Hide cues' : 'Form cues'}
              </button>
            )}
          </div>

          {showForm && exercise.formText && (
            <div className="px-4 pb-4">
              <p
                className="text-xs leading-relaxed rounded-xl px-3 py-3"
                style={{ background: PALETTE.line, color: PALETTE.dim }}
              >
                {exercise.formText}
              </p>
            </div>
          )}

          {exercise.noteText && (
            <div className="px-4 pb-4">
              <div
                className="rounded-xl px-3 py-3"
                style={{ background: 'rgba(255,176,70,0.1)', borderLeft: `3px solid #b85a00` }}
              >
                <p className="text-xs leading-relaxed" style={{ color: '#e8a855' }}>
                  {exercise.noteText}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
