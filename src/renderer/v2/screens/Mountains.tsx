import type { GoalView } from '@shared/types'
import { useData } from '../../hooks/useData'
import { currentMilestone, dayMonth, monthYear } from '../../lib/khatwa'
import { useShell } from '../../khatwa/nav'
import { ContourMountain } from '../Contour'

function MountainCard({ goal, onOpen }: { goal: GoalView; onOpen: () => void }) {
  const live = goal.milestones.filter((m) => !m.dropped)
  const done = live.filter((m) => m.done).length
  const next = currentMilestone(goal)
  return (
    <button className="k2-mountain-card" onClick={onOpen}>
      <ContourMountain seed={goal.id} title={goal.title} waypoints={live.map((m) => ({ title: m.title, done: m.done }))} compact />
      <span className="min-w-0">
        <span className="block text-[19px] font-[650] leading-tight tracking-[-0.01em] [text-wrap:balance]">{goal.title}</span>
        <span className="k2-small block mt-1">
          {goal.status === 'achieved'
            ? 'Summit reached'
            : goal.status === 'abandoned'
              ? 'Paused'
              : next
                ? `Next: ${next.title}${next.date ? `, ${dayMonth(next.date)}` : ''}`
                : goal.targetDate
                  ? `Summit by ${monthYear(goal.targetDate)}`
                  : 'No milestones yet'}
        </span>
        {live.length > 0 ? (
          <>
            <span className="k2-meter block" aria-hidden="true">
              <span style={{ width: `${(done / live.length) * 100}%` }} />
            </span>
            <span className="k2-small block mt-1.5">
              {done} of {live.length} milestones
            </span>
          </>
        ) : null}
      </span>
    </button>
  )
}

export default function Mountains() {
  const shell = useShell()
  const { data: goals, error, refetch } = useData<GoalView[]>(() => window.api.goals.list(), [])
  const { data: draft } = useData(() => window.api.goals.draft(), [])

  if (error) {
    return (
      <div className="k2-page">
        <p className="k2-alert">{error}</p>
        <button className="k2-btn is-quiet mt-4" onClick={refetch}>
          Try again
        </button>
      </div>
    )
  }
  if (!goals) return <div className="k2-page" aria-busy="true" />

  const active = goals.filter((g) => g.status === 'active')
  const closed = goals.filter((g) => g.status !== 'active')

  return (
    <div className="k2-page is-wide">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="k2-title">Mountains</h1>
          <p className="k2-lede">The big goals you are climbing, one milestone at a time.</p>
        </div>
        <div className="flex gap-3">
          {draft ? (
            <button className="k2-btn is-quiet" onClick={() => shell.navigate({ name: 'expedition', resume: true })}>
              Continue draft
            </button>
          ) : null}
          <button className="k2-btn" onClick={() => shell.navigate({ name: 'expedition' })}>
            New mountain
          </button>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="k2-sheet k2-empty mt-8">
          <p className="k2-h2">No mountain yet</p>
          <p className="m-0">Name a goal, and the planner maps the milestones, weekly habits and resources to get there.</p>
          <button className="k2-btn mt-5" onClick={() => shell.navigate({ name: 'expedition' })}>
            Plan your first mountain
          </button>
        </div>
      ) : (
        <div className="grid gap-5 mt-8 min-[980px]:grid-cols-2">
          {active.map((g) => (
            <MountainCard key={g.id} goal={g} onOpen={() => shell.navigate({ name: 'mountain', id: g.id })} />
          ))}
        </div>
      )}

      {closed.length > 0 ? (
        <section className="k2-section">
          <h2 className="k2-h2 mb-4">Reached and paused</h2>
          <div className="grid gap-5 min-[980px]:grid-cols-2">
            {closed.map((g) => (
              <MountainCard key={g.id} goal={g} onOpen={() => shell.navigate({ name: 'mountain', id: g.id })} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
