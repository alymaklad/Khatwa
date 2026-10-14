import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { AchievementView, Attachment, GoalView, JournalEntry, PerformanceDay, PerformanceView } from '@shared/types'
import { useData } from '../../hooks/useData'
import { duration } from '../../lib/format'
import { dayMonth, plural, today } from '../../lib/khatwa'
import { useShell } from '../../khatwa/nav'

const MONTHS = 6

type Month = {
  ym: string
  days: PerformanceDay[]
  minutes: number
  completed: number
  scheduled: number
  reached: { goal: string; title: string; date: string }[]
  summits: string[]
  earned: string[]
  photos: Attachment[]
  pages: JournalEntry[]
}

type Data = { months: Month[] }

function monthsBack(n: number): string[] {
  const d = new Date(`${today().slice(0, 7)}-15T12:00:00`)
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d)
    x.setMonth(d.getMonth() - i)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
  })
}

const monthName = (ym: string): string => new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long' })
const yearOf = (ym: string): string => ym.slice(0, 4)

function build(ym: string, perf: PerformanceView, goals: GoalView[], achievements: AchievementView[], journal: JournalEntry[]): Month {
  const days = perf.monthGrid.filter((d) => d.date.startsWith(ym))
  // Days still ahead are drawn on the calendar but not counted as missed.
  const past = days.filter((d) => d.date <= today())
  const pages = journal.filter((e) => e.date.startsWith(ym))
  return {
    ym,
    days,
    minutes: past.reduce((s, d) => s + d.minutes, 0),
    completed: past.reduce((s, d) => s + d.completed, 0),
    scheduled: past.reduce((s, d) => s + d.scheduled, 0),
    reached: goals.flatMap((g) => g.milestones.filter((m) => m.done && m.date?.startsWith(ym)).map((m) => ({ goal: g.title, title: m.title, date: m.date! }))),
    summits: goals.filter((g) => g.status === 'achieved' && g.closedAt?.startsWith(ym)).map((g) => g.title),
    earned: achievements.filter((a) => a.unlockedAt?.startsWith(ym)).map((a) => a.name),
    photos: pages.flatMap((e) => e.attachments.filter((a) => a.isImage)),
    pages: pages.filter((e) => e.kind !== 'monthly')
  }
}

/** One square per day, Monday first, darker the more of the day's habits were done. */
function Days({ days }: { days: PerformanceDay[] }) {
  if (days.length === 0) return null
  const lead = days[0]!.weekday - 1
  const now = today()
  return (
    <div className="k2-days" aria-hidden="true">
      {Array.from({ length: lead }, (_, i) => (
        <span key={`l${i}`} className="is-empty" />
      ))}
      {days.map((d) => {
        const share = d.scheduled ? d.completed / d.scheduled : 0
        const cls = d.date > now ? 'is-ahead' : share >= 1 ? 'is-full' : d.completed > 0 ? 'is-some' : ''
        return <span key={d.date} className={cls} title={`${dayMonth(d.date)}: ${d.completed} of ${d.scheduled}`} />
      })}
    </div>
  )
}

function Card({ m, current, open, onOpen }: { m: Month; current: boolean; open: boolean; onOpen: () => void }) {
  const highlights = [...m.summits.map((t) => `Summit: ${t}`), ...m.reached.map((r) => r.title), ...m.earned]
  return (
    <button className={`k2-pinned ${open ? 'is-current' : ''}`} aria-expanded={open} onClick={onOpen}>
      <span className="flex items-baseline justify-between gap-2">
        <h3>{monthName(m.ym)}</h3>
        <span className="k2-small">{current ? 'This month' : yearOf(m.ym)}</span>
      </span>
      <span className="k2-small block mt-1">
        {m.completed ? `${m.completed} of ${m.scheduled} done, ${duration(m.minutes)}` : 'A quiet month'}
      </span>
      <Days days={m.days} />
      {highlights.length > 0 ? (
        <ul>
          {highlights.slice(0, 3).map((h, i) => (
            <li key={i}>
              <span className="k2-blaze is-done shrink-0" aria-hidden="true" />
              <span className="min-w-0">{h}</span>
            </li>
          ))}
          {highlights.length > 3 ? <li className="k2-small">and {highlights.length - 3} more</li> : null}
        </ul>
      ) : null}
      {m.photos.length > 0 ? (
        <span className="k2-prints">
          {m.photos.slice(0, 2).map((a) => (
            <span key={a.id} className="k2-print">
              <img src={a.url} alt={a.caption ?? ''} loading="lazy" />
            </span>
          ))}
        </span>
      ) : null}
    </button>
  )
}

function MonthSheet({ m, onClose }: { m: Month; onClose: () => void }) {
  const shell = useShell()
  const rate = m.scheduled ? Math.round((m.completed / m.scheduled) * 100) : null
  return (
    <section className="k2-sheet mt-8 p-7 max-[560px]:p-5" aria-label={`${monthName(m.ym)} ${yearOf(m.ym)}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="k2-title !text-[34px]">
            {monthName(m.ym)} {yearOf(m.ym)}
          </h2>
          <p className="k2-lede !mt-1">{rate === null ? 'Nothing was scheduled.' : `${rate}% of habits done, ${duration(m.minutes)} logged.`}</p>
        </div>
        <button className="k2-btn is-quiet is-small" aria-label="Close month" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="grid gap-x-12 min-[860px]:grid-cols-2">
        <div>
          <h3 className="k2-h2 mt-7 mb-3">Reached</h3>
          {m.summits.length + m.reached.length + m.earned.length === 0 ? (
            <p className="k2-muted m-0">No milestones this month.</p>
          ) : (
            <ul className="k2-list">
              {m.summits.map((t) => (
                <li key={`s${t}`} className="k2-row !min-h-[48px]">
                  <span className="k2-blaze is-done" aria-hidden="true" />
                  <span className="k2-row-main font-semibold">Summit: {t}</span>
                </li>
              ))}
              {m.reached.map((r, i) => (
                <li key={`r${i}`} className="k2-row !min-h-[48px]">
                  <span className="k2-blaze is-done" aria-hidden="true" />
                  <span className="k2-row-main">
                    <span className="block">{r.title}</span>
                    <span className="k2-small">
                      {r.goal}, {dayMonth(r.date)}
                    </span>
                  </span>
                </li>
              ))}
              {m.earned.map((t) => (
                <li key={`a${t}`} className="k2-row !min-h-[48px]">
                  <span className="k2-blaze is-open" aria-hidden="true" />
                  <span className="k2-row-main">Earned {t}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="k2-h2 mt-7 mb-3">Journal</h3>
          {m.pages.length === 0 ? (
            <p className="k2-muted m-0">
              No pages this month.{' '}
              <button className="k2-link" onClick={() => shell.navigate({ name: 'journal' })}>
                Write one
              </button>
            </p>
          ) : (
            <ul className="k2-list">
              {m.pages.slice(0, 6).map((e) => (
                <li key={e.id} className="k2-row is-link !min-h-[48px]" onClick={() => shell.navigate({ name: 'journal' })}>
                  <span className="k2-row-time !w-auto">{dayMonth(e.date)}</span>
                  <span className="k2-row-main truncate font-[var(--k2-serif)]">{e.title?.trim() || e.body.trim().split('\n')[0] || 'Untitled'}</span>
                </li>
              ))}
              {m.pages.length > 6 ? <li className="k2-small pt-2">{plural(m.pages.length - 6, 'more page')}</li> : null}
            </ul>
          )}
        </div>
      </div>

      {m.photos.length > 0 ? (
        <div className="k2-prints mt-6">
          {m.photos.map((a) => (
            <figure key={a.id} className="k2-print m-0">
              <img src={a.url} alt={a.caption ?? a.originalName} loading="lazy" />
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export default function Journey() {
  const shell = useShell()
  const months = useMemo(() => monthsBack(MONTHS), [])
  const [open, setOpen] = useState<string | null>(null)
  const { data, error, refetch } = useData<Data>(async () => {
    const now = today()
    const [goals, achievements, journal, ...perfs] = await Promise.all([
      window.api.goals.list(),
      window.api.view.achievements(),
      window.api.journal.list(),
      ...months.map((ym) => window.api.view.performance(ym === now.slice(0, 7) ? now : `${ym}-15`))
    ])
    return {
      months: months.map((ym, i) => build(ym, perfs[i] as PerformanceView, goals as GoalView[], achievements as AchievementView[], journal as JournalEntry[]))
    }
  }, [months])

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

  const total = data.months.reduce((s, m) => ({ minutes: s.minutes + m.minutes, reached: s.reached + m.reached.length + m.summits.length }), { minutes: 0, reached: 0 })
  const selected = data.months.find((m) => m.ym === open) ?? null

  return (
    <div className="k2-page is-wide">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="k2-title">Journey</h1>
          <p className="k2-lede">
            The last six months: {duration(total.minutes)} on your habits, {plural(total.reached, 'milestone')} reached.
          </p>
        </div>
        <button className="k2-btn is-quiet" onClick={() => shell.navigate({ name: 'review' })}>
          Weekly review
        </button>
      </div>

      {selected ? <MonthSheet m={selected} onClose={() => setOpen(null)} /> : null}

      <div className="k2-board">
        {data.months.map((m, i) => (
          <Card key={m.ym} m={m} current={i === 0} open={open === m.ym} onOpen={() => setOpen(open === m.ym ? null : m.ym)} />
        ))}
      </div>
    </div>
  )
}
