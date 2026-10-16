import { useState, type FormEvent } from 'react'
import { Check, Plus, Timer } from 'lucide-react'
import type { DashboardCard, DashboardView, TodoView } from '@shared/types'
import { useData } from '../../hooks/useData'
import { duration } from '../../lib/format'
import { useShell } from '../../khatwa/nav'

type Data = { day: DashboardView; todos: TodoView }

const isDone = (c: DashboardCard): boolean => c.status === 'complete'

function dateTitle(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function Today() {
  const shell = useShell()
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const { data, error, refetch } = useData<Data>(async () => {
    const [day, todos] = await Promise.all([window.api.view.dashboard(), window.api.view.todos()])
    return { day, todos }
  }, [])

  const run = async (id: number, work: () => Promise<unknown>): Promise<void> => {
    setBusy(id)
    try {
      await work()
    } catch (err) {
      shell.toast('error', 'That did not save', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

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
  if (!data) return <div className="k2-page" aria-busy="true" />

  const cards = [...data.day.cards].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
  const done = cards.filter(isDone).length
  const steps = new Map(data.todos.groups.filter((g) => g.occurrenceId !== null).map((g) => [g.occurrenceId!, g]))
  const manual = data.todos.items.filter((t) => t.kind === 'manual')

  const add = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const title = adding.trim()
    if (!title) return
    await run(-1, async () => {
      await window.api.todo.addManual(title)
      setAdding('')
    })
  }

  return (
    <div className="k2-page">
      <h1 className="k2-title">{dateTitle(data.day.date)}</h1>
      <p className="k2-lede">{cards.length === 0 ? 'Nothing scheduled today.' : done === cards.length ? 'Every habit done. Well climbed.' : `${done} of ${cards.length} done`}</p>

      {cards.length > 0 ? (
        <div className="k2-trail" aria-hidden="true">
          {cards.map((c) => (
            <span key={c.occurrenceId} className={`k2-blaze ${isDone(c) ? 'is-done' : 'is-open'}`} />
          ))}
        </div>
      ) : null}

      <section className="k2-section">
        <div className="k2-section-head">
          <h2 className="k2-h2">Habits</h2>
          <a
            className="k2-link text-[15px]"
            href="/habits?edit=new"
            onClick={(e) => {
              e.preventDefault()
              shell.navigate({ name: 'habits', edit: 'new' })
            }}
          >
            New habit
          </a>
        </div>
        {cards.length === 0 ? (
          <div className="k2-empty">
            <p className="k2-h2">Start with one small habit</p>
            <p className="m-0">Or plan a mountain and let Khatwa suggest the habits.</p>
            <div className="flex flex-wrap justify-center gap-3 mt-5">
              <button className="k2-btn" onClick={() => shell.navigate({ name: 'habits', edit: 'new' })}>
                Add a habit
              </button>
              <button className="k2-btn is-quiet" onClick={() => shell.navigate({ name: 'expedition' })}>
                Plan a mountain
              </button>
            </div>
          </div>
        ) : (
          <ul className="k2-list">
            {cards.map((c) => {
              const finished = isDone(c)
              const group = steps.get(c.occurrenceId)
              return (
                <li key={c.occurrenceId} className={`k2-row ${finished ? 'is-done' : ''}`}>
                  <button
                    className="k2-check"
                    role="checkbox"
                    aria-checked={finished}
                    aria-label={finished ? `Mark ${c.name} not done` : `Mark ${c.name} done`}
                    disabled={busy === c.occurrenceId}
                    onClick={() => void run(c.occurrenceId, () => window.api.occurrence.setCompleted(c.occurrenceId, !finished))}
                  >
                    <Check size={17} strokeWidth={3} />
                  </button>
                  <span className="k2-row-time">{c.scheduledTime}</span>
                  <button className="k2-row-main text-left" onClick={() => shell.navigate({ name: 'habit', id: c.habitId })}>
                    <span className="k2-row-title block">{c.name}</span>
                    <span className="k2-small">
                      <span className="k2-narrow">{c.scheduledTime}, </span>
                      {c.loggedMinutes > 0 ? `${duration(c.loggedMinutes)} of ${duration(c.targetMinutes)}` : duration(c.targetMinutes)}
                      {group && group.total > 0 ? `, ${group.done} of ${group.total} steps` : ''}
                      {c.streak > 1 ? `, ${c.streak}-day streak` : ''}
                    </span>
                  </button>
                  {!finished ? (
                    <button className={`k2-btn is-small ${c.timerRunning ? 'is-blaze' : 'is-quiet'}`} onClick={() => shell.openSession(c.occurrenceId)}>
                      <Timer size={15} />
                      {c.timerRunning ? 'Running' : 'Start'}
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="k2-section">
        <div className="k2-section-head">
          <h2 className="k2-h2">To-do</h2>
          {manual.length > 0 ? (
            <span className="k2-small">
              {data.todos.manualDone} of {data.todos.manualTotal} done
            </span>
          ) : null}
        </div>
        <ul className="k2-list">
          {manual.map((t) => (
            <li key={t.id} className={`k2-row !min-h-[52px] ${t.done ? 'is-done' : ''}`}>
              <button
                className="k2-check is-small"
                role="checkbox"
                aria-checked={t.done}
                aria-label={t.done ? `Reopen ${t.title}` : `Mark ${t.title} done`}
                disabled={busy === t.id}
                onClick={() => void run(t.id, () => window.api.todo.setDone(t.id, !t.done))}
              >
                <Check size={14} strokeWidth={3} />
              </button>
              <span className="k2-row-main">
                <span className="k2-row-title !text-[16px] !font-normal block">{t.title}</span>
                {t.carried > 0 && !t.done ? <span className="k2-small">Carried over {t.carried === 1 ? 'from yesterday' : `${t.carried} days`}</span> : null}
              </span>
            </li>
          ))}
          <li className="k2-row !min-h-[52px]">
            <form className="flex items-center gap-3 w-full" onSubmit={(e) => void add(e)}>
              <Plus size={18} className="text-[var(--k2-faint)] shrink-0 ml-[3px]" aria-hidden="true" />
              <input
                className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-[var(--k2-faint)]"
                placeholder="Add a to-do"
                aria-label="Add a to-do"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
              />
              {adding.trim() ? (
                <button className="k2-btn is-small" type="submit" disabled={busy === -1}>
                  Add
                </button>
              ) : null}
            </form>
          </li>
        </ul>
      </section>
    </div>
  )
}
