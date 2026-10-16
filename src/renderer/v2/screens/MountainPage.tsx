import { useState } from 'react'
import { Check, ChevronLeft } from 'lucide-react'
import type { GoalResource, GoalView, LocalDate, RoadmapStage } from '@shared/types'
import { useData } from '../../hooks/useData'
import { dayMonth, monthYear, plural, today } from '../../lib/khatwa'
import { useShell } from '../../khatwa/nav'
import { ContourMountain } from '../Contour'

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Resource({ r }: { r: GoalResource }) {
  return (
    <li className="k2-resource">
      {r.url ? (
        <a href={r.url} target="_blank" rel="noopener noreferrer">
          {r.title}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <b className="font-semibold">{r.title}</b>
      )}
      <span>{[r.url ? host(r.url) : 'search for it', r.note].filter(Boolean).join(', ')}</span>
    </li>
  )
}

function stateOf(stage: RoadmapStage, now: LocalDate): 'done' | 'now' | 'ahead' {
  if (now > stage.endDate) return 'done'
  if (now >= stage.startDate) return 'now'
  return 'ahead'
}

function Roadmap({ stages }: { stages: RoadmapStage[] }) {
  const now = today()
  return (
    <ol className="k2-stages">
      {stages.map((s, i) => {
        const state = stateOf(s, now)
        return (
          <li key={i} className={`k2-stage is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="k2-stage-dot" aria-hidden="true">
              {state === 'done' ? <Check size={13} strokeWidth={3} /> : i + 1}
            </span>
            <div className="k2-stage-when">
              {dayMonth(s.startDate)} to {dayMonth(s.endDate)}
              {state === 'now' ? <b className="ml-2 text-[var(--k2-granite)] font-semibold">You are here</b> : null}
            </div>
            <h3>{s.title}</h3>
            {s.details ? <p>{s.details}</p> : null}
            {s.steps.length > 0 ? (
              <ol>
                {s.steps.map((step, j) => (
                  <li key={j}>{step}</li>
                ))}
              </ol>
            ) : null}
            {s.outcome ? (
              <div className="k2-done-when">
                <span className="k2-small block">Finished when</span>
                {s.outcome}
              </div>
            ) : null}
            {s.resources.length > 0 ? (
              <ul className="k2-resources">
                {s.resources.map((r, j) => (
                  <Resource key={j} r={r} />
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

export default function MountainPage({ id }: { id: number }) {
  const shell = useShell()
  const [busy, setBusy] = useState(false)
  const { data: goal, error, refetch } = useData<GoalView | null>(() => window.api.goals.get(id), [id])

  const run = async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await work()
    } catch (err) {
      shell.toast('error', 'That did not save', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <a
      className="k2-small inline-flex items-center gap-1 hover:text-[var(--k2-granite)]"
      href="/mountains"
      onClick={(e) => {
        e.preventDefault()
        shell.navigate({ name: 'mountains' })
      }}
    >
      <ChevronLeft size={16} /> Mountains
    </a>
  )

  if (error) {
    return (
      <div className="k2-page">
        {back}
        <p className="k2-alert mt-4">{error}</p>
        <button className="k2-btn is-quiet mt-4" onClick={refetch}>
          Try again
        </button>
      </div>
    )
  }
  if (goal === undefined || goal === null) {
    return (
      <div className="k2-page" aria-busy={goal === undefined}>
        {back}
        {goal === null ? <p className="k2-lede">This mountain no longer exists.</p> : null}
      </div>
    )
  }

  const live = goal.milestones.filter((m) => !m.dropped)
  const done = live.filter((m) => m.done).length
  const closed = goal.status !== 'active'

  return (
    <div className="k2-page is-wide">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4 mt-3">
        <div className="min-w-0">
          <h1 className="k2-title">{goal.title}</h1>
          <p className="k2-lede">
            {goal.status === 'achieved'
              ? 'Summit reached.'
              : goal.status === 'abandoned'
                ? 'Paused. Its habits are paused too.'
                : goal.targetDate
                  ? `Summit by ${monthYear(goal.targetDate)}${goal.daysToTarget !== null && goal.daysToTarget >= 0 ? `, ${plural(goal.daysToTarget, 'day')} to go` : ''}.`
                  : 'No target date.'}
          </p>
        </div>
        {closed ? (
          <button className="k2-btn is-quiet" disabled={busy} onClick={() => void run(() => window.api.goals.reopen(goal.id))}>
            Reopen
          </button>
        ) : done === live.length && live.length > 0 ? (
          <button className="k2-btn is-blaze" disabled={busy} onClick={() => void run(() => window.api.goals.close(goal.id, 'achieved'))}>
            Mark summit reached
          </button>
        ) : null}
      </div>

      <div className="k2-mountain-hero">
        <ContourMountain seed={goal.id} title={goal.title} waypoints={live.map((m) => ({ title: m.title, done: m.done }))} />
      </div>

      <div className="k2-stat-line">
        <div className="k2-stat">
          <b>
            {done}/{live.length}
          </b>
          <span>milestones</span>
        </div>
        <div className="k2-stat">
          <b>{goal.habits.filter((h) => h.active).length}</b>
          <span>active habits</span>
        </div>
        {goal.daysToTarget !== null && goal.daysToTarget >= 0 && !closed ? (
          <div className="k2-stat">
            <b>{goal.daysToTarget}</b>
            <span>days to target</span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-x-14 min-[1000px]:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className="min-w-0">
          {goal.roadmap.length > 0 ? (
            <section className="k2-section">
              <h2 className="k2-h2 mb-5">Roadmap</h2>
              <Roadmap stages={goal.roadmap} />
            </section>
          ) : null}

          <section className="k2-section">
            <h2 className="k2-h2 mb-3">Milestones</h2>
            {live.length === 0 ? (
              <p className="k2-muted">No milestones on this mountain.</p>
            ) : (
              <ul className="k2-list">
                {live.map((m) => (
                  <li key={m.id} className={`k2-row !min-h-[56px] ${m.done ? 'is-done' : ''}`}>
                    <button
                      className="k2-check"
                      role="checkbox"
                      aria-checked={m.done}
                      aria-label={m.done ? `Reopen ${m.title}` : `Mark ${m.title} reached`}
                      disabled={busy || closed}
                      onClick={() => void run(() => window.api.todo.setDone(m.id, !m.done))}
                    >
                      <Check size={17} strokeWidth={3} />
                    </button>
                    <span className="k2-row-main k2-row-title !text-[16px]">{m.title}</span>
                    {m.date ? <span className="k2-small tabular-nums">{dayMonth(m.date)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="min-w-0">
          <section className="k2-section">
            <h2 className="k2-h2 mb-3">Habits</h2>
            {goal.habits.length === 0 ? (
              <p className="k2-muted">No habits are tied to this mountain.</p>
            ) : (
              <ul className="k2-list">
                {goal.habits.map((h) => (
                  <li key={h.id} className="k2-row is-link !min-h-[52px]" onClick={() => shell.navigate({ name: 'habit', id: h.id })}>
                    <span className={`k2-blaze ${h.active ? '' : 'is-open'}`} aria-hidden="true" />
                    <span className="k2-row-main">
                      <span className="block font-medium">{h.name}</span>
                      <span className="k2-small">{!h.active ? 'Paused' : h.streak > 0 ? `${h.streak}-day streak` : 'Streak not started'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {goal.resources.length > 0 ? (
            <section className="k2-section">
              <h2 className="k2-h2 mb-3">Resources</h2>
              <ul className="k2-resources">
                {goal.resources.map((r, i) => (
                  <Resource key={i} r={r} />
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
