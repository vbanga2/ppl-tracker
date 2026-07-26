import { useState, useEffect } from 'react'
import type { DbExercise, DbBlock, DbSession } from '../../data/db'
import { getExercisesByDay, getBlocksByExercise } from '../../data/repo'
import { ExerciseCard } from './ExerciseCard'
import { PALETTE } from '../../ui/tokens'

interface ExerciseListProps {
  session: DbSession
}

interface ExerciseWithBlocks {
  exercise: DbExercise
  blocks: DbBlock[]
}

export function ExerciseList({ session }: ExerciseListProps) {
  const [items, setItems] = useState<ExerciseWithBlocks[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const exercises = await getExercisesByDay(session.day)
      const withBlocks = await Promise.all(
        exercises.map(async exercise => ({
          exercise,
          blocks: await getBlocksByExercise(exercise.id),
        })),
      )
      setItems(withBlocks)
      setLoading(false)
    }
    load()
  }, [session.day])

  if (loading) {
    return (
      <div className="px-4 py-8 text-center" style={{ color: PALETTE.mute }}>
        Loading exercises…
      </div>
    )
  }

  return (
    <div>
      {items.map(({ exercise, blocks }, index) => (
        <ExerciseCard
          key={exercise.id}
          exercise={exercise}
          blocks={blocks}
          session={session}
          index={index}
        />
      ))}
    </div>
  )
}
