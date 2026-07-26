import { useState } from 'react'
import type { DbExercise, DbBlock, DbSession } from '../../data/db'
import { BlockLogger } from './BlockLogger'
import { EXERCISE_IMAGES } from '../../assets/exercises/index'

interface ExerciseCardProps {
  exercise: DbExercise
  blocks: DbBlock[]
  session: DbSession
}

function videoLabel(url: string): string {
  if (url.includes('instagram.com')) return 'Watch form'
  return 'Watch form'
}

export function ExerciseCard({ exercise, blocks, session }: ExerciseCardProps) {
  const [expanded, setExpanded] = useState(false)
  const imageUrl = EXERCISE_IMAGES[exercise.imageKey]

  return (
    <div className="px-4 py-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-3 text-left min-h-[44px]"
      >
        <div className="flex items-center gap-3 min-w-0">
          {imageUrl && (
            <div className="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-white flex items-center justify-center">
              <img
                src={imageUrl}
                alt=""
                aria-hidden
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-base leading-tight">{exercise.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {exercise.mainMuscles.join(', ')}
            </p>
          </div>
        </div>
        <span className="text-slate-400 text-xl shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Illustration */}
          {imageUrl && (
            <div className="rounded-xl overflow-hidden bg-white">
              <img
                src={imageUrl}
                alt={exercise.name}
                className="w-full object-contain max-h-56"
              />
            </div>
          )}

          {/* Prescription blocks */}
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

          {/* Video buttons */}
          {exercise.videoUrl && (
            <div className="flex flex-col gap-2">
              <a
                href={exercise.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white text-sm font-medium py-3 rounded-xl min-h-[44px]"
              >
                {videoLabel(exercise.videoUrl)}
              </a>
              {exercise.altVideoUrl && (
                <a
                  href={exercise.altVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center bg-slate-700/60 hover:bg-slate-700 active:bg-slate-800 text-slate-300 text-sm font-medium py-3 rounded-xl min-h-[44px]"
                >
                  Alternative
                </a>
              )}
            </div>
          )}

          {/* Note callout */}
          {exercise.noteText && (
            <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl px-3 py-3">
              <p className="text-xs text-amber-300 leading-relaxed">{exercise.noteText}</p>
            </div>
          )}

          {/* Target muscles */}
          <div className="bg-slate-800 rounded-xl px-3 py-3 flex flex-col gap-1.5">
            <div className="flex gap-2 text-xs">
              <span className="text-slate-500 w-10 shrink-0">Main</span>
              <span className="text-slate-300">{exercise.mainMuscles.join(', ')}</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="text-slate-500 w-10 shrink-0">Syn</span>
              <span className="text-slate-300">{exercise.synMuscles.join(', ')}</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="text-slate-500 w-10 shrink-0">Stab</span>
              <span className="text-slate-300">{exercise.stabMuscles.join(', ')}</span>
            </div>
          </div>

          {/* Form cues */}
          {exercise.formText && (
            <p className="text-xs text-slate-400 leading-relaxed bg-slate-800 rounded-xl px-3 py-3">
              {exercise.formText}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
