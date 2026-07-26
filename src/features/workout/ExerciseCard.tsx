import { useState } from 'react'
import type { DbExercise, DbBlock, DbSession } from '../../data/db'
import { BlockLogger } from './BlockLogger'

interface ExerciseCardProps {
  exercise: DbExercise
  blocks: DbBlock[]
  session: DbSession
}

export function ExerciseCard({ exercise, blocks, session }: ExerciseCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="px-4 py-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start justify-between gap-3 text-left min-h-[44px]"
      >
        <div>
          <h3 className="font-semibold text-base">{exercise.name}</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {exercise.mainMuscles.join(', ')}
          </p>
        </div>
        <span className="text-slate-400 text-xl mt-0.5">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-4">
          {exercise.formText && (
            <p className="text-xs text-slate-400 mb-4 leading-relaxed bg-slate-800 rounded-xl px-3 py-2">
              {exercise.formText}
            </p>
          )}
          <div className="flex flex-col gap-6">
            {blocks.map(block => (
              <BlockLogger
                key={block.id}
                block={block}
                exercise={exercise}
                session={session}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
